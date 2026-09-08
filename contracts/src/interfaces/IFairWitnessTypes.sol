// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical schema-v1 vocabulary shared by future Fair Witness policy and treasury contracts.
/// @dev This interface is type-only. Phase 2 does not alter or deploy the existing treasury.
interface IFairWitnessTypes {
    enum StrategyType {
        Arbitrage,
        Rebalance,
        RiskReduction
    }

    enum ActionType {
        SwapExactIn
    }

    enum AutomationMode {
        Paused,
        Autonomous
    }

    struct Proposal {
        uint8 schemaVersion;
        StrategyType strategy;
        ActionType action;
        address assetIn;
        address assetOut;
        address venue;
        uint128 amountIn;
        uint16 maxSlippageBps;
        uint64 deadline;
        uint64 nonce;
        bytes32 evidenceHash;
        bytes32 observationHash;
        bytes32 decisionHash;
        bytes32 policyHash;
    }

    struct EvidenceHashInput {
        uint64 sourceChainKey;
        uint64 sourceBlockHeight;
        uint64 sourceTxIndex;
        uint64 confirmBlockHeight;
        uint64 confirmTxIndex;
        address immutableObserver;
        address immutableSourcePool;
        uint256 sourcePriceE6;
        uint256 confirmPriceE6;
        int24 sourceMeanTick;
        int24 confirmMeanTick;
        uint128 sourceLiquidity;
        uint128 confirmLiquidity;
    }

    struct UniversalPolicy {
        uint8 enabledStrategies;
        uint128 maxActionValueE6;
        uint16 maxSlippageBps;
        uint16 maxSourceDriftBps;
        uint16 maxSpotTwapDeviationBps;
        uint128 minSourceLiquidity;
        uint128 minDestinationLiquidity;
        uint16 maxExecutionsPerEpoch;
        uint32 epochLength;
        uint16 maxAttemptsPerEpoch;
    }

    struct ArbitragePolicy {
        uint16 minNetEdgeBps;
        uint128 maxArbitrageValueE6;
    }

    struct RebalancePolicy {
        uint16 targetWctcBps;
        uint16 toleranceBps;
        uint128 maxRebalanceValueE6;
    }

    struct RiskPolicy {
        uint16 maxWctcExposureBps;
        uint128 maxRiskReductionValueE6;
        uint128 dailyRiskReductionValueE6;
    }

    struct PolicyHashInput {
        address wctc;
        address stable;
        address venue;
        UniversalPolicy universal;
        ArbitragePolicy arbitrage;
        RebalancePolicy rebalance;
        RiskPolicy risk;
        AutomationMode automationMode;
        uint64 policyEpoch;
    }
}
