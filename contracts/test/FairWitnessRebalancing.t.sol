// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFairWitnessTypes as T} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessHashing} from "../src/libraries/FairWitnessHashing.sol";
import {FairWitnessTreasury} from "../src/FairWitnessTreasury.sol";
import {VerifiedMarketFactValidator} from "../src/VerifiedMarketFactValidator.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract RebalanceValidatorStub {
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

contract RebalanceAdapterStub {
    address public immutable WCTC;
    address public immutable STABLE;
    uint24 public constant POOL_FEE = 500;

    constructor(address wctc, address stable) {
        WCTC = wctc;
        STABLE = stable;
    }

    function marketState() external pure returns (uint256, int24, uint256, uint128) {
        return (1e6, 0, 1e6, 1_000);
    }

    function swapExactInput(uint8 direction, uint256 amountIn, uint256 minimumOut, uint256)
        external
        returns (uint256 amountOut)
    {
        address input = direction == 0 ? WCTC : STABLE;
        address output = direction == 0 ? STABLE : WCTC;
        IERC20(input).transferFrom(msg.sender, address(this), amountIn);
        amountOut = direction == 0 ? amountIn / 1e12 : amountIn * 1e12;
        require(amountOut >= minimumOut, "slippage");
        IERC20(output).transfer(msg.sender, amountOut);
    }
}

