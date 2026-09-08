// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IFairWitnessTypes} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessHashing} from "../src/libraries/FairWitnessHashing.sol";

contract FairWitnessHashingTest is Test {
    uint256 private constant CHAIN_ID = 102_031;
    address private constant TREASURY = 0x6666666666666666666666666666666666666666;

    function test_EnumOrdinalsAreLocked() public pure {
        assert(uint8(IFairWitnessTypes.StrategyType.Arbitrage) == 0);
        assert(uint8(IFairWitnessTypes.StrategyType.Rebalance) == 1);
        assert(uint8(IFairWitnessTypes.StrategyType.RiskReduction) == 2);
        assert(uint8(IFairWitnessTypes.ActionType.SwapExactIn) == 0);
    }

    function test_GoldenVectorMatchesTypescript() public pure {
        IFairWitnessTypes.EvidenceHashInput memory evidence = _evidence();
        bytes32 evidenceHash = FairWitnessHashing.evidenceHash(evidence);
        assertEq(evidenceHash, 0x5b4f0f2a41cd0bc59b85e16fe4528575db25c79d63875b2eb208afa9e228010d);

        bytes32 policyHash = FairWitnessHashing.policyHash(CHAIN_ID, TREASURY, _policy());
        assertEq(policyHash, 0xc2f1a976e0b4f34bb98757bf8d0ad1385443b47a7dabba50c089f997d3d8d3dd);

        IFairWitnessTypes.Proposal memory proposal = _proposal(evidenceHash, policyHash);
        assertEq(
            FairWitnessHashing.proposalId(CHAIN_ID, TREASURY, proposal),
            0x343b6f24f17d257706b7f11f4b8f482f6afddd1206391fed43a940ff381fbe21
        );
        assertEq(
            FairWitnessHashing.executionKey(TREASURY, proposal),
            0x4f75099d5463c2fec6b9c12709451b0cb863c2277b6c066850ae8b7bd75062c0
        );
    }

    function test_ProposalIdSeparatesChainAndTreasury() public pure {
        IFairWitnessTypes.Proposal memory proposal = _proposal(bytes32(uint256(1)), bytes32(uint256(2)));
        bytes32 id = FairWitnessHashing.proposalId(CHAIN_ID, TREASURY, proposal);
        assertNotEq(FairWitnessHashing.proposalId(CHAIN_ID + 1, TREASURY, proposal), id);
        assertNotEq(FairWitnessHashing.proposalId(CHAIN_ID, address(0x7777), proposal), id);
    }

    function test_ExecutionKeyIsStrategyScoped() public pure {
        IFairWitnessTypes.Proposal memory proposal = _proposal(bytes32(uint256(1)), bytes32(uint256(2)));
        bytes32 arbitrageKey = FairWitnessHashing.executionKey(TREASURY, proposal);
        proposal.strategy = IFairWitnessTypes.StrategyType.Rebalance;
        assertNotEq(FairWitnessHashing.executionKey(TREASURY, proposal), arbitrageKey);
    }

    function test_HashesAreFieldSensitive() public pure {
        IFairWitnessTypes.EvidenceHashInput memory evidence = _evidence();
        bytes32 evidenceHash = FairWitnessHashing.evidenceHash(evidence);
        evidence.confirmPriceE6 += 1;
        assertNotEq(FairWitnessHashing.evidenceHash(evidence), evidenceHash);

        IFairWitnessTypes.PolicyHashInput memory policy = _policy();
        bytes32 policyHash = FairWitnessHashing.policyHash(CHAIN_ID, TREASURY, policy);
        policy.policyEpoch += 1;
        assertNotEq(FairWitnessHashing.policyHash(CHAIN_ID, TREASURY, policy), policyHash);
    }

    function _evidence() private pure returns (IFairWitnessTypes.EvidenceHashInput memory) {
        return IFairWitnessTypes.EvidenceHashInput({
            sourceChainKey: 10_200,
            sourceBlockHeight: 6_123_456,
            sourceTxIndex: 7,
            confirmBlockHeight: 6_123_468,
            confirmTxIndex: 2,
            immutableObserver: 0x1111111111111111111111111111111111111111,
            immutableSourcePool: 0x2222222222222222222222222222222222222222,
            sourcePriceE6: 850_000,
            confirmPriceE6: 851_000,
            sourceMeanTick: -1_625,
            confirmMeanTick: -1_613,
            sourceLiquidity: 9_000_000_000_000_000_000,
            confirmLiquidity: 9_100_000_000_000_000_000
        });
    }

    function _policy() private pure returns (IFairWitnessTypes.PolicyHashInput memory) {
        return IFairWitnessTypes.PolicyHashInput({
            wctc: 0x3333333333333333333333333333333333333333,
            stable: 0x4444444444444444444444444444444444444444,
            venue: 0x5555555555555555555555555555555555555555,
            universal: IFairWitnessTypes.UniversalPolicy({
                enabledStrategies: 7,
                maxActionValueE6: 10_000_000_000,
                maxSlippageBps: 100,
                maxSourceDriftBps: 75,
                maxSpotTwapDeviationBps: 50,
                minSourceLiquidity: 1_000_000,
                minDestinationLiquidity: 2_000_000,
                maxExecutionsPerEpoch: 4,
                epochLength: 3_600,
                maxAttemptsPerEpoch: 12
            }),
            arbitrage: IFairWitnessTypes.ArbitragePolicy({minNetEdgeBps: 80, maxArbitrageValueE6: 2_000_000_000}),
            rebalance: IFairWitnessTypes.RebalancePolicy({
                targetWctcBps: 4_000, toleranceBps: 500, maxRebalanceValueE6: 1_000_000_000
            }),
            risk: IFairWitnessTypes.RiskPolicy({
                maxWctcExposureBps: 6_000,
                maxRiskReductionValueE6: 1_000_000_000,
                dailyRiskReductionValueE6: 2_500_000_000
            }),
            automationMode: IFairWitnessTypes.AutomationMode.Autonomous,
            policyEpoch: 3
        });
    }

    function _proposal(bytes32 evidenceHash, bytes32 policyHash)
        private
        pure
        returns (IFairWitnessTypes.Proposal memory)
    {
        return IFairWitnessTypes.Proposal({
            schemaVersion: 1,
            strategy: IFairWitnessTypes.StrategyType.Arbitrage,
            action: IFairWitnessTypes.ActionType.SwapExactIn,
            assetIn: 0x3333333333333333333333333333333333333333,
            assetOut: 0x4444444444444444444444444444444444444444,
            venue: 0x5555555555555555555555555555555555555555,
            amountIn: 500_000_000_000_000_000,
            maxSlippageBps: 75,
            deadline: 2_000_000_000,
            nonce: 42,
            evidenceHash: evidenceHash,
            observationHash: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
            decisionHash: 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
            policyHash: policyHash
        });
    }
}
