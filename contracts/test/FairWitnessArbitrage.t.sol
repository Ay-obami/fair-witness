// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFairWitnessTypes as T} from "../src/interfaces/IFairWitnessTypes.sol";
import {FairWitnessHashing} from "../src/libraries/FairWitnessHashing.sol";
import {FairWitnessTreasury} from "../src/FairWitnessTreasury.sol";
import {VerifiedMarketFactValidator} from "../src/VerifiedMarketFactValidator.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract ArbitrageValidatorStub {
    address public constant MARKET_OBSERVER = address(0x1111);
    address public constant SOURCE_POOL = address(0x2222);
    uint256 public sourcePrice = 1e6;
    uint256 public confirmPrice = 1e6;
    uint128 public sourceLiquidity = 1_000;
    bool public invalid;
    bool public stale;
    function configure(uint256 source_, uint256 confirm_, uint128 liquidity_) external {
        sourcePrice = source_; confirmPrice = confirm_; sourceLiquidity = liquidity_;
    }
    function setFailure(bool invalid_, bool stale_) external { invalid = invalid_; stale = stale_; }
    function verifyPair(VerifiedMarketFactValidator.ProofData calldata a, VerifiedMarketFactValidator.ProofData calldata b)
        external view returns (VerifiedMarketFactValidator.VerifiedObservation memory x, VerifiedMarketFactValidator.VerifiedObservation memory y)
    {
        if (stale) revert VerifiedMarketFactValidator.ProofTooOld();
        require(!invalid, "invalid");
        x = VerifiedMarketFactValidator.VerifiedObservation(a.blockHeight, a.transactionIndex, address(1), 0, uint160(1 << 96), sourceLiquidity, sourcePrice);
        y = VerifiedMarketFactValidator.VerifiedObservation(b.blockHeight, b.transactionIndex, address(1), 0, uint160(1 << 96), sourceLiquidity, confirmPrice);
    }
}

contract ArbitrageAdapterStub {
    address public immutable WCTC;
    address public immutable STABLE;
    uint24 public constant POOL_FEE = 500;
    uint256 public twap = 1_100_000;
    uint256 public spot = 1_100_000;
    uint128 public liquidity = 1_000;
    bool public failSwap;
    constructor(address wctc, address stable) { WCTC = wctc; STABLE = stable; }
    function configure(uint256 twap_, uint256 spot_, uint128 liquidity_) external { twap = twap_; spot = spot_; liquidity = liquidity_; }
    function setFailSwap(bool value) external { failSwap = value; }
    function marketState() external view returns (uint256, int24, uint256, uint128) { return (twap, 0, spot, liquidity); }
    function swapExactInput(uint8 direction, uint256 amountIn, uint256 minimumOut, uint256) external returns (uint256 amountOut) {
        require(!failSwap, "swap failed");
        address input = direction == 0 ? WCTC : STABLE;
        address output = direction == 0 ? STABLE : WCTC;
        IERC20(input).transferFrom(msg.sender, address(this), amountIn);
        amountOut = direction == 0 ? amountIn * twap / 1e18 : amountIn * 1e18 / twap;
        require(amountOut >= minimumOut, "slippage");
        IERC20(output).transfer(msg.sender, amountOut);
    }
}

