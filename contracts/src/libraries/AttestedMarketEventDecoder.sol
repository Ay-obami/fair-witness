// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SourceWctcPriceMath} from "./SourceWctcPriceMath.sol";

/// @notice Strict decoder for the USC SDK v0.18 EVM transaction/receipt envelope
///         produced by EthereumV3MarketObserver.observe().
library AttestedMarketEventDecoder {
    uint32 internal constant EXPECTED_TWAP_WINDOW = 300;
    bytes4 internal constant OBSERVE_SELECTOR = bytes4(keccak256("observe()"));
    bytes32 internal constant MARKET_PRICE_OBSERVED_TOPIC =
        keccak256("MarketPriceObserved(address,address,uint32,int24,uint160,uint128,uint256)");

    struct ReceiptLog {
        address addr;
        bytes32[] topics;
        bytes data;
    }

    struct Observation {
        address reporter;
        int24 arithmeticMeanTick;
        uint160 spotSqrtPriceX96;
        uint128 liquidity;
        uint256 priceE6;
    }

    error MalformedEncodedTransaction();
    error WrongObservationSource();
    error MalformedObservationCall();
    error UnderlyingTransactionFailed();
    error MissingMarketObservation();
    error DuplicateMarketObservation();
    error WrongTwapWindow();
    error ZeroObservationLiquidity();
    error ObservationPriceMismatch();

    function decode(bytes calldata encodedTransaction, address expectedObserver, address expectedPool)
        internal
        pure
        returns (Observation memory observation)
    {
        (uint8 txType, bytes[] memory chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));
        if (txType > 4 || chunks.length < 3) revert MalformedEncodedTransaction();

        (,,, bool toIsNull, address to,, bytes memory callData) =
            abi.decode(chunks[0], (uint64, uint64, address, bool, address, uint256, bytes));
        if (toIsNull || to != expectedObserver) revert WrongObservationSource();
        if (callData.length != 4) revert MalformedObservationCall();

        bytes4 selector;
        assembly ("memory-safe") {
            selector := mload(add(callData, 32))
        }
        if (selector != OBSERVE_SELECTOR) revert MalformedObservationCall();

        (uint8 receiptStatus,, ReceiptLog[] memory logs,) =
            abi.decode(chunks[chunks.length - 1], (uint8, uint64, ReceiptLog[], bytes));
        if (receiptStatus != 1) revert UnderlyingTransactionFailed();

        bytes32 expectedPoolTopic = bytes32(uint256(uint160(expectedPool)));
        uint256 matches;
        for (uint256 i; i < logs.length; ++i) {
            ReceiptLog memory candidate = logs[i];
            if (
                candidate.addr != expectedObserver || candidate.topics.length != 3
                    || candidate.topics[0] != MARKET_PRICE_OBSERVED_TOPIC || candidate.topics[1] != expectedPoolTopic
            ) continue;

            ++matches;
            if (matches > 1) revert DuplicateMarketObservation();

            uint32 twapWindow;
            (
                twapWindow,
                observation.arithmeticMeanTick,
                observation.spotSqrtPriceX96,
                observation.liquidity,
                observation.priceE6
            ) = abi.decode(candidate.data, (uint32, int24, uint160, uint128, uint256));
            if (twapWindow != EXPECTED_TWAP_WINDOW) revert WrongTwapWindow();
            if (observation.liquidity == 0) revert ZeroObservationLiquidity();
            observation.reporter = address(uint160(uint256(candidate.topics[2])));
        }

        if (matches == 0) revert MissingMarketObservation();
        if (observation.priceE6 != SourceWctcPriceMath.priceE6AtTick(observation.arithmeticMeanTick)) {
            revert ObservationPriceMismatch();
        }
    }
}
