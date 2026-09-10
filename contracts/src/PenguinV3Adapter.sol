// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUniswapV3FactoryMinimal, IUniswapV3PoolMinimal} from "./interfaces/IUniswapV3PoolMinimal.sol";
import {IUniswapV3SwapRouterMinimal} from "./interfaces/IUniswapV3SwapRouterMinimal.sol";
import {DestinationWctcPriceMath} from "./libraries/DestinationWctcPriceMath.sol";

/// @title PenguinV3Adapter
/// @notice Fixed-purpose WCTC/USD-TCoin adapter for one immutable PenguinSwap V3 pool.
///         Callers cannot select a router, pool, path, token, fee, recipient, or calldata.
contract PenguinV3Adapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum TradeDirection {
        SellWctcForStable,
        BuyWctcWithStable
    }

    uint32 public constant TWAP_WINDOW = 300;
    uint16 public constant MIN_OBSERVATION_CARDINALITY = 16;

    address public immutable ROUTER;
    address public immutable FACTORY;
    IUniswapV3PoolMinimal public immutable POOL;
    address public immutable WCTC;
    address public immutable STABLE;
    uint24 public immutable POOL_FEE;

    error InvalidVenueConfiguration();
    error InvalidTokenDecimals();
    error InvalidSwapAmount();
    error DeadlineExpired();
    error InsufficientObservationCardinality(uint16 actual);
    error PoolLocked();
    error ZeroLiquidity();
    error MeanTickOutOfRange();
    error InvalidTokenTransfer();
    error InvalidRouterOutput();

    event SwapExecuted(address indexed caller, TradeDirection indexed direction, uint256 amountIn, uint256 amountOut);

    constructor(address router_, address factory_, address pool_, address wctc_, address stable_, uint24 fee_) {
        if (
            router_ == address(0) || factory_ == address(0) || pool_ == address(0) || wctc_ == address(0)
                || stable_ == address(0) || wctc_ == stable_
        ) revert InvalidVenueConfiguration();
        IUniswapV3PoolMinimal candidate = IUniswapV3PoolMinimal(pool_);
        if (
            IUniswapV3SwapRouterMinimal(router_).factory() != factory_ || candidate.factory() != factory_
                || candidate.token0() != wctc_ || candidate.token1() != stable_ || candidate.fee() != fee_
                || IUniswapV3FactoryMinimal(factory_).getPool(wctc_, stable_, fee_) != pool_
        ) revert InvalidVenueConfiguration();
        if (IERC20Metadata(wctc_).decimals() != 18 || IERC20Metadata(stable_).decimals() != 6) {
            revert InvalidTokenDecimals();
        }

        ROUTER = router_;
        FACTORY = factory_;
        POOL = candidate;
        WCTC = wctc_;
        STABLE = stable_;
        POOL_FEE = fee_;
    }

    function marketState()
        public
        view
        returns (uint256 twapPriceE6, int24 arithmeticMeanTick, uint256 spotPriceE6, uint128 currentLiquidity)
    {
        uint160 spotSqrtPriceX96;
        uint16 cardinality;
        bool unlocked;
        (spotSqrtPriceX96,,, cardinality,,, unlocked) = POOL.slot0();
        if (!unlocked) revert PoolLocked();
        if (cardinality < MIN_OBSERVATION_CARDINALITY) {
            revert InsufficientObservationCardinality(cardinality);
        }
        currentLiquidity = POOL.liquidity();
        if (currentLiquidity == 0) revert ZeroLiquidity();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = TWAP_WINDOW;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives,) = POOL.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int56 window = int56(uint56(TWAP_WINDOW));
        int56 meanTick = delta / window;
        if (delta < 0 && delta % window != 0) meanTick--;
        if (meanTick < type(int24).min || meanTick > type(int24).max) {
            revert MeanTickOutOfRange();
        }
        arithmeticMeanTick = int24(meanTick);

        twapPriceE6 = DestinationWctcPriceMath.priceE6AtTick(arithmeticMeanTick);
        spotPriceE6 = DestinationWctcPriceMath.priceE6AtSqrtPrice(spotSqrtPriceX96);
    }

    function swapExactInput(TradeDirection direction, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (amountIn == 0 || amountOutMinimum == 0) revert InvalidSwapAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        // Enforce the same basic market-availability preconditions on every swap.
        marketState();

        address tokenIn = direction == TradeDirection.SellWctcForStable ? WCTC : STABLE;
        address tokenOut = direction == TradeDirection.SellWctcForStable ? STABLE : WCTC;

        uint256 adapterInputBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20(tokenIn).balanceOf(address(this)) - adapterInputBefore != amountIn) {
            revert InvalidTokenTransfer();
        }

        uint256 recipientOutputBefore = IERC20(tokenOut).balanceOf(msg.sender);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);
        uint256 reportedAmountOut = IUniswapV3SwapRouterMinimal(ROUTER)
            .exactInputSingle(
                IUniswapV3SwapRouterMinimal.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: POOL_FEE,
                    recipient: msg.sender,
                    deadline: deadline,
                    amountIn: amountIn,
                    amountOutMinimum: amountOutMinimum,
                    sqrtPriceLimitX96: 0
                })
            );
        IERC20(tokenIn).forceApprove(ROUTER, 0);
        if (IERC20(tokenIn).balanceOf(address(this)) != adapterInputBefore) {
            revert InvalidTokenTransfer();
        }

        amountOut = IERC20(tokenOut).balanceOf(msg.sender) - recipientOutputBefore;
        if (amountOut < amountOutMinimum || reportedAmountOut != amountOut) {
            revert InvalidRouterOutput();
        }
        emit SwapExecuted(msg.sender, direction, amountIn, amountOut);
    }
}
