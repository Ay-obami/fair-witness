import { ethers } from "ethers";

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

const MAX_UINT16 = 65_535;
const MAX_UINT32 = 4_294_967_295;
const MAX_UINT128 = (1n << 128n) - 1n;

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function parsePolicyAmountE6(value: string): bigint {
  const normalized = value.trim();
  if (!normalized) throw new Error("amount is required");
  const parsed = ethers.parseUnits(normalized, 6);
  if (parsed <= 0n) throw new Error("amount must be positive");
  if (parsed > MAX_UINT128) throw new Error("amount exceeds uint128");
  return parsed;
}

function validateAmount(errors: string[], label: string, value: string) {
  try { parsePolicyAmountE6(value); }
  catch { errors.push(`${label} must be a positive value with at most 6 decimal places.`); }
}

export function strategyMask(enabled: MandateDraft["enabledStrategies"]): number {
  // Solidity StrategyType: Arbitrage=0, Rebalance=1, RiskReduction=2.
  return (enabled.Arbitrage ? 1 : 0) | (enabled.Rebalancing ? 2 : 0) | (enabled["Risk Reduction"] ? 4 : 0);
}

export function validateMandate(draft: MandateDraft): string[] {
  const errors: string[] = [];
  const mask = strategyMask(draft.enabledStrategies);
  if (mask === 0) errors.push("Enable at least one strategy.");

  validateAmount(errors, "Maximum action", draft.maxActionValue);

  for (const [name, value] of [
    ["Maximum slippage", draft.maxSlippageBps],
    ["Maximum source drift", draft.maxSourceDriftBps],
    ["Maximum spot/TWAP deviation", draft.maxSpotTwapDeviationBps],
    ["Minimum arbitrage edge", draft.minNetEdgeBps],
    ["Target allocation", draft.targetWctcBps],
    ["Rebalance tolerance", draft.toleranceBps],
    ["Risk cap", draft.maxWctcExposureBps],
  ] as const) {
    if (!integerInRange(value, 0, MAX_UINT16)) errors.push(`${name} must fit an unsigned 16-bit basis-point value.`);
  }

  if (draft.maxSlippageBps > 1_000) errors.push("Maximum slippage cannot exceed the protocol ceiling of 1,000 bps.");
  if (!integerInRange(draft.maxExecutionsPerEpoch, 1, MAX_UINT16)) errors.push("Executions per epoch must be an integer between 1 and 65,535.");
  if (!integerInRange(draft.maxAttemptsPerEpoch, 1, MAX_UINT16)) errors.push("Attempts per epoch must be an integer between 1 and 65,535.");
  if (draft.maxAttemptsPerEpoch < draft.maxExecutionsPerEpoch) errors.push("Attempt limit must be at least the execution limit.");
  if (!integerInRange(draft.epochLength, 60, Math.min(30 * 24 * 60 * 60, MAX_UINT32))) {
    errors.push("Epoch length must be between 60 seconds and 30 days.");
  }

  if (draft.enabledStrategies.Arbitrage) {
    if (draft.minNetEdgeBps <= 0) errors.push("Minimum arbitrage edge must be greater than zero when Arbitrage is enabled.");
    validateAmount(errors, "Maximum arbitrage", draft.maxArbitrageValue);
  }

  if (draft.enabledStrategies.Rebalancing) {
    if (draft.targetWctcBps > 10_000) errors.push("Target allocation cannot exceed 100%.");
    if (draft.toleranceBps <= 0) errors.push("Rebalance tolerance must be greater than zero when Rebalancing is enabled.");
    validateAmount(errors, "Maximum rebalance", draft.maxRebalanceValue);
  }

  if (draft.enabledStrategies["Risk Reduction"]) {
    if (draft.maxWctcExposureBps > 10_000) errors.push("Risk cap cannot exceed 100%.");
    validateAmount(errors, "Maximum risk reduction", draft.maxRiskReductionValue);
    validateAmount(errors, "Daily risk reduction", draft.dailyRiskReductionValue);
  }

  if (
    draft.enabledStrategies.Rebalancing &&
    draft.enabledStrategies["Risk Reduction"] &&
    draft.maxWctcExposureBps <= draft.targetWctcBps + draft.toleranceBps
  ) {
    errors.push("Risk ceiling must be strictly above the top of the rebalance target band.");
  }

  return [...new Set(errors)];
}

export function toContractPolicies(draft: MandateDraft) {
  // Callers should validate first; parsing remains fail-closed if malformed input reaches here.
  return {
    universal: {
      enabledStrategies: strategyMask(draft.enabledStrategies),
      maxActionValueE6: parsePolicyAmountE6(draft.maxActionValue),
      maxSlippageBps: draft.maxSlippageBps,
      maxSourceDriftBps: draft.maxSourceDriftBps,
      maxSpotTwapDeviationBps: draft.maxSpotTwapDeviationBps,
      minSourceLiquidity: 1n,
      minDestinationLiquidity: 1n,
      maxExecutionsPerEpoch: draft.maxExecutionsPerEpoch,
      epochLength: draft.epochLength,
      maxAttemptsPerEpoch: draft.maxAttemptsPerEpoch,
    },
    arbitrage: {
      minNetEdgeBps: draft.minNetEdgeBps,
      maxArbitrageValueE6: draft.enabledStrategies.Arbitrage ? parsePolicyAmountE6(draft.maxArbitrageValue) : 0n,
    },
    rebalance: {
      targetWctcBps: draft.targetWctcBps,
      toleranceBps: draft.toleranceBps,
      maxRebalanceValueE6: draft.enabledStrategies.Rebalancing ? parsePolicyAmountE6(draft.maxRebalanceValue) : 0n,
    },
    risk: {
      maxWctcExposureBps: draft.maxWctcExposureBps,
      maxRiskReductionValueE6: draft.enabledStrategies["Risk Reduction"] ? parsePolicyAmountE6(draft.maxRiskReductionValue) : 0n,
      dailyRiskReductionValueE6: draft.enabledStrategies["Risk Reduction"] ? parsePolicyAmountE6(draft.dailyRiskReductionValue) : 0n,
    },
  } as const;
}
