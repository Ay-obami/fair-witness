// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDexRouter
/// @notice Minimal Uniswap-V2-style router interface, used to talk to PenguinSwap on
///         Creditcoin testnet.
/// @dev DESIGN NOTE (see DEVLOG.md "Pitfall: PenguinSwap's real ABI unconfirmed"): we did
///      not have network access to fetch PenguinSwap's actual deployed ABI while building
///      this in the sandbox. This interface assumes a standard Uniswap V2 Router02-style
///      surface (getAmountOut / swapExactTokensForTokens), which is the overwhelmingly
///      common pattern for AMM DEXes including most Uniswap V2 forks. This is the other
///      seam to double check and swap in week 1 of the real build, per the PRD, against
///      PenguinSwap's real, deployed router address and ABI on Creditcoin testnet.
interface IDexRouter {
    function getAmountOut(uint256 amountIn, address[] calldata path) external view returns (uint256 amountOut);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}
