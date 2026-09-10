import { describe, expect, it } from "vitest";
import { AutomationMode, TradeDirection, type MandateSnapshot, type VerifiedContext } from "../src/domain/types.js";
import { RiskReductionStrategy } from "../src/strategies/riskReduction.js";

const hash = `0x${"aa".repeat(32)}` as `0x${string}`;
const addr = (n: string) => `0x${n.repeat(40)}` as `0x${string}`;
const mandate = {
  treasuryAddress: addr("1"), wctc: addr("2"), stable: addr("3"), venue: addr("4"), policyHash: hash,
  policyEpoch: 1n, automationMode: AutomationMode.AUTONOMOUS,
  universal: { enabledStrategies: 7, maxActionValueE6: 30_000_000n, maxSlippageBps: 100, maxSourceDriftBps: 100,
    maxSpotTwapDeviationBps: 50, minSourceLiquidity: 1n, minDestinationLiquidity: 1n,
    maxExecutionsPerEpoch: 10, epochLength: 3600, maxAttemptsPerEpoch: 20 },
  arbitrage: { minNetEdgeBps: 80, maxArbitrageValueE6: 1n },
  rebalance: { targetWctcBps: 4000, toleranceBps: 500, maxRebalanceValueE6: 1n },
  risk: { maxWctcExposureBps: 6000, maxRiskReductionValueE6: 10_000_000n, dailyRiskReductionValueE6: 15_000_000n },
} satisfies MandateSnapshot;
function context(wctcBalance: bigint, stableBalance: bigint, dailyUsed = 0n): VerifiedContext {
  const observation = { chainKey: 3n, blockHeight: 1n, transactionIndex: 1n, transactionHash: hash,
    reporter: addr("5"), arithmeticMeanTick: 0n, spotSqrtPriceX96: 1n, liquidity: 100n, priceE6: 1_000_000n };
  return { treasuryAddress: mandate.treasuryAddress, observationHash: hash,
    evidence: { evidenceHash: hash, source: observation, confirmation: observation },
    destination: { readBlockNumber: 1n, twapPriceE6: 1_000_000n, spotPriceE6: 1_000_000n,
      arithmeticMeanTick: 0n, liquidity: 100n, poolFee: 500 },
    portfolio: { readBlockNumber: 1n, wctcBalance, stableBalance, dailyRiskReductionUsedE6: dailyUsed } };
}

describe("RiskReductionStrategy", () => {
  const strategy = new RiskReductionStrategy();
  it("derives a capped WCTC sale above the strict threshold", () => {
    const candidate = strategy.evaluate(context(80n * 10n ** 18n, 20_000_000n), mandate)!;
    expect(candidate.direction).toBe(TradeDirection.SELL_WCTC);
    expect(candidate.metrics.currentWctcBps).toBe(8000);
    expect(candidate.metrics.excessValueE6).toBe(20_000_000n);
    expect(candidate.permittedValueE6).toBe(10_000_000n);
    expect(candidate.deterministicAmountIn).toBe(10n * 10n ** 18n);
  });
  it("does not trigger below or exactly at the exposure threshold", () => {
    expect(strategy.evaluate(context(59n * 10n ** 18n, 41_000_000n), mandate)).toBeNull();
    expect(strategy.evaluate(context(60n * 10n ** 18n, 40_000_000n), mandate)).toBeNull();
  });
  it("caps by remaining daily and universal allowance", () => {
    const daily = strategy.evaluate(context(80n * 10n ** 18n, 20_000_000n, 12_000_000n), mandate)!;
    expect(daily.permittedValueE6).toBe(3_000_000n);
    const universal = { ...mandate, universal: { ...mandate.universal, maxActionValueE6: 2_000_000n } };
    expect(strategy.evaluate(context(80n * 10n ** 18n, 20_000_000n), universal)!.permittedValueE6).toBe(2_000_000n);
  });
  it("fails closed for exhausted daily usage, invalid market, and rounding dust", () => {
    expect(strategy.evaluate(context(80n * 10n ** 18n, 20_000_000n, 15_000_000n), mandate)).toBeNull();
    const invalid = context(80n * 10n ** 18n, 20_000_000n); invalid.destination.liquidity = 0n;
    expect(strategy.evaluate(invalid, mandate)).toBeNull();
    expect(strategy.evaluate(context(1n, 0n), mandate)).toBeNull();
  });
});
