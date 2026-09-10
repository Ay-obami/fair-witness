// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TreasuryBytecodeStore
/// @notice Immutable data container used by FairWitnessTreasuryFactory to keep the
///         large treasury creation bytecode outside the factory's EIP-170 runtime.
/// @dev The constructor deliberately returns `data` itself as the deployed runtime.
///      The resulting address is a byte container, not a callable application contract.
contract TreasuryBytecodeStore {
    constructor(bytes memory data) {
        if (data.length == 0) revert();
        assembly ("memory-safe") {
            return(add(data, 0x20), mload(data))
        }
    }
}
