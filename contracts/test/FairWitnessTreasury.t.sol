// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IFairWitnessTypes as T} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessTreasury} from "../src/FairWitnessTreasury.sol";
import {FairWitnessTreasuryFactory} from "../src/FairWitnessTreasuryFactory.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {VerifiedMarketFactValidator} from "../src/VerifiedMarketFactValidator.sol";
import {FairWitnessHashing} from "../src/libraries/FairWitnessHashing.sol";

contract Phase3ValidatorStub {
    address public constant MARKET_OBSERVER = address(0x1111);
    address public constant SOURCE_POOL = address(0x2222);

    function verifyPair(
        VerifiedMarketFactValidator.ProofData calldata sourceProof,
        VerifiedMarketFactValidator.ProofData calldata confirmProof
    )
        external
        pure
        returns (
            VerifiedMarketFactValidator.VerifiedObservation memory source,
            VerifiedMarketFactValidator.VerifiedObservation memory confirmation
        )
    {
        source = VerifiedMarketFactValidator.VerifiedObservation(
            sourceProof.blockHeight, sourceProof.transactionIndex, address(1), 0, uint160(1 << 96), 10, 1e6
        );
        confirmation = VerifiedMarketFactValidator.VerifiedObservation(
            confirmProof.blockHeight, confirmProof.transactionIndex, address(1), 0, uint160(1 << 96), 10, 1e6
        );
    }
}

contract Phase3AdapterStub {
    address public immutable WCTC;
    address public immutable STABLE;

    constructor(address wctc, address stable) {
        WCTC = wctc;
        STABLE = stable;
    }
}

contract Phase3ApprovedHarness is FairWitnessTreasury {
    constructor(address validator, address adapter, address owner, T.UniversalPolicy memory universal)
        FairWitnessTreasury(
            validator,
            adapter,
            owner,
            universal,
            T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6),
            T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        )
    {}

    function _evaluateStrategy(
        T.Proposal calldata,
        VerifiedMarketFactValidator.VerifiedObservation memory,
        VerifiedMarketFactValidator.VerifiedObservation memory
    ) internal pure override returns (StrategyEvaluation memory result) {
        result = StrategyEvaluation(true, T.ReasonCode.None, 1, 1, 0, 1, bytes32(uint256(1)));
    }
}

