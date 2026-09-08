// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFairWitnessTypes} from "../interfaces/IFairWitnessTypes.sol";

/// @notice Domain-separated canonical schema-v1 hashes.
/// @dev Every function uses abi.encode. Packed encoding is intentionally forbidden.
library FairWitnessHashing {
    uint8 internal constant PROPOSAL_SCHEMA_VERSION = 1;
    bytes32 internal constant EVIDENCE_SCHEMA_V1 = keccak256("FAIR_WITNESS_EVIDENCE_V1");
    bytes32 internal constant POLICY_SCHEMA_V1 = keccak256("FAIR_WITNESS_POLICY_V1");

    function proposalId(uint256 chainId, address treasury, IFairWitnessTypes.Proposal memory proposal)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(chainId, treasury, proposal));
    }

    function executionKey(address treasury, IFairWitnessTypes.Proposal memory proposal)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(treasury, proposal.strategy, proposal.action, proposal.evidenceHash));
    }

    function evidenceHash(IFairWitnessTypes.EvidenceHashInput memory evidence) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EVIDENCE_SCHEMA_V1,
                evidence.sourceChainKey,
                evidence.sourceBlockHeight,
                evidence.sourceTxIndex,
                evidence.confirmBlockHeight,
                evidence.confirmTxIndex,
                evidence.immutableObserver,
                evidence.immutableSourcePool,
                evidence.sourcePriceE6,
                evidence.confirmPriceE6,
                evidence.sourceMeanTick,
                evidence.confirmMeanTick,
                evidence.sourceLiquidity,
                evidence.confirmLiquidity
            )
        );
    }

    function policyHash(
        uint256 chainId,
        address treasury,
        IFairWitnessTypes.PolicyHashInput memory policy
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                POLICY_SCHEMA_V1,
                chainId,
                treasury,
                policy.wctc,
                policy.stable,
                policy.venue,
                policy.universal,
                policy.arbitrage,
                policy.rebalance,
                policy.risk,
                policy.automationMode,
                policy.policyEpoch
            )
        );
    }
}
