// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockUniswapV3Factory, MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {IUniswapV3SwapRouterMinimal} from "../src/interfaces/IUniswapV3SwapRouterMinimal.sol";
import {PenguinV3Adapter} from "../src/PenguinV3Adapter.sol";

contract MockV3SwapRouter is IUniswapV3SwapRouterMinimal {
    address public immutable factory;
    uint256 public amountOut;
    uint256 public reportedAmountOut;
    bool public spendInput = true;

    constructor(address factory_) {
        factory = factory_;
    }

    function setAmountOut(uint256 value) external {
        amountOut = value;
        reportedAmountOut = value;
    }

    function setReportedAmountOut(uint256 value) external {
        reportedAmountOut = value;
    }

    function setSpendInput(bool value) external {
        spendInput = value;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256) {
        require(amountOut >= params.amountOutMinimum, "slippage");
        if (spendInput) {
            IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        }
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
        return reportedAmountOut;
    }
}

contract PenguinV3AdapterTest is Test {
    MockERC20 internal wctc;
    MockERC20 internal stable;
    MockUniswapV3Factory internal factory;
    MockUniswapV3Pool internal pool;
    MockV3SwapRouter internal router;
    PenguinV3Adapter internal adapter;
    address internal trader = makeAddr("treasury");
    uint24 internal constant FEE = 500;

    function setUp() public {
        wctc = new MockERC20("Wrapped CTC", "WCTC", 18);
        stable = new MockERC20("USD-TCoin", "USDT", 6);
        factory = new MockUniswapV3Factory();
        pool = new MockUniswapV3Pool(address(factory), address(wctc), address(stable), FEE);
        factory.setPool(address(wctc), address(stable), FEE, address(pool));
        router = new MockV3SwapRouter(address(factory));
        adapter =
            new PenguinV3Adapter(address(router), address(factory), address(pool), address(wctc), address(stable), FEE);
        wctc.mint(trader, 100e18);
        stable.mint(trader, 100e6);
        wctc.mint(address(router), 100e18);
        stable.mint(address(router), 100e6);
    }

    function test_constructorBindsVerifiedVenueTuple() public view {
        assertEq(adapter.ROUTER(), address(router));
        assertEq(adapter.FACTORY(), address(factory));
        assertEq(address(adapter.POOL()), address(pool));
        assertEq(adapter.WCTC(), address(wctc));
        assertEq(adapter.STABLE(), address(stable));
        assertEq(adapter.POOL_FEE(), FEE);
    }

    function test_constructorRejectsRouterFactoryMismatch() public {
        MockV3SwapRouter wrongRouter = new MockV3SwapRouter(makeAddr("wrong-factory"));
        vm.expectRevert(PenguinV3Adapter.InvalidVenueConfiguration.selector);
        new PenguinV3Adapter(address(wrongRouter), address(factory), address(pool), address(wctc), address(stable), FEE);
    }

    function test_sellWctcUsesOnlyFrozenRouteAndReturnsOutputToCaller() public {
        router.setAmountOut(2e6);
        vm.startPrank(trader);
        wctc.approve(address(adapter), 1e18);
        uint256 beforeStable = stable.balanceOf(trader);
        uint256 amountOut =
            adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 1e18, 1_990_000, block.timestamp);
        vm.stopPrank();

        assertEq(amountOut, 2e6);
        assertEq(stable.balanceOf(trader) - beforeStable, 2e6);
        assertEq(wctc.balanceOf(address(adapter)), 0);
        assertEq(stable.balanceOf(address(adapter)), 0);
    }

    function test_buyWctcUsesOnlyFrozenRouteAndReturnsOutputToCaller() public {
        router.setAmountOut(2e18);
        vm.startPrank(trader);
        stable.approve(address(adapter), 1e6);
        uint256 beforeWctc = wctc.balanceOf(trader);
        uint256 amountOut =
            adapter.swapExactInput(PenguinV3Adapter.TradeDirection.BuyWctcWithStable, 1e6, 199e16, block.timestamp);
        vm.stopPrank();

        assertEq(amountOut, 2e18);
        assertEq(wctc.balanceOf(trader) - beforeWctc, 2e18);
    }

    function test_rejectsExpiredDeadlineBeforeMovingFunds() public {
        vm.warp(100);
        vm.prank(trader);
        vm.expectRevert(PenguinV3Adapter.DeadlineExpired.selector);
        adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 1e18, 1, 99);
        assertEq(wctc.balanceOf(trader), 100e18);
    }

    function test_rejectsZeroInputOrMinimumOutput() public {
        vm.startPrank(trader);
        vm.expectRevert(PenguinV3Adapter.InvalidSwapAmount.selector);
        adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 0, 1, block.timestamp);
        vm.expectRevert(PenguinV3Adapter.InvalidSwapAmount.selector);
        adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 1, 0, block.timestamp);
        vm.stopPrank();
    }

    function test_rejectsRouterThatDoesNotSpendTheExactInput() public {
        router.setAmountOut(2e6);
        router.setSpendInput(false);
        vm.startPrank(trader);
        wctc.approve(address(adapter), 1e18);
        vm.expectRevert(PenguinV3Adapter.InvalidTokenTransfer.selector);
        adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 1e18, 1_990_000, block.timestamp);
        vm.stopPrank();
        assertEq(wctc.balanceOf(trader), 100e18);
        assertEq(stable.balanceOf(trader), 100e6);
    }

    function test_rejectsRouterReportedOutputMismatch() public {
        router.setAmountOut(2e6);
        router.setReportedAmountOut(3e6);
        vm.startPrank(trader);
        wctc.approve(address(adapter), 1e18);
        vm.expectRevert(PenguinV3Adapter.InvalidRouterOutput.selector);
        adapter.swapExactInput(PenguinV3Adapter.TradeDirection.SellWctcForStable, 1e18, 1_990_000, block.timestamp);
        vm.stopPrank();
        assertEq(wctc.balanceOf(trader), 100e18);
        assertEq(stable.balanceOf(trader), 100e6);
    }

    function test_destinationTwapPriceUsesFrozenPoolAndRejectsWeakHistory() public {
        pool.setTickCumulatives(0, 0);
        (uint256 priceE6, int24 meanTick,,) = adapter.marketState();
        assertEq(priceE6, 1e18);
        assertEq(meanTick, 0);

        pool.setSlot0(uint160(1 << 96), 0, 15, true);
        vm.expectRevert(abi.encodeWithSelector(PenguinV3Adapter.InsufficientObservationCardinality.selector, 15));
        adapter.marketState();
    }
}
