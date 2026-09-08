import type {
  ActionType,
  Address,
  AutomationMode,
  Hex32,
  StrategyType,
} from "../domain/types.js";
import type {
  ArbitragePolicySnapshot,
  RebalancePolicySnapshot,
  RiskPolicySnapshot,
  UniversalPolicySnapshot,
} from "../domain/types.js";

export const PROPOSAL_SCHEMA_VERSION = 1 as const;

export interface ProposalV1 {
  schemaVersion: typeof PROPOSAL_SCHEMA_VERSION;
  strategy: StrategyType;
  action: ActionType;
  assetIn: Address;
  assetOut: Address;
  venue: Address;
  amountIn: bigint;
  maxSlippageBps: number;
  deadline: bigint;
  nonce: bigint;
  evidenceHash: Hex32;
  observationHash: Hex32;
  decisionHash: Hex32;
  policyHash: Hex32;
}

export interface EvidenceHashInputV1 {
  sourceChainKey: bigint;
  sourceBlockHeight: bigint;
  sourceTxIndex: bigint;
  confirmBlockHeight: bigint;
  confirmTxIndex: bigint;
  immutableObserver: Address;
  immutableSourcePool: Address;
  sourcePriceE6: bigint;
  confirmPriceE6: bigint;
  sourceMeanTick: bigint;
  confirmMeanTick: bigint;
  sourceLiquidity: bigint;
  confirmLiquidity: bigint;
}

export interface PolicyHashInputV1 {
  wctc: Address;
  stable: Address;
  venue: Address;
  universal: UniversalPolicySnapshot;
  arbitrage: ArbitragePolicySnapshot;
  rebalance: RebalancePolicySnapshot;
  risk: RiskPolicySnapshot;
  automationMode: AutomationMode;
  policyEpoch: bigint;
}

export interface ProposalEnvelope {
  /** Durable per-agent sequence supplied by trusted orchestration, never by AI. */
  nonce: bigint;
  /** Absolute chain timestamp; the policy contract will enforce expiry. */
  deadline: bigint;
  /** May tighten, but never exceed, the mandate ceiling. */
  maxSlippageBps: number;
  decisionHash: Hex32;
}
