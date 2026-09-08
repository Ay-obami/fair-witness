// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IFairWitnessTypes as T} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessTreasury} from "../src/FairWitnessTreasury.sol";
import {FairWitnessTreasuryFactory} from "../src/FairWitnessTreasuryFactory.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract Phase3ValidatorStub {}
contract Phase3AdapterStub {
    address public immutable WCTC;
    address public immutable STABLE;
    constructor(address wctc, address stable) { WCTC = wctc; STABLE = stable; }
}

contract Phase3ApprovedHarness is FairWitnessTreasury {
    constructor(address validator, address adapter, address owner, T.UniversalPolicy memory universal)
        FairWitnessTreasury(
            validator, adapter, owner, universal, T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6), T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        ) {}
    function _evaluateStrategy(T.Proposal calldata) internal pure override returns (bool, uint128, T.ReasonCode) {
        return (true, 1, T.ReasonCode.None);
    }
}

contract FairWitnessTreasuryTest is Test {
    MockERC20 wctc;
    MockERC20 stable;
    FairWitnessTreasury treasury;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");

    function setUp() public {
        wctc = new MockERC20("WCTC", "WCTC", 18);
        stable = new MockERC20("Stable", "USD", 6);
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        treasury = new FairWitnessTreasury(
            address(validator), address(adapter), owner, _universal(),
            T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6),
            T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        );
        vm.prank(owner); treasury.registerAgent(agent);
    }

    function test_PausedProposalIsDurablyRejectedWithoutMovement() public {
        T.Proposal memory p = _proposal(1);
        uint256 beforeBalance = wctc.balanceOf(address(treasury));
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p);
        assertEq(uint8(reason), uint8(T.ReasonCode.PolicyPaused));
        assertEq(uint8(treasury.getAttempt(id).result), uint8(T.AttemptResult.Rejected));
        assertEq(wctc.balanceOf(address(treasury)), beforeBalance);
        assertFalse(treasury.usedNonces(agent, 1));
    }

    function test_UniversalChecksAndReplayAreJournaled() public {
        vm.prank(owner); treasury.setAutomationMode(T.AutomationMode.Autonomous);
        T.Proposal memory p = _proposal(7);
        p.policyHash = treasury.currentPolicyHash();
        vm.prank(agent); (, T.ReasonCode first) = treasury.submitProposal(p);
        assertEq(uint8(first), uint8(T.ReasonCode.ArbitrageEdgeTooLow));
        assertTrue(treasury.usedNonces(agent, 7));
        vm.prank(agent); (, T.ReasonCode replay) = treasury.submitProposal(p);
        assertEq(uint8(replay), uint8(T.ReasonCode.ReplayProposal));
        assertEq(treasury.executionCount(), 0);
    }

    function test_WrongVenueAndOverslippageCannotMoveFunds() public {
        vm.prank(owner); treasury.setAutomationMode(T.AutomationMode.Autonomous);
        T.Proposal memory p = _proposal(2); p.policyHash = treasury.currentPolicyHash(); p.venue = address(0xBEEF);
        vm.prank(agent); (, T.ReasonCode venueReason) = treasury.submitProposal(p);
        assertEq(uint8(venueReason), uint8(T.ReasonCode.VenueNotAllowed));
        p = _proposal(3); p.policyHash = treasury.currentPolicyHash(); p.maxSlippageBps = 101;
        vm.prank(agent); (, T.ReasonCode slipReason) = treasury.submitProposal(p);
        assertEq(uint8(slipReason), uint8(T.ReasonCode.SlippageExceedsPolicy));
    }

    function test_UnauthorizedCallerAndAttemptCapRevert() public {
        T.Proposal memory unauthorized = _proposal(1);
        vm.expectRevert(FairWitnessTreasury.NotRegisteredAgent.selector); treasury.submitProposal(unauthorized);
        for (uint64 i = 0; i < 6; i++) {
            T.Proposal memory bounded = _proposal(i);
            vm.prank(agent); treasury.submitProposal(bounded);
        }
        T.Proposal memory overflowAttempt = _proposal(9);
        vm.prank(agent); vm.expectRevert(FairWitnessTreasury.AttemptRateLimitExceeded.selector);
        treasury.submitProposal(overflowAttempt);
    }

    function test_ModeChangeInvalidatesOldPolicyHash() public {
        T.Proposal memory p = _proposal(1);
        bytes32 pausedHash = treasury.currentPolicyHash();
        vm.prank(owner); treasury.setAutomationMode(T.AutomationMode.Autonomous);
        assertNotEq(pausedHash, treasury.currentPolicyHash());
        p.policyHash = pausedHash;
        vm.prank(agent); (, T.ReasonCode reason) = treasury.submitProposal(p);
        assertEq(uint8(reason), uint8(T.ReasonCode.PolicyHashMismatch));
    }

    function test_OwnerExitIsPairOnlyAndOnlyToOwner() public {
        wctc.mint(address(treasury), 10e18);
        vm.prank(owner); treasury.ownerExit(address(wctc), 3e18);
        assertEq(wctc.balanceOf(owner), 3e18);
        MockERC20 other = new MockERC20("Other", "O", 18);
        vm.prank(owner); vm.expectRevert(FairWitnessTreasury.AssetNotAllowed.selector); treasury.ownerExit(address(other), 1);
    }

    function test_ExecutionHelperRejectsDirectCall() public {
        T.Proposal memory p = _proposal(1);
        vm.expectRevert(FairWitnessTreasury.OnlySelf.selector); treasury.executeApproved(p, 1);
    }

    function test_FactoryCreatesIndependentMandateTreasury() public {
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        FairWitnessTreasuryFactory factory = new FairWitnessTreasuryFactory(address(validator), address(adapter));
        FairWitnessTreasury created = factory.createTreasury(
            owner, _universal(), T.ArbitragePolicy(80, 2_000e6),
            T.RebalancePolicy(4_000, 500, 1_000e6), T.RiskPolicy(6_000, 1_000e6, 2_500e6)
        );
        assertEq(created.owner(), owner);
        assertTrue(factory.isFactoryTreasury(address(created)));
        assertEq(factory.treasuryAt(owner, 0), address(created));
    }

    function test_FailedExecutionRollsBackReplayAndExecutionCountButJournalsFailure() public {
        Phase3ValidatorStub validator = new Phase3ValidatorStub();
        Phase3AdapterStub adapter = new Phase3AdapterStub(address(wctc), address(stable));
        Phase3ApprovedHarness harness = new Phase3ApprovedHarness(address(validator), address(adapter), owner, _universal());
        vm.startPrank(owner); harness.registerAgent(agent); harness.setAutomationMode(T.AutomationMode.Autonomous); vm.stopPrank();
        wctc.mint(address(harness), 2e18);
        T.Proposal memory p = _proposal(44);
        p.venue = address(adapter); p.policyHash = harness.currentPolicyHash();
        bytes32 key = keccak256(abi.encode(address(harness), p.strategy, p.action, p.evidenceHash));
        uint256 balanceBefore = wctc.balanceOf(address(harness));
        vm.prank(agent); (uint64 id, T.ReasonCode reason) = harness.submitProposal(p);
        assertEq(uint8(reason), uint8(T.ReasonCode.ExecutionReverted));
        assertEq(uint8(harness.getAttempt(id).result), uint8(T.AttemptResult.ExecutionFailed));
        assertFalse(harness.executedEvidence(key));
        assertEq(harness.executionCount(), 0);
        assertEq(wctc.balanceOf(address(harness)), balanceBefore);
        assertEq(wctc.allowance(address(harness), address(adapter)), 0);
    }

    function _proposal(uint64 nonce) internal view returns (T.Proposal memory) {
        return T.Proposal(1, T.StrategyType.Arbitrage, T.ActionType.SwapExactIn, address(wctc), address(stable),
            address(treasury.DEX_ADAPTER()), 1e18, 50, uint64(block.timestamp + 60), nonce,
            keccak256("evidence"), keccak256("observation"), keccak256("decision"), keccak256("policy"));
    }

    function _universal() internal pure returns (T.UniversalPolicy memory) {
        return T.UniversalPolicy(7, 10_000e6, 100, 100, 50, 1, 1, 2, 1 days, 6);
    }
}
