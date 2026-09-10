export type SyncStatus = "PENDING" | "CANONICAL" | "ORPHANED";
export type DecisionOutcome = "EXECUTE" | "WAIT";

export interface ChainLogIdentity {
  chainId: bigint;
  transactionHash: string;
  blockNumber: bigint;
  blockHash: string;
  logIndex: number;
}

export interface AttemptProjection extends ChainLogIdentity {
  treasuryAddress: string;
  attemptId: bigint;
  proposalId: string;
  executionKey: string;
  agent: string;
  nonce: bigint;
  sourceChainKey: bigint;
  sourceBlockHeight: bigint;
  sourceTxIndex: bigint;
  confirmBlockHeight: bigint;
  confirmTxIndex: bigint;
  assetIn: string;
  assetOut: string;
  venue: string;
  strategy: number;
  action: number;
  result: number;
  reason: number;
  evidenceStatus: number;
  evidenceHash: string;
  observationHash: string;
  decisionHash: string;
  policyHash: string;
  evaluatedStateHash: string;
  proposedAmountIn: bigint;
  permittedValueE6: bigint;
  amountInActual: bigint;
  amountOutActual: bigint;
  currentWctcBps: number;
  referenceBps: number;
  submittedAt: bigint;
  resolvedAt: bigint;
  syncStatus: SyncStatus;
}

export interface DecisionArtifact {
  decisionHash: string;
  observationHash: string;
  evidenceHash: string;
  policyHash: string;
  strategy: number;
  outcome: DecisionOutcome;
  canonicalEnvelope: unknown;
}

export interface ReplayBundle {
  attempt: AttemptProjection | null;
  decision: DecisionArtifact | null;
  integrity: "MATCH" | "MISMATCH" | "MISSING_ARTIFACT" | "WAIT_NOT_SUBMITTED";
}

export interface AuditRepository {
  upsertAttempt(attempt: AttemptProjection): Promise<void>;
  attempt(chainId: bigint, treasuryAddress: string, attemptId: bigint): Promise<AttemptProjection | null>;
  markBlockOrphaned(chainId: bigint, blockHash: string): Promise<number>;
  putDecision(decision: DecisionArtifact): Promise<void>;
  decision(decisionHash: string): Promise<DecisionArtifact | null>;
}
