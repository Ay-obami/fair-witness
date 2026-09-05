/** Display-side ActionType values. The contract's enum is ARBITRAGE-only since Task D
 *  (rejections revert and are intentionally not journaled); the REJECTED_* keys remain
 *  only as display labels for defensively rendering impossible/legacy values. */
export const ActionType = {
  ARBITRAGE: 0,
  REJECTED_STALE: 1,
  REJECTED_NARROW: 2,
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/** Task 3.3: which way the treasury's DEX leg traded (mirrors ASCTreasuryJournal.TradeDirection). */
export type TradeDirection = "SELL_BASE_FOR_QUOTE" | "BUY_BASE_FOR_QUOTE";

/** Mirrors ASCTreasuryJournal.sol's JournalEntry struct. */
export interface JournalEntry {
  actionKey: string;
  factKey: string;
  attestedAt: number; // unix seconds
  actedAt: number; // unix seconds
  agent: string;
  decisionHash: string;
  actionType: ActionType;
  /** Task 3.3: decoded from the 6th actionPayload word. Undefined for pre-direction
   *  journal entries (5-field payload) — displayed honestly as "not recorded". */
  direction?: TradeDirection;
  /** Decoded from actionPayload: abi.encode(tradeSize, srcPrice, confPrice, arbWidthBps, amountOut[, direction]) */
  tradeSize: string;
  srcPrice: string;
  confPrice: string;
  arbWidthBps: number;
  amountOut: string;
  /** Task 3.6: explicit evidence identifiers read from the on-chain struct. Undefined
   *  when the entry comes from a pre-3.6 live instance — displayed as "not recorded",
   *  never invented. The destination execution tx hash is deliberately NOT a struct
   *  field: the EVM cannot observe its own tx hash; it is the hash of the transaction
   *  whose receipt carries this actionKey's ActionJournaled event (any explorer). */
  sourceChainKey?: number;
  sourceBlockHeight?: number;
  sourceTxIndex?: number;
  confirmBlockHeight?: number;
  confirmTxIndex?: number;
}

/** Mirrors agent/src/reasoningStore.ts's ReasoningPayload exactly. */
export interface ReasoningPayload {
  observedGapBps: number;
  sourcePrice: string;
  confirmPrice: string;
  destPrice: string;
  rule: string;
  llmRationale: string;
  /** Task 3.3: human-readable TradeDirection name; absent on pre-direction payloads. */
  direction?: string;
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

/**
 * String-based form inputs for the sign-up flow. These are converted to BigInt
 * when passed to the factory's createTreasury() function (USDC has 6 decimals,
 * so maxTradeSize is entered in dollars and multiplied by 1_000_000).
 */
export interface GuardrailsInput {
  maxTradeSize: string;
  maxSlippageBps: string;
  minArbWidthBps: string;
  maxDriftBps: string;
  maxConfirmGapBlocks: string;
  maxActionsPerEpoch: string;
  epochLength: string;
}
