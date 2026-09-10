// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFairWitnessTypes as T} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessHashing} from "../src/libraries/FairWitnessHashing.sol";
import {FairWitnessTreasury} from "../src/FairWitnessTreasury.sol";
import {VerifiedMarketFactValidator} from "../src/VerifiedMarketFactValidator.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract RiskValidatorStub {
    address public constant MARKET_OBSERVER = address(0x1111);
    address public constant SOURCE_POOL = address(0x2222);

    function verifyPair(
        VerifiedMarketFactValidator.ProofData calldata a,
        VerifiedMarketFactValidator.ProofData calldata b
    )
        external
        pure
        returns (
            VerifiedMarketFactValidator.VerifiedObservation memory x,
            VerifiedMarketFactValidator.VerifiedObservation memory y
        )
    {
        x = VerifiedMarketFactValidator.VerifiedObservation(
            a.blockHeight, a.transactionIndex, address(1), 0, uint160(1 << 96), 1_000, 1e6
        );
        y = VerifiedMarketFactValidator.VerifiedObservation(
            b.blockHeight, b.transactionIndex, address(1), 0, uint160(1 << 96), 1_000, 1e6
        );
    }
}

contract RiskAdapterStub {
    address public immutable WCTC;
    address public immutable STABLE;
    uint24 public constant POOL_FEE = 500;
    bool public failSwap;

    constructor(address wctc, address stable) {
        WCTC = wctc;
        STABLE = stable;
    }

    function setFailSwap(bool value) external {
        failSwap = value;
    }

    function marketState() external pure returns (uint256, int24, uint256, uint128) {
        return (1e6, 0, 1e6, 1_000);
    }

    function swapExactInput(uint8 direction, uint256 amountIn, uint256 minimumOut, uint256)
        external
        returns (uint256 amountOut)
    {
        require(!failSwap, "swap failed");
        require(direction == 0, "sell only");
        IERC20(WCTC).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn / 1e12;
        require(amountOut >= minimumOut, "slippage");
        IERC20(STABLE).transfer(msg.sender, amountOut);
    }
}

