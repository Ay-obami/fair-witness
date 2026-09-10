// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IControlledV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1);
}

/// @title ControlledV3LiquidityProvider
/// @notice Minimal callback adapter used only to seed controlled demonstration V3 pools.
/// @dev The helper retains neither tokens nor administrative authority.
contract ControlledV3LiquidityProvider {
    using SafeERC20 for IERC20;

    error InvalidLiquidityRequest();
    error UnauthorizedMintCallback();

    function provide(address pool, address recipient, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        if (pool == address(0) || recipient == address(0) || liquidity == 0 || tickLower >= tickUpper) {
            revert InvalidLiquidityRequest();
        }
        return IControlledV3Pool(pool).mint(recipient, tickLower, tickUpper, liquidity, abi.encode(pool, msg.sender));
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external {
        (address pool, address payer) = abi.decode(data, (address, address));
        if (msg.sender != pool || payer == address(0)) revert UnauthorizedMintCallback();

        address token0 = IControlledV3Pool(pool).token0();
        address token1 = IControlledV3Pool(pool).token1();
        if (amount0Owed != 0) IERC20(token0).safeTransferFrom(payer, pool, amount0Owed);
        if (amount1Owed != 0) IERC20(token1).safeTransferFrom(payer, pool, amount1Owed);
    }
}
