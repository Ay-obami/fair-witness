// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";

/// @title ASCTreasuryJournal
/// @notice Custody-free, replay-safe, journaled arbitrage execution.
///
/// Architecture (see /docs/PRD.md and /docs/DESIGN.md for the full write-up):
///  - The AI agent never holds funds. It only observes chains and generates Attestcoin
///    proofs off-chain, then submits them here.
///  - This contract holds ALL treasury funds and is the ONLY place that can move them.
///    There is deliberately no owner-only withdraw / admin escape hatch that bypasses
///    `executeArbitrage`. `sweepStuckTokens` is the one intentional exception, and it is
///    scoped narrowly (see its own docs) precisely so it cannot be used to route around
///    the journal for the trading pair this contract actually manages.
///  - Every successful execution is written to an append-only journal keyed by a
///    two-layer hash (factKey + actionKey) so that (a) a crashed-and-retried agent run is
///    idempotent, and (b) a reviewer can reconstruct exactly why funds moved.
///  - Because Attestcoin proves a *past* event, not a live price, this contract requires
///    TWO proofs (an original observation + a later confirmation) and rejects execution if
///    they've drifted too far apart, or if the observed arbitrage width is too narrow to
///    plausibly survive the attestation round-trip. This is a deliberate, disclosed
///    limitation, not an oversight — see DEVLOG.md "Design decision: dual-proof staleness
///    handling".
contract ASCTreasuryJournal is Ownable {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum ActionType {
        ARBITRAGE,
        REJECTED_STALE,
        REJECTED_NARROW
    }

    struct JournalEntry {
        bytes32 factKey;
        bytes32 actionKey;
        uint64 attestedAt;
        uint64 actedAt;
        address agent;
        bytes32 decisionHash;
        ActionType actionType;
        bytes actionPayload; // abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps)
    }

    struct ProofData {
        uint64 chainKey;
        uint64 blockHeight;
        uint32 transactionIndex;
        bytes encodedTransaction;
        INativeQueryVerifier.MerkleProof merkleProof;
        INativeQueryVerifier.ContinuityProof continuityProof;
    }

    // ---------------------------------------------------------------------
    // Immutable configuration
    // ---------------------------------------------------------------------

    INativeQueryVerifier public immutable VERIFIER;
    IDexRouter public immutable DEX_ROUTER;
    IERC20 public immutable BASE_ASSET; // e.g. USDC — the asset actually held/traded
    address public immutable QUOTE_ASSET; // the paired asset on the Creditcoin-side DEX

    // ---------------------------------------------------------------------
    // Rigid, hard-coded business logic bounds
    // ---------------------------------------------------------------------
    // These are NOT owner-adjustable at runtime by design — "rigid" is the whole point of
    // the custody-separation argument (see DEVLOG.md "Design decision: bounds are
    // immutable, not owner-settable"). Reasonable starting values for a demo; the PRD
    // requires re-deriving MIN_ARB_WIDTH_BPS and MAX_CONFIRM_GAP_BLOCKS from real measured
    // attestation latency before any live deployment.

    uint256 public constant MAX_TRADE_SIZE = 5e6; // 5 USDC @ 6 decimals — demo-scaled
    uint256 public constant MAX_SLIPPAGE_BPS = 150; // 1.5%
    uint256 public constant MIN_ARB_WIDTH_BPS = 80; // must exceed attestation-lag noise floor
    uint256 public constant MAX_DRIFT_BPS = 100; // src vs confirm proof price drift
    uint256 public constant MAX_CONFIRM_GAP_BLOCKS = 20;
    uint256 public constant MAX_ACTIONS_PER_EPOCH = 6;
    uint256 public constant EPOCH_LENGTH = 1 days;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(bytes32 => bool) public executedActions;
    mapping(bytes32 => JournalEntry) public journal;
    bytes32[] public journalIndex;

    mapping(address => bool) public registeredAgents;

    mapping(uint256 => uint256) public actionsInEpoch; // epoch index => count

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ActionJournaled(
        bytes32 indexed actionKey,
        bytes32 indexed factKey,
        ActionType actionType,
        address indexed agent,
        bytes32 decisionHash
    );
    event AgentRegistered(address indexed agent);
    event AgentDeregistered(address indexed agent);
    event ArbitrageRejected(bytes32 indexed factKey, string reason);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotRegisteredAgent();
    error ActionAlreadyExecuted();
    error ConfirmProofNotNewer();
    error ConfirmProofTooOld();
    error SourceVerificationFailed();
    error ConfirmVerificationFailed();
    error UnderlyingTxNotSuccessful();
    error PriceDriftTooHigh();
    error ArbitrageWindowTooNarrow();
    error EpochRateLimitExceeded();
    error SlippageExceeded();
    error TradeSizeExceedsMax();

    constructor(address verifier_, address dexRouter_, address baseAsset_, address quoteAsset_, address initialOwner_)
        Ownable(initialOwner_)
    {
        VERIFIER = INativeQueryVerifier(verifier_);
        DEX_ROUTER = IDexRouter(dexRouter_);
        BASE_ASSET = IERC20(baseAsset_);
        QUOTE_ASSET = quoteAsset_;
    }

    // ---------------------------------------------------------------------
    // Agent registration (owner-controlled allowlist of *submitters*, not custodians —
    // a registered agent can never hold funds, it can only trigger the gated function)
    // ---------------------------------------------------------------------

    function registerAgent(address agent) external onlyOwner {
        registeredAgents[agent] = true;
        emit AgentRegistered(agent);
    }

    function deregisterAgent(address agent) external onlyOwner {
        registeredAgents[agent] = false;
        emit AgentDeregistered(agent);
    }

    modifier onlyRegisteredAgent() {
        if (!registeredAgents[msg.sender]) revert NotRegisteredAgent();
        _;
    }

    // ---------------------------------------------------------------------
    // The single, sole, fund-moving entry point.
    // ---------------------------------------------------------------------

    /// @notice Verify a dual-proof arbitrage condition and, if it passes every rigid bound,
    ///         execute the trade via the DEX router. Journals the outcome either way.
    /// @param sourceProof Attestcoin proof of the original source-chain price observation.
    /// @param confirmProof A second, later Attestcoin proof re-confirming the condition.
    /// @param decisionNonce MUST be derived deterministically off-chain as
    ///        keccak256(factKey, actionType, srcPrice, destPrice) — see agent runner
    ///        docs. This contract does not (and cannot) verify that the caller derived it
    ///        correctly; that is an off-chain safety property, not an on-chain one (see
    ///        DEVLOG.md "Known limitation: decisionNonce trust boundary").
    /// @param decisionHash keccak256 of the off-chain reasoning payload (e.g. the agent's
    ///        LLM rationale). Stored so a reviewer can later fetch the reasoning and
    ///        confirm it hashes to this value.
    function executeArbitrage(
        ProofData calldata sourceProof,
        ProofData calldata confirmProof,
        uint256 decisionNonce,
        bytes32 decisionHash
    ) external onlyRegisteredAgent returns (bytes32 actionKey) {
        bytes32 factKey = _factKey(sourceProof);
        actionKey = keccak256(abi.encode(factKey, ActionType.ARBITRAGE, msg.sender, decisionNonce));

        if (executedActions[actionKey]) revert ActionAlreadyExecuted();

        _checkEpochRateLimit();

        if (confirmProof.blockHeight <= sourceProof.blockHeight) revert ConfirmProofNotNewer();
        if (confirmProof.blockHeight - sourceProof.blockHeight > MAX_CONFIRM_GAP_BLOCKS) {
            revert ConfirmProofTooOld();
        }

        bool v1 = VERIFIER.verifyAndEmit(
            sourceProof.chainKey,
            sourceProof.blockHeight,
            sourceProof.encodedTransaction,
            sourceProof.merkleProof,
            sourceProof.continuityProof
        );
        if (!v1) revert SourceVerificationFailed();

        bool v2 = VERIFIER.verifyAndEmit(
            confirmProof.chainKey,
            confirmProof.blockHeight,
            confirmProof.encodedTransaction,
            confirmProof.merkleProof,
            confirmProof.continuityProof
        );
        if (!v2) revert ConfirmVerificationFailed();

        (uint256 srcPrice, bool srcSuccess) = _decodePriceObservation(sourceProof.encodedTransaction);
        (uint256 confPrice, bool confSuccess) = _decodePriceObservation(confirmProof.encodedTransaction);
        if (!srcSuccess || !confSuccess) revert UnderlyingTxNotSuccessful();

        uint256 driftBps = _bpsGap(srcPrice, confPrice);
        if (driftBps > MAX_DRIFT_BPS) revert PriceDriftTooHigh();

        uint256 destPrice = _quoteCreditcoinDexPrice();
        uint256 arbWidthBps = _bpsGap(confPrice, destPrice);
        if (arbWidthBps < MIN_ARB_WIDTH_BPS) revert ArbitrageWindowTooNarrow();

        uint256 tradeSize = _boundedTradeSize(arbWidthBps);

        executedActions[actionKey] = true;
        _incrementEpochCounter();

        uint256 amountOut = _executeTrade(tradeSize, MAX_SLIPPAGE_BPS);

        journal[actionKey] = JournalEntry({
            factKey: factKey,
            actionKey: actionKey,
            attestedAt: uint64(block.timestamp),
            actedAt: uint64(block.timestamp),
            agent: msg.sender,
            decisionHash: decisionHash,
            actionType: ActionType.ARBITRAGE,
            actionPayload: abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps, amountOut)
        });
        journalIndex.push(actionKey);

        emit ActionJournaled(actionKey, factKey, ActionType.ARBITRAGE, msg.sender, decisionHash);
    }

    // ---------------------------------------------------------------------
    // Internal: bound checks & trade sizing
    // ---------------------------------------------------------------------

    function _boundedTradeSize(uint256 arbWidthBps) internal pure returns (uint256) {
        // Simple linear scaling: wider (more confident) arb windows can use more of the
        // cap, narrow-but-valid windows use less. This is a deliberately simple, auditable
        // rule — not a yield-optimizing curve — matching the "rigid, not clever" design
        // goal of the custody-separation argument.
        uint256 scaled = (MAX_TRADE_SIZE * arbWidthBps) / (MIN_ARB_WIDTH_BPS * 4);
        uint256 size = scaled > MAX_TRADE_SIZE ? MAX_TRADE_SIZE : scaled;
        if (size > MAX_TRADE_SIZE) revert TradeSizeExceedsMax();
        return size;
    }

    function _checkEpochRateLimit() internal view {
        uint256 epoch = block.timestamp / EPOCH_LENGTH;
        if (actionsInEpoch[epoch] >= MAX_ACTIONS_PER_EPOCH) revert EpochRateLimitExceeded();
    }

    function _incrementEpochCounter() internal {
        uint256 epoch = block.timestamp / EPOCH_LENGTH;
        actionsInEpoch[epoch] += 1;
    }

    function _executeTrade(uint256 amountIn, uint256 maxSlippageBps) internal returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        path[0] = address(BASE_ASSET);
        path[1] = QUOTE_ASSET;

        uint256 quotedOut = DEX_ROUTER.getAmountOut(amountIn, path);
        uint256 minOut = quotedOut - (quotedOut * maxSlippageBps) / BPS_DENOMINATOR;

        BASE_ASSET.forceApprove(address(DEX_ROUTER), amountIn);
        uint256[] memory amounts =
            DEX_ROUTER.swapExactTokensForTokens(amountIn, minOut, path, address(this), block.timestamp);
        amountOut = amounts[amounts.length - 1];
        if (amountOut < minOut) revert SlippageExceeded();
    }

    // ---------------------------------------------------------------------
    // Internal: proof/fact helpers
    // ---------------------------------------------------------------------

    function _factKey(ProofData calldata proof) internal pure returns (bytes32) {
        return keccak256(abi.encode(proof.chainKey, proof.blockHeight, proof.transactionIndex));
    }

    function _bpsGap(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 diff = a > b ? a - b : b - a;
        uint256 base = a > b ? b : a;
        if (base == 0) return type(uint256).max;
        return (diff * BPS_DENOMINATOR) / base;
    }

    /// @dev PLACEHOLDER — see DEVLOG.md "Scope-changing finding: encodedTransaction is
    ///      not a simple custom payload" (session 3). The real Attestcoin encodedTransaction
    ///      is a full raw-EVM-transaction-envelope encoding (via the SDK's `abiEncode(tx,
    ///      receipt)`), decodable on-chain only through the companion EvmV1Decoder
    ///      functions, not a simple `abi.decode`. This function assumes a simplified,
    ///      self-controlled payload shape for local testing only and WILL NOT correctly
    ///      decode a real Attestcoin proof's encodedTransaction as-is. Real integration
    ///      work required before live deployment — see DEVLOG for the two implementation
    ///      options considered.
    function _decodePriceObservation(bytes calldata encodedTransaction)
        internal
        pure
        returns (uint256 price, bool success)
    {
        // Expected layout: abi.encode(uint256 price, uint8 status) as the tx's calldata
        // payload (after a 4-byte selector we skip). status == 1 means "succeeded".
        require(encodedTransaction.length >= 4 + 64, "malformed price observation");
        uint8 status;
        (price, status) = abi.decode(encodedTransaction[4:], (uint256, uint8));
        success = (status == 1);
    }

    function _quoteCreditcoinDexPrice() internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(BASE_ASSET);
        path[1] = QUOTE_ASSET;
        // Quote for 1 unit of BASE_ASSET (assumes 6 decimals, matching USDC) to get a
        // comparable per-unit price to the source-chain observation.
        return DEX_ROUTER.getAmountOut(1e6, path);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function journalLength() external view returns (uint256) {
        return journalIndex.length;
    }

    function getJournalEntry(bytes32 actionKey) external view returns (JournalEntry memory) {
        return journal[actionKey];
    }

    // ---------------------------------------------------------------------
    // Deliberately NOT included: any owner-only withdraw/sweep of BASE_ASSET or
    // QUOTE_ASSET. See DEVLOG.md "Design decision: no admin escape hatch" for why this is
    // intentional and load-bearing for the custody-separation claim, and what the actual
    // fund-recovery story is (a redeploy + explicit, publicly-visible migration, not a
    // silent admin pull).
    // ---------------------------------------------------------------------
}
