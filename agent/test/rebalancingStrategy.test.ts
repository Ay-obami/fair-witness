import { describe, expect, it } from "vitest";
import { AutomationMode, TradeDirection, type MandateSnapshot, type VerifiedContext } from "../src/domain/types.js";
import { RebalancingStrategy } from "../src/strategies/rebalancing.js";

const hash = `0x${"aa".repeat(32)}` as `0x${string}`;
const addr = (n: string) => `0x${n.repeat(40)}` as `0x${string}`;
const mandate = {
  treasuryAddress: addr("1"), wctc: addr("2"), stable: addr("3"), venue: addr("4"), policyHash: hash,
  policyEpoch: 1n, automationMode: AutomationMode.AUTONOMOUS,
  universal: { enabledStrategies: 7, maxActionValueE6: 30_000_000n, maxSlippageBps: 100, maxSourceDriftBps: 100,
    maxSpotTwapDeviationBps: 50, minSourceLiquidity: 1n, minDestinationLiquidity: 1n,
    maxExecutionsPerEpoch: 2, epochLength: 3600, maxAttemptsPerEpoch: 10 },
  arbitrage: { minNetEdgeBps: 80, maxArbitrageValueE6: 1n },
  rebalance: { targetWctcBps: 4000, toleranceBps: 500, maxRebalanceValueE6: 50_000_000n },
  risk: { maxWctcExposureBps: 6000, maxRiskReductionValueE6: 1n, dailyRiskReductionValueE6: 1n },
} satisfies MandateSnapshot;
function context(wctcBalance: bigint, stableBalance: bigint): VerifiedContext {
  const observation = { chainKey: 3n, blockHeight: 1n, transactionIndex: 1n, transactionHash: hash,
    reporter: addr("5"), arithmeticMeanTick: 0n, spotSqrtPriceX96: 1n, liquidity: 100n, priceE6: 1_000_000n };
  return { treasuryAddress: mandate.treasuryAddress, observationHash: hash,
    evidence: { evidenceHash: hash, source: observation, confirmation: observation },
    destination: { readBlockNumber: 1n, twapPriceE6: 1_000_000n, spotPriceE6: 1_000_000n,
      arithmeticMeanTick: 0n, liquidity: 100n, poolFee: 500 },
    portfolio: { readBlockNumber: 1n, wctcBalance, stableBalance, dailyRiskReductionUsedE6: 0n } };
}

describe("RebalancingStrategy", () => {
  const strategy = new RebalancingStrategy();
  it("calculates a capped sell above target", () => {
    const candidate = strategy.evaluate(context(80n * 10n ** 18n, 20_000_000n), mandate)!;
    expect(candidate.direction).toBe(TradeDirection.SELL_WCTC);
    expect(candidate.metrics.currentWctcBps).toBe(8000);
    expect(candidate.metrics.requiredAdjustmentE6).toBe(40_000_000n);
    expect(candidate.permittedValueE6).toBe(30_000_000n);
    expect(candidate.deterministicAmountIn).toBe(30n * 10n ** 18n);
  });
  it("calculates an exact stable buy below target", () => {
    const candidate = strategy.evaluate(context(20n * 10n ** 18n, 80_000_000n), mandate)!;
    expect(candidate.direction).toBe(TradeDirection.BUY_WCTC);
    expect(candidate.deterministicAmountIn).toBe(20_000_000n);
  });
  it("does not propose inside inclusive tolerance or for an empty portfolio", () => {
    expect(strategy.evaluate(context(45n * 10n ** 18n, 55_000_000n), mandate)).toBeNull();
    expect(strategy.evaluate(context(35n * 10n ** 18n, 65_000_000n), mandate)).toBeNull();
    expect(strategy.evaluate(context(0n, 0n), mandate)).toBeNull();
  });
  it("handles a one-sided portfolio and conservative rounding dust", () => {
    const oneSided = strategy.evaluate(context(100n * 10n ** 18n, 0n), mandate)!;
    expect(oneSided.direction).toBe(TradeDirection.SELL_WCTC);
    expect(oneSided.permittedValueE6).toBe(30_000_000n);
    const dust = context(1n, 0n);
    expect(strategy.evaluate(dust, mandate)).toBeNull();
  });
});
