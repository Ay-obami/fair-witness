// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {MockNativeChainInfo} from "../src/mocks/MockNativeChainInfo.sol";
import {MockNativeQueryVerifier} from "../src/mocks/MockNativeQueryVerifier.sol";
import {VerifiedMarketFactValidator} from "../src/VerifiedMarketFactValidator.sol";

contract VerifiedMarketFactValidatorTest is Test {
    struct AccessListEntry {
        address account;
        bytes32[] storageKeys;
    }

    struct LogEntry {
        address addr;
        bytes32[] topics;
        bytes data;
    }

    uint64 internal constant SOURCE_CHAIN_KEY = 3;
    address internal observer = makeAddr("observer");
    address internal pool = makeAddr("pool");
    MockNativeQueryVerifier internal verifier;
    MockNativeChainInfo internal chainInfo;
    VerifiedMarketFactValidator internal validator;

    function setUp() public {
        verifier = new MockNativeQueryVerifier();
        chainInfo = new MockNativeChainInfo();
        chainInfo.setLatest(SOURCE_CHAIN_KEY, 1_100, true, true);
        validator = new VerifiedMarketFactValidator(
            address(verifier), address(chainInfo), observer, pool, SOURCE_CHAIN_KEY, 64, 12
        );
    }

    function test_validatesPairAgainstProofChainFreshnessAndReceipt() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        _register(confirm, true);

        (
            VerifiedMarketFactValidator.VerifiedObservation memory sourceResult,
            VerifiedMarketFactValidator.VerifiedObservation memory confirmResult
        ) = validator.verifyPair(source, confirm);

        assertEq(sourceResult.priceE6, 1e18);
        assertEq(confirmResult.priceE6, 1e18);
        assertEq(sourceResult.blockHeight, 1_090);
        assertEq(confirmResult.blockHeight, 1_095);
    }

    function test_rejectsWrongSourceChain() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        source.chainKey = 1;
        vm.expectRevert(VerifiedMarketFactValidator.WrongSourceChain.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsMissingLatestAttestation() public {
        chainInfo.setLatest(SOURCE_CHAIN_KEY, 0, false, false);
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        vm.expectRevert(VerifiedMarketFactValidator.LatestAttestationUnavailable.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsProofAboveLatestAttestedHeight() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_095, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_101, 0, 0);
        vm.expectRevert(VerifiedMarketFactValidator.ProofAboveLatestAttestation.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsAbsolutelyStaleConfirmation() public {
        chainInfo.setLatest(SOURCE_CHAIN_KEY, 2_000, true, true);
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        vm.expectRevert(VerifiedMarketFactValidator.ProofTooOld.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsConfirmationGapAboveImmutableLimit() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_080, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        vm.expectRevert(VerifiedMarketFactValidator.ConfirmationGapTooLarge.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsConfirmationAtSameHeight() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_095, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        vm.expectRevert(VerifiedMarketFactValidator.ConfirmationNotNewer.selector);
        validator.verifyPair(source, confirm);
    }

    function test_acceptsExactAgeAndGapBoundaries() public {
        chainInfo.setLatest(SOURCE_CHAIN_KEY, 1_159, true, true);
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_083, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        _register(confirm, true);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsSubmittedIndexNotBoundToMerklePath() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 1, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        _register(confirm, true);
        vm.expectRevert(VerifiedMarketFactValidator.TransactionIndexMismatch.selector);
        validator.verifyPair(source, confirm);
    }

    function test_preservesAValidIndexAboveUint32() public {
        uint64 highIndex = uint64(1) << 40;
        VerifiedMarketFactValidator.ProofData memory source = _proofWithMerkleIndex(1_090, highIndex, highIndex, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        _register(confirm, true);

        (VerifiedMarketFactValidator.VerifiedObservation memory result,) = validator.verifyPair(source, confirm);
        assertEq(result.transactionIndex, highIndex);
    }

    function test_rejectsCryptographicallyUnverifiedSource() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(confirm, true);
        vm.expectRevert(VerifiedMarketFactValidator.SourceVerificationFailed.selector);
        validator.verifyPair(source, confirm);
    }

    function test_rejectsCryptographicallyUnverifiedConfirmation() public {
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, 0, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        vm.expectRevert(VerifiedMarketFactValidator.ConfirmationVerificationFailed.selector);
        validator.verifyPair(source, confirm);
    }

    function testFuzz_rejectsForgedUint64Index(uint64 claimedIndex) public {
        vm.assume(claimedIndex != 0);
        VerifiedMarketFactValidator.ProofData memory source = _proof(1_090, claimedIndex, 0);
        VerifiedMarketFactValidator.ProofData memory confirm = _proof(1_095, 0, 0);
        _register(source, true);
        _register(confirm, true);
        vm.expectRevert(VerifiedMarketFactValidator.TransactionIndexMismatch.selector);
        validator.verifyPair(source, confirm);
    }

    function _register(VerifiedMarketFactValidator.ProofData memory proof, bool result) internal {
        verifier.setVerificationResult(proof.chainKey, proof.blockHeight, proof.encodedTransaction, result);
    }

    function _proof(uint64 height, uint64 submittedIndex, int24 tick)
        internal
        view
        returns (VerifiedMarketFactValidator.ProofData memory proof)
    {
        return _proofWithMerkleIndex(height, submittedIndex, 0, tick);
    }

    function _proofWithMerkleIndex(uint64 height, uint64 submittedIndex, uint64 merkleIndex, int24 tick)
        internal
        view
        returns (VerifiedMarketFactValidator.ProofData memory proof)
    {
        uint256 depth;
        uint64 remaining = merkleIndex;
        while (remaining != 0) {
            ++depth;
            remaining >>= 1;
        }
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](depth);
        for (uint256 i; i < depth; ++i) {
            siblings[i] = INativeQueryVerifier.MerkleProofEntry({
                hash: bytes32(0), isLeft: (merkleIndex & (uint64(1) << uint64(i))) != 0
            });
        }
        bytes32[] memory roots = new bytes32[](0);
        proof = VerifiedMarketFactValidator.ProofData({
            chainKey: SOURCE_CHAIN_KEY,
            blockHeight: height,
            transactionIndex: submittedIndex,
            encodedTransaction: _envelope(tick),
            merkleProof: INativeQueryVerifier.MerkleProof(bytes32(0), siblings),
            continuityProof: INativeQueryVerifier.ContinuityProof(bytes32(0), roots)
        });
    }

    function _envelope(int24 tick) internal view returns (bytes memory) {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256("MarketPriceObserved(address,address,uint32,int24,uint160,uint128,uint256)");
        topics[1] = bytes32(uint256(uint160(pool)));
        topics[2] = bytes32(uint256(uint160(address(0xA11CE))));
        LogEntry[] memory logs = new LogEntry[](1);
        logs[0] = LogEntry(observer, topics, abi.encode(uint32(300), tick, uint160(1 << 96), uint128(1), uint256(1e18)));

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(
            uint64(7),
            uint64(300_000),
            address(0xA11CE),
            false,
            observer,
            uint256(0),
            abi.encodeWithSignature("observe()")
        );
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
        chunks[2] = abi.encode(uint8(1), uint64(100_000), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }
}
