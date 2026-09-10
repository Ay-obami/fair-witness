// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INativeChainInfo} from "../interfaces/INativeChainInfo.sol";

contract MockNativeChainInfo is INativeChainInfo {
    mapping(uint64 => HeightHashResult) private latest;

    function setLatest(uint64 chainKey, uint64 height, bool isAttestation, bool exists) external {
        latest[chainKey] = HeightHashResult(height, bytes32(uint256(height)), isAttestation, exists);
    }

    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external
        view
        returns (HeightHashResult memory result)
    {
        return latest[chainKey];
    }
}
