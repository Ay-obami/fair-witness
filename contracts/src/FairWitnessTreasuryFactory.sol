// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FairWitnessTreasury} from "./FairWitnessTreasury.sol";
import {IFairWitnessTypes as T} from "./interfaces/IFairWitnessTypes.sol";

/// @title FairWitnessTreasuryFactory
/// @notice Permissionless tenant factory bound to one verified fact validator and
///         one constrained destination adapter. The factory has no administrator
///         and cannot replace either security dependency after deployment.
/// @dev FairWitnessTreasury creation bytecode is held in two immutable external data
///      stores. This avoids embedding ~25 KB of child initcode in the factory runtime,
///      keeping the factory deployable under EIP-170 while preserving the same one-call
///      user onboarding API. The reconstructed creation code is hash-checked every time.
contract FairWitnessTreasuryFactory {
    address public immutable FACT_VALIDATOR;
    address public immutable DEX_ADAPTER;
    address public immutable DEMO_RESERVE;
    address public immutable CREATION_CODE_STORE_A;
    address public immutable CREATION_CODE_STORE_B;
    bytes32 public immutable TREASURY_CREATION_CODE_HASH;
    uint32 public immutable TREASURY_CREATION_CODE_SIZE;

    mapping(address => bool) public isFactoryTreasury;

    error InvalidConfiguration();
    error CreationCodeMismatch();
    error TreasuryDeploymentFailed();

    event TreasuryCreated(
        address indexed treasury, address indexed owner, address indexed creator, bytes32 mandateHash
    );

    constructor(
        address validator_,
        address adapter_,
        address demoReserve_,
        address creationCodeStoreA_,
        address creationCodeStoreB_,
        bytes32 creationCodeHash_,
        uint32 creationCodeSize_
    ) {
        if (
            validator_ == address(0) || adapter_ == address(0) || validator_.code.length == 0
                || adapter_.code.length == 0 || creationCodeStoreA_ == address(0) || creationCodeStoreB_ == address(0)
                || creationCodeStoreA_.code.length == 0 || creationCodeStoreB_.code.length == 0
                || creationCodeHash_ == bytes32(0) || creationCodeSize_ == 0
                || creationCodeStoreA_.code.length + creationCodeStoreB_.code.length != creationCodeSize_
        ) revert InvalidConfiguration();
        FACT_VALIDATOR = validator_;
        DEX_ADAPTER = adapter_;
        DEMO_RESERVE = demoReserve_;
        CREATION_CODE_STORE_A = creationCodeStoreA_;
        CREATION_CODE_STORE_B = creationCodeStoreB_;
        TREASURY_CREATION_CODE_HASH = creationCodeHash_;
        TREASURY_CREATION_CODE_SIZE = creationCodeSize_;
        if (keccak256(_creationCode()) != creationCodeHash_) revert CreationCodeMismatch();
    }

    function createTreasury(
        address owner,
        T.UniversalPolicy calldata universal,
        T.ArbitragePolicy calldata arbitrage,
        T.RebalancePolicy calldata rebalance,
        T.RiskPolicy calldata risk
    ) external returns (FairWitnessTreasury treasury) {
        bytes memory creationCode = _creationCode();
        if (keccak256(creationCode) != TREASURY_CREATION_CODE_HASH) revert CreationCodeMismatch();
        bytes memory initCode = bytes.concat(
            creationCode,
            abi.encode(FACT_VALIDATOR, DEX_ADAPTER, owner, universal, arbitrage, rebalance, risk)
        );
        address deployed;
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (deployed == address(0)) revert TreasuryDeploymentFailed();

        treasury = FairWitnessTreasury(deployed);
        // CREATE makes this factory the treasury's immutable lifecycle configurator,
        // so demo/production mode is applied atomically before registry admission.
        treasury.configureLifecycle(DEMO_RESERVE);
        isFactoryTreasury[deployed] = true;
        emit TreasuryCreated(deployed, owner, msg.sender, treasury.currentPolicyHash());
    }

    function _creationCode() private view returns (bytes memory code) {
        uint256 sizeA = CREATION_CODE_STORE_A.code.length;
        uint256 sizeB = CREATION_CODE_STORE_B.code.length;
        uint256 total = sizeA + sizeB;
        if (total != TREASURY_CREATION_CODE_SIZE) revert CreationCodeMismatch();
        code = new bytes(total);
        address storeA = CREATION_CODE_STORE_A;
        address storeB = CREATION_CODE_STORE_B;
        assembly ("memory-safe") {
            extcodecopy(storeA, add(code, 0x20), 0, sizeA)
            extcodecopy(storeB, add(add(code, 0x20), sizeA), 0, sizeB)
        }
    }
}