contract FairWitnessRiskReductionTest is Test {
    MockERC20 wctc;
    MockERC20 stable;
    RiskValidatorStub validator;
    RiskAdapterStub adapter;
    FairWitnessTreasury treasury;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");

    function setUp() public {
        wctc = new MockERC20("WCTC", "WCTC", 18);
        stable = new MockERC20("USD", "USD", 6);
        validator = new RiskValidatorStub();
        adapter = new RiskAdapterStub(address(wctc), address(stable));
        treasury = _newTreasury();
        wctc.mint(address(adapter), 1_000e18);
        stable.mint(address(adapter), 1_000e6);
    }

    function test_ValidReductionExecutesAndChargesDailyUsage() public {
        _fund(treasury, 80e18, 20e6);
        uint256 wctcBefore = wctc.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(treasury, 1, address(wctc), address(stable), 10e18);
        uint256 day = block.timestamp / 1 days;
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        T.AttemptRecord memory record = treasury.getAttempt(id);
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertEq(record.currentWctcBps, 8_000);
        assertEq(record.referenceBps, 6_000);
        assertEq(record.permittedValueE6, 10e6);
        assertEq(treasury.riskReductionUsedByDay(day), 10e6);
        assertEq(record.amountInActual, 10e18);
        assertEq(wctc.balanceOf(address(treasury)), wctcBefore - 10e18);
        assertEq(treasury.executionCount(), 1);
    }

    function test_StrictThresholdAndWrongDirectionRejectWithoutUsage() public {
        _fund(treasury, 60e18, 40e6);
        T.Proposal memory p = _proposal(treasury, 2, address(wctc), address(stable), 1e18);
        vm.prank(agent);
        (, T.ReasonCode threshold) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(threshold), uint8(T.ReasonCode.RiskThresholdNotBreached));
        wctc.mint(address(treasury), 20e18);
        p = _proposal(treasury, 3, address(stable), address(wctc), 10e6);
        vm.prank(agent);
        (, T.ReasonCode direction) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(direction), uint8(T.ReasonCode.WrongDirection));
        assertEq(treasury.riskReductionUsedByDay(block.timestamp / 1 days), 0);
    }

    function test_OversizedAmountIsJournaledWithoutMovement() public {
        _fund(treasury, 80e18, 20e6);
        uint256 beforeBalance = wctc.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(treasury, 4, address(wctc), address(stable), 7_000e18);
        vm.prank(agent);
        (uint64 id, T.ReasonCode above) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(above), uint8(T.ReasonCode.AmountExceedsPolicy));
        assertEq(treasury.getAttempt(id).permittedValueE6, 10e6);
        assertEq(wctc.balanceOf(address(treasury)), beforeBalance);
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
        assertEq(treasury.executionCount(), 0);
        assertEq(treasury.riskReductionUsedByDay(block.timestamp / 1 days), 0);
    }

    function test_SmallerRiskReductionExecutesWithinCeiling() public {
        _fund(treasury, 80e18, 20e6);
        uint256 beforeBalance = wctc.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(treasury, 5, address(wctc), address(stable), 9e18);
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertEq(treasury.getAttempt(id).amountInActual, 9e18);
        assertEq(treasury.getAttempt(id).permittedValueE6, 10e6);
        assertEq(wctc.balanceOf(address(treasury)), beforeBalance - 9e18);
        assertEq(treasury.executionCount(), 1);
        assertEq(treasury.riskReductionUsedByDay(block.timestamp / 1 days), 10e6);
    }

    function testFuzz_MaliciousOversizeCannotMoveCapital(uint96 excess) public {
        _fund(treasury, 80e18, 20e6);
        uint128 maliciousAmount = uint128(10e18 + bound(uint256(excess), 1, 1_000_000e18));
        uint256 wctcBefore = wctc.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(treasury, 11, address(wctc), address(stable), maliciousAmount);
        bytes32 key = FairWitnessHashing.executionKey(address(treasury), p);
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.AmountExceedsPolicy));
        assertEq(uint8(treasury.getAttempt(id).result), uint8(T.AttemptResult.Rejected));
        assertEq(treasury.getAttempt(id).permittedValueE6, 10e6);
        assertEq(wctc.balanceOf(address(treasury)), wctcBefore);
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
        assertEq(treasury.executionCount(), 0);
        assertFalse(treasury.executedEvidence(key));
        assertEq(treasury.riskReductionUsedByDay(block.timestamp / 1 days), 0);
    }

    function test_DailyRemainingLimitAndFixedDayRollover() public {
        _fund(treasury, 80e18, 20e6);
        T.Proposal memory p = _proposalAt(treasury, 6, address(wctc), address(stable), 10e18, 0);
        vm.prank(agent);
        treasury.submitProposal(p, _sourceAt(0), _confirmAt(0));
        p = _proposalAt(treasury, 7, address(wctc), address(stable), 5e18, 10);
        vm.prank(agent);
        (, T.ReasonCode second) = treasury.submitProposal(p, _sourceAt(10), _confirmAt(10));
        assertEq(uint8(second), uint8(T.ReasonCode.None));
        uint256 day = block.timestamp / 1 days;
        assertEq(treasury.riskReductionUsedByDay(day), 15e6);
        p = _proposalAt(treasury, 8, address(wctc), address(stable), 1e18, 20);
        vm.prank(agent);
        (, T.ReasonCode limited) = treasury.submitProposal(p, _sourceAt(20), _confirmAt(20));
        assertEq(uint8(limited), uint8(T.ReasonCode.DailyRiskLimit));
        vm.warp((day + 1) * 1 days);
        p = _proposalAt(treasury, 9, address(wctc), address(stable), 5e18, 30);
        p.deadline = 1 days + 60;
        vm.prank(agent);
        (, T.ReasonCode rollover) = treasury.submitProposal(p, _sourceAt(30), _confirmAt(30));
        assertEq(uint8(rollover), uint8(T.ReasonCode.None));
        assertEq(treasury.riskReductionUsedByDay(1), 5e6);
    }

    function test_ExecutionFailureRollsBackDailyUsageAndExecutionState() public {
        _fund(treasury, 80e18, 20e6);
        adapter.setFailSwap(true);
        T.Proposal memory p = _proposal(treasury, 10, address(wctc), address(stable), 10e18);
        bytes32 key = FairWitnessHashing.executionKey(address(treasury), p);
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.ExecutionReverted));
        assertEq(uint8(treasury.getAttempt(id).result), uint8(T.AttemptResult.ExecutionFailed));
        assertEq(treasury.riskReductionUsedByDay(block.timestamp / 1 days), 0);
        assertEq(treasury.executionCount(), 0);
        assertFalse(treasury.executedEvidence(key));
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
    }

    function _newTreasury() internal returns (FairWitnessTreasury result) {
        result = new FairWitnessTreasury(
            address(validator),
            address(adapter),
            owner,
            T.UniversalPolicy(4, 30e6, 100, 100, 50, 100, 100, 10, 1 hours, 30),
            T.ArbitragePolicy(0, 0),
            T.RebalancePolicy(0, 0, 0),
            T.RiskPolicy(6_000, 10e6, 15e6)
        );
        vm.startPrank(owner);
        result.registerAgent(agent);
        result.setAutomationMode(T.AutomationMode.Autonomous);
        vm.stopPrank();
    }

    function _fund(FairWitnessTreasury target, uint256 wctcAmount, uint256 stableAmount) internal {
        wctc.mint(address(target), wctcAmount);
        stable.mint(address(target), stableAmount);
    }

    function _proposal(FairWitnessTreasury target, uint64 nonce, address input, address output, uint128 amount)
        internal
        view
        returns (T.Proposal memory)
    {
        return _proposalAt(target, nonce, input, output, amount, 0);
    }

    function _proposalAt(
        FairWitnessTreasury target,
        uint64 nonce,
        address input,
        address output,
        uint128 amount,
        uint64 offset
    ) internal view returns (T.Proposal memory) {
        return T.Proposal(
            1,
            T.StrategyType.RiskReduction,
            T.ActionType.SwapExactIn,
            input,
            output,
            address(adapter),
            amount,
            50,
            uint64(block.timestamp + 60),
            nonce,
            _evidenceHashAt(offset),
            keccak256("observation"),
            keccak256("decision"),
            target.currentPolicyHash()
        );
    }

    function _source() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        return _sourceAt(0);
    }

    function _sourceAt(uint64 offset) internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        p.chainKey = 3;
        p.blockHeight = 100 + offset;
        p.transactionIndex = 1;
    }

    function _confirm() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        return _confirmAt(0);
    }

    function _confirmAt(uint64 offset) internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        p.chainKey = 3;
        p.blockHeight = 105 + offset;
        p.transactionIndex = 2;
    }

    function _evidenceHash() internal pure returns (bytes32) {
        return _evidenceHashAt(0);
    }

    function _evidenceHashAt(uint64 offset) internal pure returns (bytes32) {
        return FairWitnessHashing.evidenceHash(
            T.EvidenceHashInput(
                3, 100 + offset, 1, 105 + offset, 2, address(0x1111), address(0x2222), 1e6, 1e6, 0, 0, 1_000, 1_000
            )
        );
    }
}
