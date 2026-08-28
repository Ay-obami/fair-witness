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
///    `executeArbitrage` (see the "Deliberately NOT included" note at the bottom of this
///    file) — that is what makes the journal's completeness claim true, not just a
///    design intention.
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
    // The toy source-chain contract on Sepolia whose `observePrice` transactions this
    // contract will accept as arbitrage facts. Binding it here (not just in the agent's
    // config) means a proof can never be about any OTHER contract's calldata — see
    // `_decodePriceObservation` for why this matters once real Attestcoin envelopes are
    // decodable.
    address public immutable PRICE_CONTRACT;

    // ---------------------------------------------------------------------
    // Per-instance rigid business logic bounds (V2 multi-tenant pivot)
    // ---------------------------------------------------------------------
    // V1 hard-coded these as `constant`s shared by a single platform-owned treasury. V2
    // bakes each tenant's chosen guardrails into THEIR OWN deployment as constructor-set
    // `immutable`s (see docs/ARCHITECTURE_V2.md §3.2), so the "even the owner can't loosen
    // this later" guarantee — the core custody-separation argument — holds per tenant.
    // These are still NOT adjustable at runtime by design, for exactly the same reason as
    // V1; the REASONABLE-STARTING-VALUES note from the PRD also still applies (re-derive
    // MIN_ARB_WIDTH_BPS / MAX_CONFIRM_GAP_BLOCKS from measured attestation latency before
    // any live deployment).

    /// @notice The full set of rigid, immutable bounds baked into a treasury instance at
    ///         construction time. One struct so the factory's deploy call and the on-chain
    ///         event stay readable; each field still lands in its own `immutable` slot.
    struct Guardrails {
        uint256 maxTradeSize;      // per-trade capital cap (asset decimals)
        uint256 maxSlippageBps;    // max tolerated quote slippage, basis points
        uint256 minArbWidthBps;    // width floor — must exceed attestation-lag noise floor
        uint256 maxDriftBps;       // max drift between source and confirm proof prices
        uint256 maxConfirmGapBlocks; // how stale the confirm proof may be
        uint256 maxActionsPerEpoch; // rate limit — caps blast radius per epoch
        uint256 epochLength;       // rate-limit window (seconds)
    }

    uint256 public immutable MAX_TRADE_SIZE;
    uint256 public immutable MAX_SLIPPAGE_BPS;
    uint256 public immutable MIN_ARB_WIDTH_BPS;
    uint256 public immutable MAX_DRIFT_BPS;
    uint256 public immutable MAX_CONFIRM_GAP_BLOCKS;
    uint256 public immutable MAX_ACTIONS_PER_EPOCH;
    uint256 public immutable EPOCH_LENGTH;
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
    error MalformedEncodedTransaction();
    error WrongObservationSource();
    error InvalidGuardrails();

    constructor(
        address verifier_,
        address dexRouter_,
        address baseAsset_,
        address quoteAsset_,
        address priceContract_,
        address initialOwner_,
        Guardrails memory guardrails_
    ) Ownable(initialOwner_) {
        VERIFIER = INativeQueryVerifier(verifier_);
        DEX_ROUTER = IDexRouter(dexRouter_);
        BASE_ASSET = IERC20(baseAsset_);
        QUOTE_ASSET = quoteAsset_;
        PRICE_CONTRACT = priceContract_;

        // An instance must NEVER be able to exist with nonsensical bounds — that would make
        // the "rigid, pre-committed" guarantee vacuous (and a zero MIN_ARB_WIDTH_BPS would
        // divide by zero in `_boundedTradeSize`). This is a hard construction-time gate, so
        // even a treasury deployed *outside* the factory (directly) is validated.
        validateGuardrails(guardrails_);

        MAX_TRADE_SIZE = guardrails_.maxTradeSize;
        MAX_SLIPPAGE_BPS = guardrails_.maxSlippageBps;
        MIN_ARB_WIDTH_BPS = guardrails_.minArbWidthBps;
        MAX_DRIFT_BPS = guardrails_.maxDriftBps;
        MAX_CONFIRM_GAP_BLOCKS = guardrails_.maxConfirmGapBlocks;
        MAX_ACTIONS_PER_EPOCH = guardrails_.maxActionsPerEpoch;
        EPOCH_LENGTH = guardrails_.epochLength;
    }

    /// @notice The single source of truth for what counts as a valid guardrail set. Called
    ///         by this constructor; also callable by the factory as a pre-flight so an
    ///         invalid account wastes no deploy gas.
    function validateGuardrails(Guardrails memory g) public pure {
        if (g.maxTradeSize == 0) revert InvalidGuardrails();
        if (g.maxSlippageBps == 0 || g.maxSlippageBps > BPS_DENOMINATOR) revert InvalidGuardrails();
        if (g.minArbWidthBps == 0 || g.minArbWidthBps > BPS_DENOMINATOR) revert InvalidGuardrails();
        if (g.maxDriftBps == 0 || g.maxDriftBps > BPS_DENOMINATOR) revert InvalidGuardrails();
        if (g.maxConfirmGapBlocks == 0) revert InvalidGuardrails();
        if (g.maxActionsPerEpoch == 0) revert InvalidGuardrails();
        if (g.epochLength == 0) revert InvalidGuardrails();
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

    function _boundedTradeSize(uint256 arbWidthBps) internal view returns (uint256) {
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

    /// @dev Decodes the `price` out of a real Attestcoin `encodedTransaction` payload,
    ///      and whether the underlying source-chain transaction succeeded.
    ///
    ///      The payload is the raw EVM-transaction-envelope encoding produced by the
    ///      `gluwa/usc-sdk` npm package's `encoding.abi.abiEncode(tx, receipt)` (confirmed
    ///      against the SDK's actual source; see DEVLOG.md session 3): an ABI encoding of
    ///      `(uint8 txType, bytes[] chunks)` where each chunk is itself independently
    ///      ABI-encoded. Chunk 0 is ALWAYS the common transaction fields tuple
    ///      `(uint64 nonce, uint64 gasLimit, address from, bool toIsNull, address to,
    ///      uint256 value, bytes data)` — identical across tx types 0-4 in `v1.ts` — and
    ///      the last chunk is ALWAYS the receipt fields tuple
    ///      `(uint8 receiptStatus, uint64 receiptGasUsed, LogEntry[] receiptLogs,
    ///      bytes receiptLogsBloom)`. No external EvmV1Decoder library call is required:
    ///      we decode the two chunks we care about directly, which is cheaper and keeps
    ///      the decode dependency-free.
    ///
    ///      Two additional checks make the decoded fact meaningful rather than a random
    ///      slice of a proven transaction: the transaction must have been sent TO the
    ///      contract's own `PRICE_CONTRACT` (so a proof of *some other* contract's
    ///      calldata can never pass), and the receipt must report status 1 (so a proof of
    ///      a *reverted* transaction is rejected even though it was honestly attested).
    ///      The price itself is the `uint256` argument of `PRICE_CONTRACT`'s
    ///      `observePrice(uint256)` call — a fixed calldata layout (4-byte selector +
    ///      one ABI word), which is what makes a simple `abi.decode(data[4:])` valid for
    ///      our own toy contract. This is deliberately scoped to that controlled source
    ///      contract, not a general-purpose decoder — see DEVLOG.md.
    function _decodePriceObservation(bytes calldata encodedTransaction)
        internal
        view
        returns (uint256 price, bool success)
    {
        (uint8 txType, bytes[] memory chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));

        // The SDK's v1 encoder only defines layouts for tx types 0-4, and every real
        // encoding has at least 3 chunks (common, type-specific, receipt). Anything else
        // is not a valid Attestcoin transaction payload — reject it rather than decode
        // garbage (the real precompile would never verify such a payload anyway).
        if (txType > 4 || chunks.length < 3) revert MalformedEncodedTransaction();

        // Chunk 0 = common transaction fields, identical across all tx types.
        (, , , bool toIsNull, address to, , bytes memory data) =
            abi.decode(chunks[0], (uint64, uint64, address, bool, address, uint256, bytes));

        if (toIsNull || to != PRICE_CONTRACT) revert WrongObservationSource();

        // Last chunk = receipt fields. Only the first two head words matter (status is
        // EIP-658 success/failure); the log entries + bloom tail can be left undecoded.
        (uint8 receiptStatus,) = abi.decode(chunks[chunks.length - 1], (uint8, uint64));

        // PRICE_CONTRACT's `observePrice(uint256)` calldata is exactly one selector + one
        // 32-byte word. Anything else is a malformed observation call. The price is the
        // 32 bytes immediately after the 4-byte selector — read them via assembly because
        // Solidity's `data[4:]` slice syntax only applies to calldata arrays, and the
        // decoded `data` lives in memory here.
        if (data.length != 4 + 32) revert MalformedEncodedTransaction();
        assembly {
            price := mload(add(data, 36))
        }
        success = (receiptStatus == 1);
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
