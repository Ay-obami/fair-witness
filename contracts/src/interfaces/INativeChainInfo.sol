// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Exact USC SDK v0.18 ChainInfo precompile freshness surface at 0x0FD3.
interface INativeChainInfo {
    struct HeightHashResult {
        uint64 height;
        bytes32 hash;
        bool isAttestation;
        bool exists;
    }

    // Name intentionally mirrors the native precompile ABI exactly.
    // forge-lint: disable-next-line(mixed-case-function)
    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external
        view
        returns (HeightHashResult memory result);
}