contract FairWitnessArbitrageTest is Test {
    MockERC20 wctc; MockERC20 stable;
    ArbitrageValidatorStub validator; ArbitrageAdapterStub adapter;
    FairWitnessTreasury treasury;
    address owner = makeAddr("owner"); address agent = makeAddr("agent");

    function setUp() public {
        wctc = new MockERC20("WCTC", "WCTC", 18); stable = new MockERC20("USD", "USD", 6);
        validator = new ArbitrageValidatorStub(); adapter = new ArbitrageAdapterStub(address(wctc), address(stable));
        treasury = new FairWitnessTreasury(address(validator), address(adapter), owner,
            T.UniversalPolicy(1, 2_000e6, 100, 100, 50, 100, 100, 2, 1 days, 20),
            T.ArbitragePolicy(80, 2_000e6), T.RebalancePolicy(0, 0, 0), T.RiskPolicy(0, 0, 0));
        vm.startPrank(owner); treasury.registerAgent(agent); treasury.setAutomationMode(T.AutomationMode.Autonomous); vm.stopPrank();
        wctc.mint(address(treasury), 100e18); stable.mint(address(treasury), 100e6);
        wctc.mint(address(adapter), 1_000e18); stable.mint(address(adapter), 1_000e6);
    }

    function test_ValidVerifiedSellExecutesAndJournals() public {
        T.Proposal memory p = _proposal(1, address(wctc), address(stable), 100e18);
        uint256 stableBefore = stable.balanceOf(address(treasury));
        vm.prank(agent); (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        T.AttemptRecord memory record = treasury.getAttempt(id);
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertEq(uint8(record.result), uint8(T.AttemptResult.Executed));
        assertEq(uint8(record.evidenceStatus), uint8(T.EvidenceStatus.Verified));
        assertEq(record.sourceBlockHeight, 100);
        assertGt(record.referenceBps, 80);
        assertGt(stable.balanceOf(address(treasury)), stableBefore);
        assertEq(treasury.executionCount(), 1);
    }

    function test_ValidVerifiedBuyExecutesDeterministicStableInput() public {
        adapter.configure(900_000, 900_000, 1_000);
        T.Proposal memory p = _proposal(11, address(stable), address(wctc), 100e6);
        uint256 wctcBefore = wctc.balanceOf(address(treasury));
        vm.prank(agent); (, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.None));
        assertGt(wctc.balanceOf(address(treasury)), wctcBefore);
    }

    function test_EvidenceAndMarketFailuresAreDurable() public {
        T.Proposal memory p = _proposal(2, address(wctc), address(stable), 100e18); p.evidenceHash = bytes32(uint256(9));
        vm.prank(agent); (uint64 mismatchId, T.ReasonCode mismatch) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(mismatch), uint8(T.ReasonCode.EvidenceHashMismatch));
        assertEq(uint8(treasury.getAttempt(mismatchId).evidenceStatus), uint8(T.EvidenceStatus.Verified));
        validator.setFailure(false, true); p = _proposal(3, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode stale) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(stale), uint8(T.ReasonCode.EvidenceStale));
    }

    function test_DriftDirectionAmountAndDestinationDeviationReject() public {
        validator.configure(1e6, 1_020_000, 1_000);
        T.Proposal memory p = _proposal(4, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode drift) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(drift), uint8(T.ReasonCode.SourceDriftTooHigh));
        validator.configure(1e6, 1e6, 1_000);
        p = _proposal(5, address(stable), address(wctc), 100e6);
        vm.prank(agent); (, T.ReasonCode direction) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(direction), uint8(T.ReasonCode.WrongDirection));
        p = _proposal(6, address(wctc), address(stable), 99e18);
        vm.prank(agent); (, T.ReasonCode amount) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(amount), uint8(T.ReasonCode.AmountMismatch));
        adapter.configure(1_100_000, 1_200_000, 1_000); p = _proposal(7, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode deviation) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(deviation), uint8(T.ReasonCode.DestinationDeviationTooHigh));
    }

    function test_WeakEdgeAndLiquidityRejectWithoutMovement() public {
        adapter.configure(1_010_000, 1_010_000, 1_000);
        T.Proposal memory p = _proposal(12, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode edge) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(edge), uint8(T.ReasonCode.ArbitrageEdgeTooLow));
        validator.configure(1e6, 1e6, 1); adapter.configure(1_100_000, 1_100_000, 1_000);
        p = _proposal(13, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode sourceLiquidity) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(sourceLiquidity), uint8(T.ReasonCode.SourceLiquidityTooLow));
        validator.configure(1e6, 1e6, 1_000); adapter.configure(1_100_000, 1_100_000, 1);
        p = _proposal(14, address(wctc), address(stable), 100e18);
        vm.prank(agent); (, T.ReasonCode destinationLiquidity) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(destinationLiquidity), uint8(T.ReasonCode.DestinationLiquidityTooLow));
    }

    function test_ExecutionFailureRollsBackExecutionStateAndApproval() public {
        adapter.setFailSwap(true); T.Proposal memory p = _proposal(8, address(wctc), address(stable), 100e18);
        bytes32 key = FairWitnessHashing.executionKey(address(treasury), p);
        vm.prank(agent); (uint64 id, T.ReasonCode reason) = treasury.submitProposal(p, _source(), _confirm());
        assertEq(uint8(reason), uint8(T.ReasonCode.ExecutionReverted));
        assertEq(uint8(treasury.getAttempt(id).result), uint8(T.AttemptResult.ExecutionFailed));
        assertFalse(treasury.executedEvidence(key)); assertEq(treasury.executionCount(), 0);
        assertEq(wctc.allowance(address(treasury), address(adapter)), 0);
    }

    function _proposal(uint64 nonce, address input, address output, uint128 amount) internal view returns (T.Proposal memory) {
        return T.Proposal(1, T.StrategyType.Arbitrage, T.ActionType.SwapExactIn, input, output, address(adapter), amount, 50,
            uint64(block.timestamp + 60), nonce, _evidenceHash(), keccak256("observation"), keccak256("decision"), treasury.currentPolicyHash());
    }
    function _source() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) { p.chainKey = 3; p.blockHeight = 100; p.transactionIndex = 1; }
    function _confirm() internal pure returns (VerifiedMarketFactValidator.ProofData memory p) { p.chainKey = 3; p.blockHeight = 105; p.transactionIndex = 2; }
    function _evidenceHash() internal view returns (bytes32) {
        return FairWitnessHashing.evidenceHash(T.EvidenceHashInput(3, 100, 1, 105, 2, address(0x1111), address(0x2222),
            validator.sourcePrice(), validator.confirmPrice(), 0, 0, validator.sourceLiquidity(), validator.sourceLiquidity()));
    }
}
