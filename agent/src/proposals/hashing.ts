import { ethers } from "ethers";
import type { Address } from "../domain/types.js";
import type { EvidenceHashInputV1, PolicyHashInputV1, ProposalV1 } from "./types.js";

export const EVIDENCE_SCHEMA_V1 = ethers.id("FAIR_WITNESS_EVIDENCE_V1");
export const POLICY_SCHEMA_V1 = ethers.id("FAIR_WITNESS_POLICY_V1");

const coder = ethers.AbiCoder.defaultAbiCoder();
const PROPOSAL_TUPLE =
  "tuple(uint8 schemaVersion,uint8 strategy,uint8 action,address assetIn,address assetOut,address venue,uint128 amountIn,uint16 maxSlippageBps,uint64 deadline,uint64 nonce,bytes32 evidenceHash,bytes32 observationHash,bytes32 decisionHash,bytes32 policyHash)";
const UNIVERSAL_POLICY_TUPLE =
  "tuple(uint8 enabledStrategies,uint128 maxActionValueE6,uint16 maxSlippageBps,uint16 maxSourceDriftBps,uint16 maxSpotTwapDeviationBps,uint128 minSourceLiquidity,uint128 minDestinationLiquidity,uint16 maxExecutionsPerEpoch,uint32 epochLength,uint16 maxAttemptsPerEpoch)";
const ARBITRAGE_POLICY_TUPLE =
  "tuple(uint16 minNetEdgeBps,uint128 maxArbitrageValueE6)";
const REBALANCE_POLICY_TUPLE =
  "tuple(uint16 targetWctcBps,uint16 toleranceBps,uint128 maxRebalanceValueE6)";
const RISK_POLICY_TUPLE =
  "tuple(uint16 maxWctcExposureBps,uint128 maxRiskReductionValueE6,uint128 dailyRiskReductionValueE6)";

export function hashProposal(chainId: bigint, treasury: Address, proposal: ProposalV1): string {
  return ethers.keccak256(coder.encode(["uint256", "address", PROPOSAL_TUPLE], [chainId, treasury, proposal]));
}

export function executionKey(treasury: Address, proposal: ProposalV1): string {
  return ethers.keccak256(
    coder.encode(
      ["address", "uint8", "uint8", "bytes32"],
      [treasury, proposal.strategy, proposal.action, proposal.evidenceHash]
    )
  );
}

export function hashEvidence(input: EvidenceHashInputV1): string {
  return ethers.keccak256(
    coder.encode(
      [
        "bytes32", "uint64", "uint64", "uint64", "uint64", "uint64", "address", "address",
        "uint256", "uint256", "int24", "int24", "uint128", "uint128",
      ],
      [
        EVIDENCE_SCHEMA_V1, input.sourceChainKey, input.sourceBlockHeight, input.sourceTxIndex,
        input.confirmBlockHeight, input.confirmTxIndex, input.immutableObserver, input.immutableSourcePool,
        input.sourcePriceE6, input.confirmPriceE6, input.sourceMeanTick, input.confirmMeanTick,
        input.sourceLiquidity, input.confirmLiquidity,
      ]
    )
  );
}

export function hashPolicy(chainId: bigint, treasury: Address, input: PolicyHashInputV1): string {
  return ethers.keccak256(
    coder.encode(
      [
        "bytes32", "uint256", "address", "address", "address", "address", UNIVERSAL_POLICY_TUPLE,
        ARBITRAGE_POLICY_TUPLE, REBALANCE_POLICY_TUPLE, RISK_POLICY_TUPLE, "uint8", "uint64",
      ],
      [
        POLICY_SCHEMA_V1, chainId, treasury, input.wctc, input.stable, input.venue, input.universal,
        input.arbitrage, input.rebalance, input.risk, input.automationMode, input.policyEpoch,
      ]
    )
  );
}
