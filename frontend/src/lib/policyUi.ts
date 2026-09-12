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

export function reasonLabel(code: number): string { return REASON_LABELS[code] ?? `Unknown reason code (${code})`; }
export function strategyLabel(code: number): StrategyLabel | "Unknown strategy" { return STRATEGIES[code] ?? "Unknown strategy"; }

export interface MandateDraft {
  enabledStrategies: Record<StrategyLabel, boolean>;
  targetWctcBps: number;
  toleranceBps: number;
  maxWctcExposureBps: number;
  maxActionValue: string;
  maxSlippageBps: number;
  minNetEdgeBps: number;
  maxArbitrageValue: string;
  maxRebalanceValue: string;
  maxRiskReductionValue: string;
  dailyRiskReductionValue: string;
  maxSourceDriftBps: number;
  maxSpotTwapDeviationBps: number;
  maxAttemptsPerEpoch: number;
  maxExecutionsPerEpoch: number;
  epochLength: number;
}

export const RECOMMENDED_MANDATE: MandateDraft = {
  enabledStrategies: { Arbitrage: true, Rebalancing: true, "Risk Reduction": true },
  targetWctcBps: 4000,
  toleranceBps: 500,
  maxWctcExposureBps: 6000,
  maxActionValue: "100",
  maxSlippageBps: 300,
  minNetEdgeBps: 100,
  maxArbitrageValue: "100",
  maxRebalanceValue: "100",
  maxRiskReductionValue: "100",
  dailyRiskReductionValue: "300",
  maxSourceDriftBps: 500,
  maxSpotTwapDeviationBps: 1000,
  maxAttemptsPerEpoch: 12,
  maxExecutionsPerEpoch: 6,
  epochLength: 3600,
};

export function validateMandate(draft: MandateDraft): string[] {
  const errors: string[] = [];
  if (!Object.values(draft.enabledStrategies).some(Boolean)) errors.push("Enable at least one strategy.");
  const bps = [["Target allocation", draft.targetWctcBps], ["Tolerance", draft.toleranceBps], ["Risk cap", draft.maxWctcExposureBps], ["Slippage", draft.maxSlippageBps], ["Minimum arbitrage edge", draft.minNetEdgeBps]] as const;
  for (const [name, value] of bps) if (!Number.isInteger(value) || value < 0 || value > 10_000) errors.push(`${name} must be between 0 and 10,000 bps.`);
  if (draft.maxSlippageBps > 1000) errors.push("Maximum slippage cannot exceed the protocol ceiling of 1,000 bps.");
  for (const [name, value] of [["Maximum action", draft.maxActionValue], ["Maximum arbitrage", draft.maxArbitrageValue], ["Maximum rebalance", draft.maxRebalanceValue], ["Maximum risk reduction", draft.maxRiskReductionValue], ["Daily risk reduction", draft.dailyRiskReductionValue]] as const) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) errors.push(`${name} must be positive.`);
  }
  if (draft.targetWctcBps + draft.toleranceBps > draft.maxWctcExposureBps) errors.push("Risk ceiling should remain above the top of the rebalance target band.");
  if (draft.maxAttemptsPerEpoch < draft.maxExecutionsPerEpoch) errors.push("Attempt limit must be at least the execution limit.");
  if (draft.epochLength < 60 || draft.epochLength > 30 * 24 * 60 * 60) errors.push("Epoch length must be between 60 seconds and 30 days.");
  return errors;
}

const e6 = (value: string) => BigInt(Math.round(Number(value) * 1_000_000));

export function strategyMask(enabled: MandateDraft["enabledStrategies"]): number {
  // Solidity StrategyType: Arbitrage=0, Rebalance=1, RiskReduction=2.
  return (enabled.Arbitrage ? 1 : 0) | (enabled.Rebalancing ? 2 : 0) | (enabled["Risk Reduction"] ? 4 : 0);
}

export function toContractPolicies(draft: MandateDraft) {
  return {
    universal: {
      enabledStrategies: strategyMask(draft.enabledStrategies),
      maxActionValueE6: e6(draft.maxActionValue),
      maxSlippageBps: draft.maxSlippageBps,
      maxSourceDriftBps: draft.maxSourceDriftBps,
      maxSpotTwapDeviationBps: draft.maxSpotTwapDeviationBps,
      minSourceLiquidity: 1n,
      minDestinationLiquidity: 1n,
      maxExecutionsPerEpoch: draft.maxExecutionsPerEpoch,
      epochLength: draft.epochLength,
      maxAttemptsPerEpoch: draft.maxAttemptsPerEpoch,
    },
    arbitrage: { minNetEdgeBps: draft.minNetEdgeBps, maxArbitrageValueE6: e6(draft.maxArbitrageValue) },
    rebalance: { targetWctcBps: draft.targetWctcBps, toleranceBps: draft.toleranceBps, maxRebalanceValueE6: e6(draft.maxRebalanceValue) },
    risk: { maxWctcExposureBps: draft.maxWctcExposureBps, maxRiskReductionValueE6: e6(draft.maxRiskReductionValue), dailyRiskReductionValueE6: e6(draft.dailyRiskReductionValue) },
  } as const;
}
