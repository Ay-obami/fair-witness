export const STRATEGIES = ["Arbitrage", "Rebalancing", "Risk Reduction"] as const;
export type StrategyLabel = (typeof STRATEGIES)[number];

export const REASON_LABELS = [
  "No policy violation", "Unsupported proposal schema", "Invalid proposal commitment",
  "Automation is paused", "Strategy is disabled", "Action is not allowed",
  "Asset is not allowed", "Venue is not allowed", "Proposal has expired",
  "Deadline is too far away", "Slippage exceeds policy", "Policy hash does not match",
  "Proposal was already processed", "Nonce was already used", "Evidence was already executed",
  "Evidence is invalid", "Evidence is stale", "Evidence hash does not match",
  "Source price drift is too high", "Source liquidity is too low", "Destination market is invalid",
  "Destination liquidity is too low", "Destination spot/TWAP deviation is too high",
  "Trade direction does not reduce the condition", "Arbitrage edge is too low",
  "Portfolio is within rebalance tolerance", "Risk threshold is not breached",
  "Executable amount rounds to zero", "Amount exceeds policy", "Amount differs from deterministic calculation",
  "Daily risk-reduction limit reached", "Treasury balance is insufficient",
  "Execution rate limit reached", "Approved execution reverted",
] as const;

export function reasonLabel(code: number): string {
  return REASON_LABELS[code] ?? `Unknown reason code (${code})`;
}

export function strategyLabel(code: number): StrategyLabel | "Unknown strategy" {
  return STRATEGIES[code] ?? "Unknown strategy";
}

export interface MandateDraft {
  capitalInstructions: string;
  enabledStrategies: Record<StrategyLabel, boolean>;
  targetWctcBps: number;
  toleranceBps: number;
  maxWctcExposureBps: number;
  maxActionValue: string;
  maxSlippageBps: number;
  wctc: string;
  stable: string;
  venue: string;
  automation: "Paused" | "Autonomous";
}

export function validateMandate(draft: MandateDraft): string[] {
  const errors: string[] = [];
  if (!Object.values(draft.enabledStrategies).some(Boolean)) errors.push("Enable at least one strategy.");
  if (draft.targetWctcBps < 0 || draft.targetWctcBps > 10_000) errors.push("Target allocation must be between 0 and 10,000 bps.");
  if (draft.toleranceBps < 0 || draft.toleranceBps > 10_000) errors.push("Tolerance must be between 0 and 10,000 bps.");
  if (draft.maxWctcExposureBps < 0 || draft.maxWctcExposureBps > 10_000) errors.push("Risk cap must be between 0 and 10,000 bps.");
  if (!Number.isFinite(Number(draft.maxActionValue)) || Number(draft.maxActionValue) <= 0) errors.push("Maximum action value must be positive.");
  if (draft.maxSlippageBps < 0 || draft.maxSlippageBps > 1_000) errors.push("Maximum slippage cannot exceed the protocol ceiling of 1,000 bps.");
  for (const [label, value] of [["WCTC", draft.wctc], ["stable asset", draft.stable], ["venue", draft.venue]] as const) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) errors.push(`${label} must be a valid address.`);
  }
  return errors;
}
