// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title INativeQueryVerifier
/// @notice Interface modeling the Attestcoin Block Prover native precompile at 0x0FD2.
/// @dev DESIGN NOTE (see DEVLOG.md "Pitfall: no public Solidity interface found for the
///      precompile"): the public Attestcoin/Creditcoin documentation describes the
///      verification mechanism (Merkle inclusion proof + continuity proof, checked
///      synchronously against the precompile) but does not publish a canonical Solidity
///      interface/ABI for 0x0FD2 as of the time this project was built. This interface is
///      our best-effort reconstruction of that surface from the docs and the gluwa usc-sdk's
///      TypeScript proof-building API, deliberately kept close to what ASCMinter.sol's
///      reference pattern implies. Before mainnet/testnet deployment, this file MUST be
///      checked against the actual precompile ABI (or the SDK-generated bindings, if the
///      SDK provides one) and adjusted if the real function signatures differ. Treat this
///      as the seam to swap, not as verified fact.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /// @notice Verify that `encodedTransaction` was included at `blockHeight` on the chain
    ///         identified by `chainKey`, and that block is part of an attested, continuous
    ///         chain of blocks. Read-only, one-directional: proves a fact about another
    ///         chain, does not (and cannot) write anything back to it.
    /// @return verified True if both the Merkle inclusion proof and the continuity proof
    ///         check out against the precompile's attested state.
    function verify(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool verified);

    /// @notice Same verification as `verify`, but additionally emits an event on success.
    ///         Used by callers (like this project) that want an on-chain, indexable record
    ///         of every verification attempt, not just the caller's own journal.
    function verifyAndEmit(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool verified);
}
