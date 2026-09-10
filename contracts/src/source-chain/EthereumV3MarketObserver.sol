// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IUniswapV3FactoryMinimal, IUniswapV3PoolMinimal} from "../interfaces/IUniswapV3PoolMinimal.sol";
import {SourceWctcPriceMath} from "../libraries/SourceWctcPriceMath.sol";

/// @title EthereumV3MarketObserver
/// @notice Emits an attestable 300-second TWAP from one immutable Uniswap V3
///         USDT/WCTC pool. Callers choose only when to observe, never the price.
contract EthereumV3MarketObserver {
    uint32 public constant TWAP_WINDOW = 300;
    uint16 public constant MIN_OBSERVATION_CARDINALITY = 16;

    address public immutable FACTORY;
    IUniswapV3PoolMinimal public immutable POOL;
    address public immutable TOKEN0;
    address public immutable TOKEN1;
    uint24 public immutable POOL_FEE;

    error InvalidPoolConfiguration();
    error InvalidTokenDecimals();
    error InsufficientObservationCardinality(uint16 actual);
    error ZeroLiquidity();
    error PoolLocked();
    error ZeroDerivedPrice();
    error MeanTickOutOfRange();

    event MarketPriceObserved(
        address indexed pool,
        address indexed reporter,
        uint32 twapWindow,
        int24 arithmeticMeanTick,
        uint160 spotSqrtPriceX96,
        uint128 liquidity,
        uint256 priceE6
    );

    constructor(address factory_, address pool_, address token0_, address token1_, uint24 fee_) {
        if (
            factory_ == address(0) || pool_ == address(0) || token0_ == address(0) || token1_ == address(0)
                || token0_ == token1_
        ) revert InvalidPoolConfiguration();

        IUniswapV3PoolMinimal candidate = IUniswapV3PoolMinimal(pool_);
        if (
            candidate.factory() != factory_ || candidate.token0() != token0_ || candidate.token1() != token1_
                || candidate.fee() != fee_
                || IUniswapV3FactoryMinimal(factory_).getPool(token0_, token1_, fee_) != pool_
        ) revert InvalidPoolConfiguration();
        if (IERC20Metadata(token0_).decimals() != 6 || IERC20Metadata(token1_).decimals() != 18) {
            revert InvalidTokenDecimals();
        }

        FACTORY = factory_;
        POOL = candidate;
        TOKEN0 = token0_;
        TOKEN1 = token1_;
        POOL_FEE = fee_;
    }

    /// @notice Record the configured market's TWAP. This function intentionally has
    ///         no price, pool, token, fee, or window argument.
    function observe() external returns (uint256 priceE6) {
        (uint160 spotSqrtPriceX96, int24 arithmeticMeanTick,, uint128 currentLiquidity,, uint256 derivedPriceE6) =
            currentObservation();

        emit MarketPriceObserved(
            address(POOL),
            msg.sender,
            TWAP_WINDOW,
            arithmeticMeanTick,
            spotSqrtPriceX96,
            currentLiquidity,
            derivedPriceE6
        );
        return derivedPriceE6;
    }

    function currentObservation()
        public
        view
        returns (
            uint160 spotSqrtPriceX96,
            int24 arithmeticMeanTick,
            uint16 cardinality,
            uint128 currentLiquidity,
            bool unlocked,
            uint256 priceE6
        )
    {
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

        int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
        int56 window = int56(uint56(TWAP_WINDOW));
        int56 meanTick = tickDelta / window;
        // Solidity division truncates toward zero; Uniswap oracle convention rounds
        // negative non-integral means toward negative infinity.
        if (tickDelta < 0 && tickDelta % window != 0) meanTick--;
        // A genuine V3 pool accumulates int24 ticks, but keep the narrowing cast safe
        // even if a constructor-compatible test or fork target returns malformed data.
        if (meanTick < type(int24).min || meanTick > type(int24).max) {
            revert MeanTickOutOfRange();
        }
        arithmeticMeanTick = int24(meanTick);

        priceE6 = priceE6AtTick(arithmeticMeanTick);
        if (priceE6 == 0) revert ZeroDerivedPrice();
    }

    /// @notice Stablecoin units per WCTC, scaled by 1e6, for a Uniswap V3 tick where
    ///         token0 is a 6-decimal stablecoin and token1 is 18-decimal WCTC.
    function priceE6AtTick(int24 tick) public pure returns (uint256 priceE6) {
        return SourceWctcPriceMath.priceE6AtTick(tick);
    }
}
