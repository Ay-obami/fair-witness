// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {V3TickMath} from "./V3TickMath.sol";

/// @notice Converts a USDT(6)/WCTC(18) Uniswap V3 tick into stablecoin units
///         per WCTC, scaled by 1e6.
library SourceWctcPriceMath {
    uint256 private constant INVERSE_PRICE_SCALE = 1e18;
    uint256 private constant Q128 = 1 << 128;
    uint256 private constant Q192 = 1 << 192;

    function priceE6AtTick(int24 tick) internal pure returns (uint256 priceE6) {
        uint160 sqrtPriceX96 = V3TickMath.getSqrtRatioAtTick(tick);

        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            priceE6 = Math.mulDiv(INVERSE_PRICE_SCALE, Q192, ratioX192);
        } else {
            uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            priceE6 = Math.mulDiv(INVERSE_PRICE_SCALE, Q128, ratioX128);
        }
    }
}
