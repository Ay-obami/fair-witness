// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ControlledDemoToken} from "../src/demo/ControlledDemoToken.sol";
import {ControlledV3LiquidityProvider, IControlledV3Pool} from "../src/demo/ControlledV3LiquidityProvider.sol";

contract CallbackPoolStub is IControlledV3Pool {
    address public immutable override token0;
    address public immutable override token1;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function mint(address, int24, int24, uint128, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        amount0 = 10e6;
        amount1 = 10e18;
        ControlledV3LiquidityProvider(msg.sender).uniswapV3MintCallback(amount0, amount1, data);
    }
}

    contract ControlledDemoInfrastructureTest is Test {
        ControlledDemoToken internal stable;
        ControlledDemoToken internal wctc;
        ControlledV3LiquidityProvider internal provider;
        CallbackPoolStub internal pool;

        function setUp() public {
            stable = new ControlledDemoToken("Fair Witness Demo Stable", "fwUSD", 6, address(this), 1_000_000e6);
            wctc = new ControlledDemoToken("Fair Witness Demo WCTC", "fwWCTC", 18, address(this), 1_000_000e18);
            provider = new ControlledV3LiquidityProvider();
            pool = new CallbackPoolStub(address(stable), address(wctc));
        }

        function testTokensHaveFixedSupplyAndExpectedDecimals() public view {
            assertEq(stable.decimals(), 6);
            assertEq(wctc.decimals(), 18);
            assertEq(stable.totalSupply(), 1_000_000e6);
            assertEq(wctc.totalSupply(), 1_000_000e18);
        }

        function testProviderPaysOnlyAuthenticatedPoolCallback() public {
            stable.approve(address(provider), type(uint256).max);
            wctc.approve(address(provider), type(uint256).max);

            (uint256 amount0, uint256 amount1) = provider.provide(address(pool), address(this), -60, 60, 1);

            assertEq(amount0, 10e6);
            assertEq(amount1, 10e18);
            assertEq(stable.balanceOf(address(pool)), amount0);
            assertEq(wctc.balanceOf(address(pool)), amount1);
            assertEq(stable.balanceOf(address(provider)), 0);
            assertEq(wctc.balanceOf(address(provider)), 0);
        }

        function testRejectsForgedCallback() public {
            vm.expectRevert(ControlledV3LiquidityProvider.UnauthorizedMintCallback.selector);
            provider.uniswapV3MintCallback(1, 1, abi.encode(address(pool), address(this)));
        }

        function testRejectsInvalidTokenConfiguration() public {
            vm.expectRevert(ControlledDemoToken.InvalidDemoTokenConfiguration.selector);
            new ControlledDemoToken("Bad", "BAD", 8, address(this), 1);
        }
    }
