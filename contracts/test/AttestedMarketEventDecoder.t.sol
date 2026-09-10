// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestedMarketEventDecoder} from "../src/libraries/AttestedMarketEventDecoder.sol";

contract AttestedMarketEventDecoderHarness {
    function decode(bytes calldata encodedTransaction, address observer, address pool)
        external
        pure
        returns (AttestedMarketEventDecoder.Observation memory)
    {
        return AttestedMarketEventDecoder.decode(encodedTransaction, observer, pool);
    }
}

contract AttestedMarketEventDecoderTest is Test {
    struct AccessListEntry {
        address account;
        bytes32[] storageKeys;
    }

    struct LogEntry {
        address addr;
        bytes32[] topics;
        bytes data;
    }

    AttestedMarketEventDecoderHarness internal harness;
    address internal observer = makeAddr("observer");
    address internal pool = makeAddr("pool");
    address internal reporter = makeAddr("reporter");

    bytes32 internal constant EVENT_SIGNATURE =
        keccak256("MarketPriceObserved(address,address,uint32,int24,uint160,uint128,uint256)");

    function setUp() public {
        harness = new AttestedMarketEventDecoderHarness();
    }

    function test_decodesSuccessfulObserveReceiptAndRecomputesPrice() public view {
        uint256 expectedPrice = 1e18;
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 15_000, expectedPrice, false)
        );

        AttestedMarketEventDecoder.Observation memory result = harness.decode(envelope, observer, pool);
        assertEq(result.priceE6, expectedPrice);
        assertEq(result.arithmeticMeanTick, 0);
        assertEq(result.spotSqrtPriceX96, uint160(1 << 96));
        assertEq(result.liquidity, 15_000);
        assertEq(result.reporter, reporter);
    }

    function test_rejectsWrongTransactionDestination() public {
        bytes memory envelope = _validEnvelope();
        vm.expectRevert(AttestedMarketEventDecoder.WrongObservationSource.selector);
        harness.decode(envelope, makeAddr("other-observer"), pool);
    }

    function test_rejectsCalldataWithArguments() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()", uint256(123)),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 1, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.MalformedObservationCall.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsFailedUnderlyingTransaction() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            0,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 1, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.UnderlyingTransactionFailed.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsWrongPoolTopic() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, makeAddr("other-pool"), reporter, 300, 0, uint160(1 << 96), 1, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.MissingMarketObservation.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsWrongLogEmitter() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(makeAddr("forged-emitter"), pool, reporter, 300, 0, uint160(1 << 96), 1, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.MissingMarketObservation.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsForgedLoggedPrice() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 1, 999, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.ObservationPriceMismatch.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsDuplicateMatchingEvents() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 1, 1e18, true)
        );
        vm.expectRevert(AttestedMarketEventDecoder.DuplicateMarketObservation.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsWrongTwapWindow() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 60, 0, uint160(1 << 96), 1, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.WrongTwapWindow.selector);
        harness.decode(envelope, observer, pool);
    }

    function test_rejectsZeroLoggedLiquidity() public {
        bytes memory envelope = _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 0, 1e18, false)
        );
        vm.expectRevert(AttestedMarketEventDecoder.ZeroObservationLiquidity.selector);
        harness.decode(envelope, observer, pool);
    }

    function testFuzz_rejectsArbitraryEnvelope(bytes calldata arbitraryEnvelope) public {
        vm.expectRevert();
        harness.decode(arbitraryEnvelope, observer, pool);
    }

    function test_rejectsUnsupportedTransactionType() public {
        bytes memory envelope = _validEnvelope();
        (, bytes[] memory chunks) = abi.decode(envelope, (uint8, bytes[]));
        vm.expectRevert(AttestedMarketEventDecoder.MalformedEncodedTransaction.selector);
        harness.decode(abi.encode(uint8(5), chunks), observer, pool);
    }

    function _validEnvelope() internal view returns (bytes memory) {
        return _envelope(
            observer,
            abi.encodeWithSignature("observe()"),
            1,
            _logs(observer, pool, reporter, 300, 0, uint160(1 << 96), 1, 1e18, false)
        );
    }

    function _logs(
        address emitter,
        address observedPool,
        address observedReporter,
        uint32 window,
        int24 tick,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        uint256 priceE6,
        bool duplicate
    ) internal pure returns (LogEntry[] memory logs) {
        logs = new LogEntry[](duplicate ? 2 : 1);
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = EVENT_SIGNATURE;
        topics[1] = bytes32(uint256(uint160(observedPool)));
        topics[2] = bytes32(uint256(uint160(observedReporter)));
        LogEntry memory entry =
            LogEntry({addr: emitter, topics: topics, data: abi.encode(window, tick, sqrtPriceX96, liquidity, priceE6)});
        logs[0] = entry;
        if (duplicate) logs[1] = entry;
    }

    function _envelope(address to, bytes memory data, uint8 status, LogEntry[] memory logs)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(7), uint64(300_000), address(0xA11CE), false, to, uint256(0), data);
        AccessListEntry[] memory noAccessList = new AccessListEntry[](0);
        chunks[1] = abi.encode(
            uint64(1),
            uint128(2 gwei),
            uint128(50 gwei),
            noAccessList,
            uint8(1),
            bytes32(uint256(0x1234)),
            bytes32(uint256(0x5678))
        );
        chunks[2] = abi.encode(status, uint64(100_000), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }
}
