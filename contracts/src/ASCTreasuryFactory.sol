// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ASCTreasuryJournal} from "./ASCTreasuryJournal.sol";
import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {IDexRouter} from "./interfaces/IDexRouter.sol";

/// @title ASCTreasuryFactory
/// @notice Multi-tenant deployer for the Fair Witness treasury shape (V2 pivot).
///
/// Every call to `createTreasury` deploys a brand-new, fully independent
/// `ASCTreasuryJournal` whose guardrails (max trade size, slippage, drift, rate limit,
/// …) are baked in as constructor-set `immutable`s. There is deliberately NO shared
/// contract with mutable per-user settings — the whole point of the pivot is that even
/// the user who deployed an instance cannot loosen its bounds later (see
/// docs/ARCHITECTURE_V2.md §2, the non-negotiable constraint).
///
/// The factory holds the platform's canonical chain configuration — the Attestcoin
/// verifier precompile, the Creditcoin-side DEX router, the base/quote assets, and the
/// source-chain price contract — so every tenant instance is bound to the same trusted
/// infrastructure the single-tenant V1 system was verified against. The factory itself is
/// permissionless by design: `createTreasury` is callable by anyone (including the
/// Stage-2 embedded-wallet sign-up flow acting on a user's behalf).
contract ASCTreasuryFactory {
    // ---------------------------------------------------------------------
    // Canonical chain configuration (set once, immutable)
    // ---------------------------------------------------------------------

    INativeQueryVerifier public immutable VERIFIER;
    IDexRouter public immutable DEX_ROUTER;
    IERC20 public immutable BASE_ASSET;
    address public immutable QUOTE_ASSET;
    address public immutable PRICE_CONTRACT;

    // ---------------------------------------------------------------------
    // Events / errors
    // ---------------------------------------------------------------------

    /// @notice Emitted for every deployed instance. The indexed `owner` is the tenant who
    ///         receives initial ownership of their treasury; the guardrail args are the
    ///         exact immutable bounds that instance now carries.
    event TreasuryDeployed(
        address indexed treasury,
        address indexed owner,
        uint256 maxTradeSize,
        uint256 maxSlippageBps,
        uint256 minArbWidthBps,
        uint256 maxDriftBps,
        uint256 maxConfirmGapBlocks,
        uint256 maxActionsPerEpoch,
        uint256 epochLength
    );

    error InvalidChainConfig();
    error InvalidGuardrails();

    constructor(
        address verifier_,
        address dexRouter_,
        address baseAsset_,
        address quoteAsset_,
        address priceContract_
    ) {
        if (
            verifier_ == address(0) || dexRouter_ == address(0) || baseAsset_ == address(0)
                || quoteAsset_ == address(0) || priceContract_ == address(0)
        ) revert InvalidChainConfig();

        VERIFIER = INativeQueryVerifier(verifier_);
        DEX_ROUTER = IDexRouter(dexRouter_);
        BASE_ASSET = IERC20(baseAsset_);
        QUOTE_ASSET = quoteAsset_;
        PRICE_CONTRACT = priceContract_;
    }

    // ---------------------------------------------------------------------
    // Per-user deployment
    // ---------------------------------------------------------------------

    /// @notice Deploy a fresh, independent treasury instance for `owner_` with `guardrails_`
    ///         frozen immutably into that instance.
    /// @param owner_ The tenant: receives initial ownership of the new instance (can register
    ///        submitters for it; can never loosen its bounds).
    /// @param guardrails_ The rigid bounds this instance will enforce forever.
    /// @return treasury The address of the freshly deployed instance.
    function createTreasury(address owner_, ASCTreasuryJournal.Guardrails calldata guardrails_)
        external
        returns (ASCTreasuryJournal treasury)
    {
        // Pre-flight: mirror the treasury constructor's single source of truth
        // (ASCTreasuryJournal.validateGuardrails) so an invalid set reverts cleanly here
        // without burning the caller's deploy gas. The constructor remains the authority —
        // this mirror exists purely as a gas-saver, and must never be assumed to be weaker.
        if (
            guardrails_.maxTradeSize == 0 || guardrails_.maxSlippageBps == 0
                || guardrails_.maxSlippageBps > 10_000 || guardrails_.minArbWidthBps == 0
                || guardrails_.minArbWidthBps > 10_000 || guardrails_.maxDriftBps == 0
                || guardrails_.maxDriftBps > 10_000 || guardrails_.maxConfirmGapBlocks == 0
                || guardrails_.maxActionsPerEpoch == 0 || guardrails_.epochLength == 0
        ) revert InvalidGuardrails();

        treasury = new ASCTreasuryJournal(
            address(VERIFIER),
            address(DEX_ROUTER),
            address(BASE_ASSET),
            QUOTE_ASSET,
            PRICE_CONTRACT,
            owner_,
            guardrails_
        );

        emit TreasuryDeployed(
            address(treasury),
            owner_,
            guardrails_.maxTradeSize,
            guardrails_.maxSlippageBps,
            guardrails_.minArbWidthBps,
            guardrails_.maxDriftBps,
            guardrails_.maxConfirmGapBlocks,
            guardrails_.maxActionsPerEpoch,
            guardrails_.epochLength
        );
    }
}