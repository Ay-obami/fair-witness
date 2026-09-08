// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FairWitnessTreasury} from "./FairWitnessTreasury.sol";
import {IFairWitnessTypes as T} from "./interfaces/IFairWitnessTypes.sol";

/// @title FairWitnessTreasuryFactory
/// @notice Permissionless tenant factory bound to one verified fact validator and
///         one constrained destination adapter. The factory has no administrator
///         and cannot replace either security dependency after deployment.
contract FairWitnessTreasuryFactory {
    address public immutable FACT_VALIDATOR;
    address public immutable DEX_ADAPTER;

    mapping(address => address[]) private ownerTreasuries;
    mapping(address => bool) public isFactoryTreasury;

    error InvalidConfiguration();

    event TreasuryCreated(
        address indexed treasury, address indexed owner, address indexed creator, bytes32 mandateHash
    );

    constructor(address validator_, address adapter_) {
        if (validator_ == address(0) || adapter_ == address(0)) revert InvalidConfiguration();
        if (validator_.code.length == 0 || adapter_.code.length == 0) revert InvalidConfiguration();
        FACT_VALIDATOR = validator_;
        DEX_ADAPTER = adapter_;
    }

    function createTreasury(
        address owner,
        T.UniversalPolicy calldata universal,
        T.ArbitragePolicy calldata arbitrage,
        T.RebalancePolicy calldata rebalance,
        T.RiskPolicy calldata risk
    )
        external
        returns (FairWitnessTreasury treasury)
    {
        treasury = new FairWitnessTreasury(FACT_VALIDATOR, DEX_ADAPTER, owner, universal, arbitrage, rebalance, risk);
        address treasuryAddress = address(treasury);
        ownerTreasuries[owner].push(treasuryAddress);
        isFactoryTreasury[treasuryAddress] = true;
        emit TreasuryCreated(treasuryAddress, owner, msg.sender, keccak256(abi.encode(universal, arbitrage, rebalance, risk)));
    }

    function treasuryCount(address owner) external view returns (uint256) {
        return ownerTreasuries[owner].length;
    }

    function treasuryAt(address owner, uint256 index) external view returns (address) {
        return ownerTreasuries[owner][index];
    }
}
