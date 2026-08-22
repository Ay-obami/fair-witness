// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INativeQueryVerifier} from "../interfaces/INativeQueryVerifier.sol";

/// @notice Test-only stand-in for the real Attestcoin Block Prover precompile (0x0FD2).
/// @dev The real precompile checks a Merkle inclusion proof + continuity proof against
///      attested chain state that only exists on a live Creditcoin node — there is no way
///      to construct a genuine, passing proof inside a local Foundry/anvil test. Instead,
///      this mock lets a test explicitly pre-register whether a given (chainKey,
///      blockHeight, encodedTransaction) tuple should verify as true or false, so the
///      *contract logic* around verification (bounds checking, replay safety, journaling)
///      can be tested deterministically and independent of real attestation infrastructure.
///      This is a explicit, disclosed gap: it tests "does ASCTreasuryJournal behave
///      correctly given a verification result" but NOT "does the real precompile
///      integration actually work" — that can only be confirmed on live Creditcoin
///      testnet, per the PRD's week-1 deployment step.
contract MockNativeQueryVerifier is INativeQueryVerifier {
    mapping(bytes32 => bool) public verifiedProofs;

    event VerificationRegistered(bytes32 indexed proofKey, bool verified);
    event VerificationChecked(bytes32 indexed proofKey, bool result, bool emitted);

    function setVerificationResult(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bool verified
    ) external {
        bytes32 key = _proofKey(chainKey, blockHeight, encodedTransaction);
        verifiedProofs[key] = verified;
        emit VerificationRegistered(key, verified);
    }

    function verify(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        MerkleProof calldata, /* merkleProof */
        ContinuityProof calldata /* continuityProof */
    ) external view returns (bool verified) {
        bytes32 key = _proofKey(chainKey, blockHeight, encodedTransaction);
        verified = verifiedProofs[key];
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        MerkleProof calldata, /* merkleProof */
        ContinuityProof calldata /* continuityProof */
    ) external returns (bool verified) {
        bytes32 key = _proofKey(chainKey, blockHeight, encodedTransaction);
        verified = verifiedProofs[key];
        emit VerificationChecked(key, verified, true);
    }

    function _proofKey(uint64 chainKey, uint64 blockHeight, bytes calldata encodedTransaction)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(chainKey, blockHeight, encodedTransaction));
    }
}
