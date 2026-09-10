// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV3PoolMinimal} from "../interfaces/IUniswapV3PoolMinimal.sol";

contract MockUniswapV3Factory {
    mapping(bytes32 => address) private pools;

    function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(tokenA, tokenB, fee))] = pool;
        pools[keccak256(abi.encode(tokenB, tokenA, fee))] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(tokenA, tokenB, fee))];
    }
}

contract MockUniswapV3Pool is IUniswapV3PoolMinimal {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;

    uint160 public sqrtPriceX96 = uint160(1 << 96);
    int24 public currentTick;
    uint16 public observationCardinality = 16;
    bool public unlocked = true;
    uint128 public liquidity = 1;
    int56 public pastTickCumulative;
    int56 public currentTickCumulative;

    constructor(address factory_, address token0_, address token1_, uint24 fee_) {
        factory = factory_;
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
    }

    function setSlot0(uint160 sqrtPriceX96_, int24 tick_, uint16 cardinality_, bool unlocked_) external {
        sqrtPriceX96 = sqrtPriceX96_;
        currentTick = tick_;
        observationCardinality = cardinality_;
        unlocked = unlocked_;
    }

    function setLiquidity(uint128 value) external {
        liquidity = value;
    }

    function setTickCumulatives(int56 pastValue, int56 currentValue) external {
        pastTickCumulative = pastValue;
        currentTickCumulative = currentValue;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (sqrtPriceX96, currentTick, 0, observationCardinality, observationCardinality, 0, unlocked);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        require(secondsAgos.length == 2 && secondsAgos[0] == 300 && secondsAgos[1] == 0, "window");
        tickCumulatives = new int56[](2);
        tickCumulatives[0] = pastTickCumulative;
        tickCumulatives[1] = currentTickCumulative;
        secondsPerLiquidityCumulativeX128s = new uint160[](2);
    }
}
