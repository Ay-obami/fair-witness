// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDexRouter} from "../interfaces/IDexRouter.sol";

/// @notice Minimal constant-product (x*y=k) AMM standing in for PenguinSwap in local
///         tests. Single hardcoded pair, single pool, no fees-on-transfer support, no LP
///         tokens — deliberately just enough surface for ASCTreasuryJournal's tests.
/// @dev DEVLOG.md "Pitfall: PenguinSwap's real ABI unconfirmed" applies here too — this
///      mock matches our assumed IDexRouter interface, not necessarily PenguinSwap's real
///      one. Swap this out for a PenguinSwap fork/mainnet-fork test before relying on it.
contract MockDexRouter is IDexRouter {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenA; // BASE_ASSET, e.g. USDC
    IERC20 public immutable tokenB; // QUOTE_ASSET

    uint256 public reserveA;
    uint256 public reserveB;

    constructor(address tokenA_, address tokenB_) {
        tokenA = IERC20(tokenA_);
        tokenB = IERC20(tokenB_);
    }

    /// @notice Seed the pool with initial liquidity. Test-only helper (no LP accounting).
    function seedLiquidity(uint256 amountA, uint256 amountB) external {
        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
    }

    function getAmountOut(uint256 amountIn, address[] calldata path) external view returns (uint256 amountOut) {
        require(path.length == 2, "unsupported path");
        (uint256 reserveIn, uint256 reserveOut) = _reservesFor(path[0], path[1]);
        amountOut = _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        require(path.length == 2, "unsupported path");
        (uint256 reserveIn, uint256 reserveOut) = _reservesFor(path[0], path[1]);
        uint256 amountOut = _getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "insufficient output amount");

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).safeTransfer(to, amountOut);

        if (path[0] == address(tokenA)) {
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
        }

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }

    function _reservesFor(address tokenIn, address tokenOut)
        internal
        view
        returns (uint256 reserveIn, uint256 reserveOut)
    {
        if (tokenIn == address(tokenA) && tokenOut == address(tokenB)) {
            return (reserveA, reserveB);
        } else if (tokenIn == address(tokenB) && tokenOut == address(tokenA)) {
            return (reserveB, reserveA);
        }
        revert("unsupported pair");
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        require(amountIn > 0, "insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "insufficient liquidity");
        // 0.3% fee, standard Uniswap V2 constant
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }
}