contract FairWitnessTreasuryTest is Test {
    MockERC20 wctc;
    MockERC20 stable;
    FairWitnessTreasury treasury;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address demoReserve = makeAddr("demoReserve");

    function setUp() public {
        wctc = new MockERC20("WCTC", "WCTC", 18);
        stable = new MockERC20("Stable", "USD", 6);
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        treasury = new FairWitnessTreasury(
            address(validator),
            address(adapter),
            owner,
            _universal(),
            T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6),
            T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        );
        vm.prank(owner);
        treasury.registerAgent(agent);
    }

    function test_PausedProposalIsDurablyRejectedWithoutMovement() public {
        T.Proposal memory p = _proposal(1);
        uint256 beforeBalance = wctc.balanceOf(address(treasury));
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(reason), uint8(T.ReasonCode.PolicyPaused));
        assertEq(uint8(treasury.getAttempt(id).result), uint8(T.AttemptResult.Rejected));
        assertEq(wctc.balanceOf(address(treasury)), beforeBalance);
        assertFalse(treasury.usedNonces(agent, 1));
    }

    function test_UniversalChecksAndReplayAreJournaled() public {
        vm.prank(owner);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        T.Proposal memory p = _proposal(7);
        p.policyHash = treasury.currentPolicyHash();
        vm.prank(agent);
        (, T.ReasonCode first) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(first), uint8(T.ReasonCode.DestinationMarketInvalid));
        assertTrue(treasury.usedNonces(agent, 7));
        vm.prank(agent);
        (, T.ReasonCode replay) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(replay), uint8(T.ReasonCode.ReplayProposal));
        assertEq(treasury.executionCount(), 0);
    }

    function test_WrongVenueAndOverslippageCannotMoveFunds() public {
        vm.prank(owner);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        T.Proposal memory p = _proposal(2);
        p.policyHash = treasury.currentPolicyHash();
        p.venue = address(0xBEEF);
        vm.prank(agent);
        (, T.ReasonCode venueReason) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(venueReason), uint8(T.ReasonCode.VenueNotAllowed));
        p = _proposal(3);
        p.policyHash = treasury.currentPolicyHash();
        p.maxSlippageBps = 101;
        vm.prank(agent);
        (, T.ReasonCode slipReason) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(slipReason), uint8(T.ReasonCode.SlippageExceedsPolicy));
    }

    function test_UnauthorizedCallerAndAttemptCapRevert() public {
        T.Proposal memory unauthorized = _proposal(1);
        vm.expectRevert(FairWitnessTreasury.NotRegisteredAgent.selector);
        treasury.submitProposal(unauthorized, _proof(), _proof());
        for (uint64 i = 0; i < 6; i++) {
            T.Proposal memory bounded = _proposal(i);
            vm.prank(agent);
            treasury.submitProposal(bounded, _proof(), _proof());
        }
        T.Proposal memory overflowAttempt = _proposal(9);
        vm.prank(agent);
        vm.expectRevert(FairWitnessTreasury.AttemptRateLimitExceeded.selector);
        treasury.submitProposal(overflowAttempt, _proof(), _proof());
    }

    function test_ModeChangeInvalidatesOldPolicyHash() public {
        T.Proposal memory p = _proposal(1);
        bytes32 pausedHash = treasury.currentPolicyHash();
        vm.prank(owner);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        assertNotEq(pausedHash, treasury.currentPolicyHash());
        p.policyHash = pausedHash;
        vm.prank(agent);
        (, T.ReasonCode reason) = treasury.submitProposal(p, _proof(), _proof());
        assertEq(uint8(reason), uint8(T.ReasonCode.PolicyHashMismatch));
    }

    function test_OwnerExitIsPairOnlyAndOnlyToOwner() public {
        wctc.mint(address(treasury), 10e18);
        vm.prank(owner);
        treasury.ownerExit(address(wctc), 3e18);
        assertEq(wctc.balanceOf(owner), 3e18);
        MockERC20 other = new MockERC20("Other", "O", 18);
        vm.prank(owner);
        vm.expectRevert(FairWitnessTreasury.AssetNotAllowed.selector);
        treasury.ownerExit(address(other), 1);
    }

    function test_ProductionCloseReturnsAllAssetsAndCannotReactivate() public {
        wctc.mint(address(treasury), 8e18);
        stable.mint(address(treasury), 25e6);
        vm.prank(owner);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        vm.prank(owner);
        treasury.closeTreasury();

        assertTrue(treasury.closed());
        assertEq(uint8(treasury.automationMode()), uint8(T.AutomationMode.Paused));
        assertEq(wctc.balanceOf(owner), 8e18);
        assertEq(stable.balanceOf(owner), 25e6);
        assertEq(wctc.balanceOf(address(treasury)), 0);
        assertEq(stable.balanceOf(address(treasury)), 0);

        vm.prank(owner);
        vm.expectRevert(FairWitnessTreasury.TreasuryClosed.selector);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        vm.prank(owner);
        vm.expectRevert(FairWitnessTreasury.TreasuryClosed.selector);
        treasury.registerAgent(makeAddr("laterAgent"));
        vm.prank(owner);
        vm.expectRevert(FairWitnessTreasury.TreasuryClosed.selector);
        treasury.closeTreasury();
    }

    function test_DemoFactoryBlocksWithdrawalAndCloseRecyclesAssets() public {
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        FairWitnessTreasuryFactory factory =
            new FairWitnessTreasuryFactory(address(validator), address(adapter), demoReserve);
        FairWitnessTreasury demoTreasury = factory.createTreasury(
            owner,
            _universal(),
            T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6),
            T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        );
        assertTrue(demoTreasury.lifecycleConfigured());
        assertTrue(demoTreasury.demoMode());
        assertEq(demoTreasury.demoReserve(), demoReserve);

        wctc.mint(address(demoTreasury), 12e18);
        stable.mint(address(demoTreasury), 40e6);
        vm.prank(owner);
        vm.expectRevert(FairWitnessTreasury.DemoTokenWithdrawalDisabled.selector);
        demoTreasury.ownerExit(address(wctc), 1e18);

        vm.prank(owner);
        demoTreasury.closeTreasury();
        assertTrue(demoTreasury.closed());
        assertEq(wctc.balanceOf(demoReserve), 12e18);
        assertEq(stable.balanceOf(demoReserve), 40e6);
        assertEq(wctc.balanceOf(owner), 0);
        assertEq(stable.balanceOf(owner), 0);
    }

    function test_ExecutionHelperRejectsDirectCall() public {
        T.Proposal memory p = _proposal(1);
        vm.expectRevert(FairWitnessTreasury.OnlySelf.selector);
        treasury.executeApproved(p, 1, 1);
    }

    function test_FactoryCreatesIndependentMandateTreasury() public {
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        FairWitnessTreasuryFactory factory = new FairWitnessTreasuryFactory(address(validator), address(adapter), address(0));
        FairWitnessTreasury created = factory.createTreasury(
            owner,
            _universal(),
            T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6),
            T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        );
        assertEq(created.owner(), owner);
        assertTrue(factory.isFactoryTreasury(address(created)));
        assertTrue(created.lifecycleConfigured());
        assertFalse(created.demoMode());
        assertEq(created.demoReserve(), address(0));
    }

    function test_FailedExecutionRollsBackReplayAndExecutionCountButJournalsFailure() public {
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        Phase3ApprovedHarness harness =
            new Phase3ApprovedHarness(address(validator), address(adapter), owner, _universal());
        vm.startPrank(owner);
        harness.registerAgent(agent);
        harness.setAutomationMode(T.AutomationMode.Autonomous);
        vm.stopPrank();
        wctc.mint(address(harness), 2e18);
        T.Proposal memory p = _proposal(44);
        p.venue = address(adapter);
        p.policyHash = harness.currentPolicyHash();
        bytes32 key = keccak256(abi.encode(address(harness), p.strategy, p.action, p.evidenceHash));
        uint256 balanceBefore = wctc.balanceOf(address(harness));
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = harness.submitProposal(p, _proof(), _proof());
        assertEq(uint8(reason), uint8(T.ReasonCode.ExecutionReverted));
        assertEq(uint8(harness.getAttempt(id).result), uint8(T.AttemptResult.ExecutionFailed));
        assertFalse(harness.executedEvidence(key));
        assertEq(harness.executionCount(), 0);
        assertEq(wctc.balanceOf(address(harness)), balanceBefore);
        assertEq(wctc.allowance(address(harness), address(adapter)), 0);
    }

    function _proposal(uint64 nonce) internal view returns (T.Proposal memory) {
        return T.Proposal(
            1,
            T.StrategyType.Arbitrage,
            T.ActionType.SwapExactIn,
            address(wctc),
            address(stable),
            address(treasury.DEX_ADAPTER()),
            1e18,
            50,
            uint64(block.timestamp + 60),
            nonce,
            _evidenceHash(),
            keccak256("observation"),
            keccak256("decision"),
            keccak256("policy")
        );
    }

    function _universal() internal pure returns (T.UniversalPolicy memory) {
        return T.UniversalPolicy(7, 10_000e6, 100, 100, 50, 1, 1, 2, 1 days, 6);
    }

    function _proof() internal pure returns (VerifiedMarketFactValidator.ProofData memory proof) {
        proof.chainKey = 1;
        proof.blockHeight = 1;
    }

    function _evidenceHash() internal pure returns (bytes32) {
        return FairWitnessHashing.evidenceHash(
            T.EvidenceHashInput({
                sourceChainKey: 1,
                sourceBlockHeight: 1,
                sourceTxIndex: 0,
                confirmBlockHeight: 1,
                confirmTxIndex: 0,
                immutableObserver: address(0x1111),
                immutableSourcePool: address(0x2222),
                sourcePriceE6: 1e6,
                confirmPriceE6: 1e6,
                sourceMeanTick: 0,
                confirmMeanTick: 0,
                sourceLiquidity: 10,
                confirmLiquidity: 10
            })
        );
    }
}
