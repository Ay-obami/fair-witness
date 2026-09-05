// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
contract ASCTreasuryJournal is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    // Rejections are intentionally NOT journaled — they revert, only executions get a
    // structured JournalEntry, and rejected attempts remain visible on-chain as failed
    // transactions (see docs/ARCHITECTURE_V2.md §4). The REJECTED_STALE/REJECTED_NARROW
    // values that used to sit here were never constructed anywhere; they only implied
    // an on-chain rejection-tracking capability that does not exist, so they were
    // removed (IMPLEMENTATION_PLAN.md Task D).
    enum ActionType {
        ARBITRAGE
    }

    /// @notice Which way the destination-DEX leg trades (Tasks 3.3/3.5). The gap's SIGN
    ///         decides which of these the evidence supports; the caller proposes one and
    ///         the contract validates it against the attested/live prices before trading.
    enum TradeDirection {
        SellBaseForQuote, // sell BASE for QUOTE — valid when destPrice > confPrice
        BuyBaseForQuote   // buy BASE with QUOTE — valid when destPrice < confPrice
    }

    struct JournalEntry {
        bytes32 factKey;
        bytes32 actionKey;
        uint64 attestedAt;
        uint64 actedAt;
        address agent;
        bytes32 decisionHash;
        ActionType actionType;
        bytes actionPayload; // abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps, amountOut, direction)
        // Task 3.6: explicit evidence identifiers. factKey only COMMITS to the source
        // location as a hash — these make the actual values readable from the journal,
        // and record the confirmation leg (whose proof was previously used transiently
        // and stored nowhere). With these, the evidence chain is reconstructible from
        // the journal alone. The one exception is the destination execution tx hash,
        // which the EVM cannot observe from inside a transaction: it is the hash of the
        // transaction whose receipt carries this actionKey's ActionJournaled event,
        // discoverable from any explorer (documented, not storable).
        uint64 sourceChainKey;
        uint64 sourceBlockHeight;
        uint32 sourceTxIndex;
        uint64 confirmBlockHeight; // confirm chainKey == source chainKey, enforced on-chain
        uint32 confirmTxIndex;
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
    // Net-profitability reserve (Task 3.4): platform-level bps subtracted from the
    // gross arbitrage width before the per-instance MIN_ARB_WIDTH_BPS floor is
    // applied. A gross gap can still be net-unprofitable once fees/slippage/gas
    // are paid, so approval requires gross >= MIN_ARB_WIDTH_BPS + MIN_NET_EDGE_BPS.
    // Protocol-wide (not owner-set) so no deployment can loosen it; the per-instance
    // floor remains the owner's immutable choice on top of this reserve.
    uint256 private constant MIN_NET_EDGE_BPS = 25;
    /// @dev BASE_ASSET's decimals (USDC-like, 6) — the unit `_quoteCreditcoinDexPrice`
    ///      quotes one unit in, and the denominator when valuing a BASE-denominated
    ///      trade size into a QUOTE input for the buy direction (Task 3.3).
    uint256 private constant BASE_UNIT = 1e6;
    /// @dev The only calldata shape `_decodePriceObservation` accepts from PRICE_CONTRACT:
    ///      an `observePrice(uint256)` call (Task 3.6 — the selector is verified, not
    ///      assumed from the calldata length).
    bytes4 private constant OBSERVE_PRICE_SELECTOR = bytes4(keccak256("observePrice(uint256)"));

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
    // (No ArbitrageRejected event: it was declared but never emitted — rejections
    // revert and are intentionally not journaled. Removed for the same reason as the
    // REJECTED_* enum values above; see IMPLEMENTATION_PLAN.md Task D.)

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotRegisteredAgent();
    error ActionAlreadyExecuted();
    error ConfirmProofNotNewer();
    error ConfirmProofTooOld();
    error ChainMismatch();
    error SourceVerificationFailed();
    error ConfirmVerificationFailed();
    error UnderlyingTxNotSuccessful();
    error PriceDriftTooHigh();
    error ArbitrageWindowTooNarrow();
    error EpochRateLimitExceeded();
    error SlippageExceeded();
    // TradeSizeExceedsMax was removed: it guarded an unreachable branch in
    // _boundedTradeSize (`size` is already clamped to MAX_TRADE_SIZE, so the check
    // could never fire) — dead code implying a validation that cannot trigger.
    error MalformedEncodedTransaction();
    error WrongObservationSource();
    error WrongObservationSelector();
    error InvalidGuardrails();
    error InvalidChainConfig();
    error CannotRenounceOwnership();
    error WrongTradeDirection();
    error InsufficientAssetBalance();
    error ZeroTradeSize();

    constructor(
        address verifier_,
        address dexRouter_,
        address baseAsset_,
        address quoteAsset_,
        address priceContract_,
        address initialOwner_,
        Guardrails memory guardrails_
    ) Ownable(initialOwner_) {
        // Mirror the factory's dependency validation (ASCTreasuryFactory's
        // InvalidChainConfig gate, IMPLEMENTATION_PLAN.md Task 3.8): a treasury
        // deployed directly — outside the factory — must not be able to exist with a
        // zero dependency address either. This closes the validation drift between
        // the two deployment paths.
        if (
            verifier_ == address(0) || dexRouter_ == address(0) || baseAsset_ == address(0)
                || quoteAsset_ == address(0) || priceContract_ == address(0)
        ) revert InvalidChainConfig();

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
        // maxTradeSize < 4 would let _boundedTradeSize floor to zero at the minimum
        // arb width: scaled = maxTradeSize * arbWidthBps / (minArbWidthBps * 4) with
        // arbWidthBps == minArbWidthBps floors to maxTradeSize / 4, i.e. a treasury
        // that can never trade. Constrain it at configuration time (Task 3.8) rather
        // than validating per-execution. Real guardrail values are asset-decimal
        // amounts (single-digit USDC = millions of base units), so this only rejects
        // nonsensical configurations.
        if (g.maxTradeSize < 4) revert InvalidGuardrails();
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

    /// @notice Renouncing ownership would leave any registered agent authorized
    ///         forever, with no owner left able to deregister it (Task 3.9), so it is
    ///         permanently disabled. Decommissioning a treasury is a redeploy, per the
    ///         same no-escape-hatch design as the absent admin withdraw.
    function renounceOwnership() public pure override {
        revert CannotRenounceOwnership();
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
    /// @param decisionNonce Retained for off-chain determinism and bookkeeping — the
    ///        agent derives it as keccak256(factKey, actionType, srcPrice, destPrice)
    ///        so a crashed-and-retried run reproduces identical calldata — but it NO
    ///        LONGER participates in on-chain identity (accepted and ignored for the
    ///        actionKey). This closes the old `decisionNonce` trust boundary (see
    ///        DEVLOG.md "Known limitation: decisionNonce trust boundary"): the nonce
    ///        could previously be varied to mint a fresh actionKey for an
    ///        already-executed fact.
    /// @param direction Which way to trade, proposed by the agent and validated on-chain
    ///        against the attested/live price relationship (Task 3.5): SellBaseForQuote
    ///        requires destPrice > confPrice, BuyBaseForQuote requires destPrice <
    ///        confPrice. The actionKey deliberately does NOT include the direction —
    ///        one execution per fact, whichever direction the evidence supports at
    ///        execution time (Task 3.1).
    /// @param decisionHash keccak256 of the off-chain reasoning payload (e.g. the agent's
    ///        LLM rationale). Stored so a reviewer can later fetch the reasoning and
    ///        confirm it hashes to this value.
    function executeArbitrage(
        ProofData calldata sourceProof,
        ProofData calldata confirmProof,
        uint256 decisionNonce,
        bytes32 decisionHash,
        TradeDirection direction
    ) external onlyRegisteredAgent nonReentrant returns (bytes32 actionKey) {
        bytes32 factKey = _factKey(sourceProof);
        // One execution per fact per instance, by construction: the key binds ONLY the
        // instance (address(this)), the fact, and the action type — NOT the caller and
        // NOT the caller-supplied nonce (Task 3.1). Two different registered agents,
        // or the same agent varying the nonce, therefore collide on the same key and
        // the second submission reverts with ActionAlreadyExecuted instead of each
        // minting its own key. Off-chain callers derive the identical key via
        // agent/src/keys.ts; `nonReentrant` adds an explicit second layer on top of
        // the executedActions-flag-before-external-call ordering below.
        actionKey = keccak256(abi.encode(address(this), factKey, ActionType.ARBITRAGE));

        if (executedActions[actionKey]) revert ActionAlreadyExecuted();

        _checkEpochRateLimit();

        if (confirmProof.blockHeight <= sourceProof.blockHeight) revert ConfirmProofNotNewer();
        if (confirmProof.blockHeight - sourceProof.blockHeight > MAX_CONFIRM_GAP_BLOCKS) {
            revert ConfirmProofTooOld();
        }

        // Task 3.6: the confirmation must re-observe the SAME chain the source fact
        // lives on. Each proof verifies honestly on its own, so without this check two
        // honestly-attested proofs from two DIFFERENT chains could pair up and pass the
        // drift comparison. Structural relationship first — fail before spending any
        // verification work.
        if (confirmProof.chainKey != sourceProof.chainKey) revert ChainMismatch();

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

        // Task 3.5: the SIGN of (destPrice - confPrice) is which direction the evidence
        // supports — destPrice > confPrice means BASE is expensive on the DEX (sell it
        // there); destPrice < confPrice means BASE is cheap there (buy it). The caller
        // must propose exactly that direction; the opposite one is economically a loss
        // against the same evidence and is rejected, not executed. A zero gap falls
        // through to the width check, which reverts on a zero edge.
        if (destPrice > confPrice && direction != TradeDirection.SellBaseForQuote) {
            revert WrongTradeDirection();
        }
        if (destPrice < confPrice && direction != TradeDirection.BuyBaseForQuote) {
            revert WrongTradeDirection();
        }

        // Direction-aware edge (Task 3.5): extra value received per unit of value
        // input, vs. the attested reference. Sell: reference value confPrice, actual
        // proceeds destPrice. Buy: cost destPrice, reference value confPrice. (This
        // replaces the old symmetric `_bpsGap` denominator, which lost the sign.)
        uint256 arbWidthBps;
        if (direction == TradeDirection.SellBaseForQuote) {
            arbWidthBps = ((destPrice - confPrice) * BPS_DENOMINATOR) / confPrice;
        } else {
            arbWidthBps = ((confPrice - destPrice) * BPS_DENOMINATOR) / destPrice;
        }
        // Net-profitability guard (Task 3.4): the width NET of the platform
        // fee/slippage/gas reserve must still clear the instance floor.
        if (arbWidthBps < MIN_ARB_WIDTH_BPS + MIN_NET_EDGE_BPS) revert ArbitrageWindowTooNarrow();

        uint256 tradeSize = _boundedTradeSize(arbWidthBps);

        executedActions[actionKey] = true;
        _incrementEpochCounter();

        uint256 amountOut = _executeTrade(tradeSize, MAX_SLIPPAGE_BPS, direction, destPrice);

        journal[actionKey] = JournalEntry({
            factKey: factKey,
            actionKey: actionKey,
            attestedAt: uint64(block.timestamp),
            actedAt: uint64(block.timestamp),
            agent: msg.sender,
            decisionHash: decisionHash,
            actionType: ActionType.ARBITRAGE,
            actionPayload: abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps, amountOut, direction),
            // Task 3.6: full evidence identifiers (see the struct's comment). The
            // destination execution tx hash is intentionally absent — it is the hash
            // of the very transaction emitting the ActionJournaled event below, which
            // is how a reviewer links journal -> receipt from any explorer.
            sourceChainKey: sourceProof.chainKey,
            sourceBlockHeight: sourceProof.blockHeight,
            sourceTxIndex: sourceProof.transactionIndex,
            confirmBlockHeight: confirmProof.blockHeight,
            confirmTxIndex: confirmProof.transactionIndex
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
        // The clamp is the binding constraint: by construction `size` can never exceed
        // MAX_TRADE_SIZE, so the former post-clamp `revert TradeSizeExceedsMax()` was
        // unreachable dead code and has been removed (Task D). Callers guarantee
        // arbWidthBps >= MIN_ARB_WIDTH_BPS and validateGuardrails enforces
        // maxTradeSize >= 4, so `scaled >= MAX_TRADE_SIZE / 4 > 0` — the size can
        // never round down to zero either (Task 3.8).
        uint256 size = scaled > MAX_TRADE_SIZE ? MAX_TRADE_SIZE : scaled;
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

    /// @dev Executes the destination-DEX leg in EITHER direction (Task 3.3). Guardrails
    ///      apply symmetrically: MAX_TRADE_SIZE caps the BASE-denominated exposure of
    ///      the trade regardless of which asset is being sold, and the slippage floor
    ///      is computed from the router's own quote for whichever path is used.
    /// @param tradeSize BASE-denominated trade size from _boundedTradeSize.
    /// @param destPrice The live DEX price this execution already computed (QUOTE per
    ///        BASE_UNIT) — reused to value the buy leg's input, so both directions are
    ///        priced off the same on-chain read.
    function _executeTrade(uint256 tradeSize, uint256 maxSlippageBps, TradeDirection direction, uint256 destPrice)
        internal
        returns (uint256 amountOut)
    {
        address sellToken;
        address buyToken;
        uint256 amountIn;

        if (direction == TradeDirection.SellBaseForQuote) {
            sellToken = address(BASE_ASSET);
            buyToken = QUOTE_ASSET;
            amountIn = tradeSize;
            if (BASE_ASSET.balanceOf(address(this)) < amountIn) revert InsufficientAssetBalance();
        } else {
            // Buy: the input is QUOTE worth `tradeSize` of BASE at the live DEX price.
            // The reverse leg's own fee guarantees the BASE actually received lands
            // strictly under the cap, so the symmetric exposure bound holds.
            sellToken = QUOTE_ASSET;
            buyToken = address(BASE_ASSET);
            amountIn = (tradeSize * destPrice) / BASE_UNIT;
            if (amountIn == 0) revert ZeroTradeSize();
            if (IERC20(QUOTE_ASSET).balanceOf(address(this)) < amountIn) revert InsufficientAssetBalance();
        }

        address[] memory path = new address[](2);
        path[0] = sellToken;
        path[1] = buyToken;

        uint256 quotedOut = DEX_ROUTER.getAmountOut(amountIn, path);
        uint256 minOut = quotedOut - (quotedOut * maxSlippageBps) / BPS_DENOMINATOR;

        IERC20(sellToken).forceApprove(address(DEX_ROUTER), amountIn);
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
        // 32 bytes immediately after the 4-byte selector — read via assembly because
        // Solidity's `data[4:]` slice syntax only applies to calldata arrays, and the
        // decoded `data` lives in memory here.
        if (data.length != 4 + 32) revert MalformedEncodedTransaction();
        // Task 3.6: verify the call is actually `observePrice(uint256)` rather than
        // assuming the shape from the length alone — a different function on the price
        // contract (or arbitrary 36-byte calldata) must not decode as a price fact.
        bytes4 observedSelector;
        assembly {
            observedSelector := mload(add(data, 32)) // first 4 bytes of data
            price := mload(add(data, 36)) // the 32 bytes after the selector
        }
        if (observedSelector != OBSERVE_PRICE_SELECTOR) revert WrongObservationSelector();
        success = (receiptStatus == 1);
    }

    function _quoteCreditcoinDexPrice() internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(BASE_ASSET);
        path[1] = QUOTE_ASSET;
        // Quote for 1 unit of BASE_ASSET (assumes 6 decimals, matching USDC) to get a
        // comparable per-unit price to the source-chain observation.
        return DEX_ROUTER.getAmountOut(BASE_UNIT, path);
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
