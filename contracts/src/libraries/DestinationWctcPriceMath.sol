// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {V3TickMath} from "./V3TickMath.sol";

/// @notice Converts a WCTC(18)/stablecoin(6) V3 price into stablecoin units
///         per WCTC, scaled by 1e6.
library DestinationWctcPriceMath {
    uint256 private constant PRICE_SCALE = 1e18;
    uint256 private constant Q128 = 1 << 128;
    uint256 private constant Q192 = 1 << 192;

    function priceE6AtTick(int24 tick) internal pure returns (uint256) {
        return priceE6AtSqrtPrice(V3TickMath.getSqrtRatioAtTick(tick));
    }

    function priceE6AtSqrtPrice(uint160 sqrtPriceX96) internal pure returns (uint256 priceE6) {
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            priceE6 = Math.mulDiv(ratioX192, PRICE_SCALE, Q192);
        } else {
            uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            priceE6 = Math.mulDiv(ratioX128, PRICE_SCALE, Q128);
        }
    }
}
