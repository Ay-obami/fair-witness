/** Mirrors ASCTreasuryJournal.sol's ActionType enum exactly (0=ARBITRAGE, 1=REJECTED_STALE, 2=REJECTED_NARROW). */
export const ActionType = {
  ARBITRAGE: 0,
  REJECTED_STALE: 1,
  REJECTED_NARROW: 2,
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/** Mirrors ASCTreasuryJournal.sol's JournalEntry struct. */
export interface JournalEntry {
  actionKey: string;
  factKey: string;
  attestedAt: number; // unix seconds
  actedAt: number; // unix seconds
  agent: string;
  decisionHash: string;
  actionType: ActionType;
  /** Decoded from actionPayload: abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps, amountOut) */
  tradeSize: string;
  srcPrice: string;
  confPrice: string;
  arbWidthBps: number;
  amountOut: string;
}

/** Mirrors agent/src/reasoningStore.ts's ReasoningPayload exactly. */
export interface ReasoningPayload {
  observedGapBps: number;
  sourcePrice: string;
  confirmPrice: string;
  destPrice: string;
  rule: string;
  llmRationale: string;
  timestamp: string;
}

export interface ReplayData {
  entry: JournalEntry;
  reasoning: ReasoningPayload | null;
  hashMatches: boolean | null; // null if reasoning wasn't found at all
  sepoliaExplorerFactHint: string; // human-readable pointer for independent verification
}

/**
 * Mirrors the immutable guardrails baked into an ASCTreasuryJournal instance at
 * construction time (V2 multi-tenant pivot). These are constructor-set `immutable`s —
 * they can never be loosened after deployment, even by the instance's owner, which is
 * exactly why showing them next to a replayed action is meaningful: the viewer proves
 * which rigid bounds the contract enforced, read live from the instance itself.
 */
export interface Guardrails {
  maxTradeSize: string;
  maxSlippageBps: number;
  minArbWidthBps: number;
  maxDriftBps: number;
  maxConfirmGapBlocks: number;
  maxActionsPerEpoch: number;
  epochLength: number;
}

/** The live identity of a treasury instance being viewed. */
export interface TreasuryInfo {
  address: string;
  owner: string;
  journalLength: number;
  guardrails: Guardrails;
}
