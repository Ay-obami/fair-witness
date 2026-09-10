// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockUniswapV3Factory, MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {EthereumV3MarketObserver} from "../src/source-chain/EthereumV3MarketObserver.sol";

contract EthereumV3MarketObserverTest is Test {
    MockERC20 internal usdt;
    MockERC20 internal wctc;
    MockUniswapV3Factory internal factory;
    MockUniswapV3Pool internal pool;
    EthereumV3MarketObserver internal observer;

    uint24 internal constant FEE = 3000;

    function setUp() public {
        usdt = new MockERC20("Tether USD", "USDT", 6);
        wctc = new MockERC20("Wrapped CTC", "WCTC", 18);
        factory = new MockUniswapV3Factory();
        pool = new MockUniswapV3Pool(address(factory), address(usdt), address(wctc), FEE);
        factory.setPool(address(usdt), address(wctc), FEE, address(pool));
        observer = new EthereumV3MarketObserver(address(factory), address(pool), address(usdt), address(wctc), FEE);
    }

    function test_constructorFreezesAndValidatesPoolProvenance() public view {
        assertEq(address(observer.FACTORY()), address(factory));
        assertEq(address(observer.POOL()), address(pool));
        assertEq(observer.TOKEN0(), address(usdt));
        assertEq(observer.TOKEN1(), address(wctc));
        assertEq(observer.POOL_FEE(), FEE);
        assertEq(observer.TWAP_WINDOW(), 300);
        assertEq(observer.MIN_OBSERVATION_CARDINALITY(), 16);
    }

    function test_constructorRejectsFactoryMismatch() public {
        MockUniswapV3Factory otherFactory = new MockUniswapV3Factory();
        vm.expectRevert(EthereumV3MarketObserver.InvalidPoolConfiguration.selector);
        new EthereumV3MarketObserver(address(otherFactory), address(pool), address(usdt), address(wctc), FEE);
    }

    function test_observeHasNoCallerSuppliedPriceAndEmitsDerivedTwap() public {
        pool.setTickCumulatives(0, 0);

        address reporter = makeAddr("permissionless-reporter");
        vm.prank(reporter);
        vm.expectEmit(true, true, false, true, address(observer));
        emit EthereumV3MarketObserver.MarketPriceObserved(address(pool), reporter, 300, 0, uint160(1 << 96), 1, 1e18);
        uint256 priceE6 = observer.observe();

        assertEq(priceE6, 1e18);
    }

    function test_negativeMeanTickRoundsTowardNegativeInfinity() public {
        pool.setTickCumulatives(0, -301);
        (, int24 meanTick,,,,) = observer.currentObservation();
        assertEq(meanTick, -2);
    }

    function test_priceMovesInCorrectStablePerWctcDirection() public view {
        uint256 atParity = observer.priceE6AtTick(0);
        uint256 moreWctcRawPerStable = observer.priceE6AtTick(10_000);
        uint256 lessWctcRawPerStable = observer.priceE6AtTick(-10_000);

        assertLt(moreWctcRawPerStable, atParity);
        assertGt(lessWctcRawPerStable, atParity);
    }

    function test_rejectsInsufficientObservationCardinality() public {
        pool.setSlot0(uint160(1 << 96), 0, 15, true);
        vm.expectRevert(
            abi.encodeWithSelector(EthereumV3MarketObserver.InsufficientObservationCardinality.selector, 15)
        );
        observer.observe();
    }

    function test_rejectsZeroLiquidity() public {
        pool.setLiquidity(0);
        vm.expectRevert(EthereumV3MarketObserver.ZeroLiquidity.selector);
        observer.observe();
    }

    function test_rejectsLockedPool() public {
        pool.setSlot0(uint160(1 << 96), 0, 16, false);
        vm.expectRevert(EthereumV3MarketObserver.PoolLocked.selector);
        observer.observe();
    }
}