contract FairWitnessRebalancingTest is Test {
    MockERC20 wctc;
    MockERC20 stable;
    RebalanceValidatorStub validator;
    RebalanceAdapterStub adapter;
    FairWitnessTreasury treasury;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");

    function setUp() public {
        wctc = new MockERC20("WCTC", "WCTC", 18);
        stable = new MockERC20("USD", "USD", 6);
        validator = new RebalanceValidatorStub();
        adapter = new RebalanceAdapterStub(address(wctc), address(stable));
        treasury = new FairWitnessTreasury(
            address(validator),
            address(adapter),
            owner,
            T.UniversalPolicy(2, 30e6, 100, 100, 50, 100, 100, 4, 1 days, 20),
            T.ArbitragePolicy(0, 0),
            T.RebalancePolicy(4_000, 500, 50e6),
            T.RiskPolicy(0, 0, 0)
        );
        vm.startPrank(owner);
        treasury.registerAgent(agent);
        treasury.setAutomationMode(T.AutomationMode.Autonomous);
        vm.stopPrank();
        wctc.mint(address(adapter), 1_000e18);
        stable.mint(address(adapter), 1_000e6);
    }

    function test_AboveTargetExecutesCappedSellAndJournalsAllocation() public {
        _fund(80e18, 20e6);
        T.Proposal memory p = _proposal(1, address(wctc), address(stable), 30e18);
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        T.AttemptRecord memory record = treasury.getAttempt(id);
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertEq(record.currentWctcBps, 8_000);
        assertEq(record.referenceBps, 4_000);
        assertEq(record.permittedValueE6, 30e6);
        assertEq(record.amountInActual, 30e18);
    }

    function test_BelowTargetExecutesBuy() public {
        _fund(20e18, 80e6);
        T.Proposal memory p = _proposal(2, address(stable), address(wctc), 20e6);
        uint256 beforeWctc = wctc.balanceOf(address(treasury));
        vm.prank(agent);
        (, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertGt(wctc.balanceOf(address(treasury)), beforeWctc);
    }

    function test_InclusiveToleranceAndZeroPortfolioReject() public {
        _fund(45e18, 55e6);
        T.Proposal memory p = _proposal(3, address(wctc), address(stable), 1e18);
        uint256 wctcBefore = wctc.balanceOf(address(treasury));
        uint256 stableBefore = stable.balanceOf(address(treasury));
        vm.prank(agent);
        (uint64 upperId, T.ReasonCode upper) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(upper), uint8(T.ReasonCode.RebalanceWithinTolerance));
        assertEq(treasury.getAttempt(upperId).currentWctcBps, 4_500);
        assertEq(wctc.balanceOf(address(treasury)), wctcBefore);
        assertEq(stable.balanceOf(address(treasury)), stableBefore);
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
        assertEq(treasury.executionCount(), 0);
        FairWitnessTreasury empty = _newTreasury();
        p = _proposalFor(empty, 4, address(stable), address(wctc), 1);
        vm.prank(agent);
        (, T.ReasonCode zero) = empty.submitProposal(p, _source(), _confirm());
        assertEq(uint8(zero), uint8(T.ReasonCode.ZeroExecutableAmount));
    }

    function test_WrongDirectionAndOversizedReject() public {
        _fund(80e18, 20e6);
        uint256 wctcBefore = wctc.balanceOf(address(treasury));
        uint256 stableBefore = stable.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(5, address(stable), address(wctc), 30e6);
        vm.prank(agent);
        (, T.ReasonCode direction) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(direction), uint8(T.ReasonCode.WrongDirection));
        p = _proposal(6, address(wctc), address(stable), 31e18);
        vm.prank(agent);
        (, T.ReasonCode above) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(above), uint8(T.ReasonCode.AmountExceedsPolicy));
        assertEq(wctc.balanceOf(address(treasury)), wctcBefore);
        assertEq(stable.balanceOf(address(treasury)), stableBefore);
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
        assertEq(treasury.executionCount(), 0);
    }

    function test_SmallerRebalanceAmountExecutesWithinCeiling() public {
        _fund(80e18, 20e6);
        uint256 beforeStable = stable.balanceOf(address(treasury));
        T.Proposal memory p = _proposal(7, address(wctc), address(stable), 29e18);
        vm.prank(agent);
        (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertEq(treasury.getAttempt(id).amountInActual, 29e18);
        assertEq(treasury.getAttempt(id).permittedValueE6, 30e6);
        assertGt(stable.balanceOf(address(treasury)), beforeStable);
        assertEq(treasury.executionCount(), 1);
    }

    function _newTreasury() internal returns (FairWitnessTreasury result) {
        result = new FairWitnessTreasury(
            address(validator),
            address(adapter),
            owner,
            T.UniversalPolicy(2, 30e6, 100, 100, 50, 100, 100, 4, 1 days, 20),
            T.ArbitragePolicy(0, 0),
            T.RebalancePolicy(4_000, 500, 50e6),
            T.RiskPolicy(0, 0, 0)
        );
        vm.startPrank(owner);
        result.registerAgent(agent);
        result.setAutomationMode(T.AutomationMode.Autonomous);
        vm.stopPrank();
    }

    function _fund(uint256 wctcAmount, uint256 stableAmount) internal {
        wctc.mint(address(treasury), wctcAmount);
        stable.mint(address(treasury), stableAmount);
    }

    function _proposal(uint64 nonce, address input, address output, uint128 amount)
        internal
        view
        returns (T.Proposal memory)
    {
        return _proposalFor(treasury, nonce, input, output, amount);
    }

    function _proposalFor(FairWitnessTreasury target, uint64 nonce, address input, address output, uint128 amount)
        internal
        view
        returns (T.Proposal memory)
    {
        return T.Proposal(
            1,
            T.StrategyType.Rebalance,
            T.ActionType.SwapExactIn,
            input,
            output,
            address(adapter),
            amount,
            50,
            uint64(block.timestamp + 60),
            nonce,
            _evidenceHash(),
            keccak256("observation"),
            keccak256("decision"),
            target.currentPolicyHash()
        );
    }

    function _source() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        p.chainKey = 3;
        p.blockHeight = 100;
        p.transactionIndex = 1;
    }

    function _confirm() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) {
        p.chainKey = 3;
        p.blockHeight = 105;
        p.transactionIndex = 2;
    }

    function _evidenceHash() internal pure returns (bytes32) {
        return FairWitnessHashing.evidenceHash(
            T.EvidenceHashInput(3, 100, 1, 105, 2, address(0x1111), address(0x2222), 1e6, 1e6, 0, 0, 1_000, 1_000)
        );
    }
}
