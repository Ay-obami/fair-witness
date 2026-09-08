import { describe, expect, it } from "vitest";
import { AutomationMode, StrategyType, TradeDirection, type MandateSnapshot, type VerifiedContext } from "../src/domain/types.js";
import { ArbitrageStrategy } from "../src/strategies/arbitrage.js";
import { buildArbitragePrompt } from "../src/strategies/arbitragePrompt.js";

const h = (byte: string) => `0x${byte.repeat(64)}` as `0x${string}`;
const address = (digit: string) => `0x${digit.repeat(40)}` as `0x${string}`;
const mandate = {
  treasuryAddress: address("1"), wctc: address("2"), stable: address("3"), venue: address("4"),
  policyHash: h("a"), policyEpoch: 1n, automationMode: AutomationMode.AUTONOMOUS,
  universal: { enabledStrategies: 7, maxActionValueE6: 2_000_000_000n, maxSlippageBps: 100,
    maxSourceDriftBps: 100, maxSpotTwapDeviationBps: 50, minSourceLiquidity: 100n,
    minDestinationLiquidity: 100n, maxExecutionsPerEpoch: 2, epochLength: 3600, maxAttemptsPerEpoch: 10 },
  arbitrage: { minNetEdgeBps: 80, maxArbitrageValueE6: 2_000_000_000n },
  rebalance: { targetWctcBps: 4000, toleranceBps: 500, maxRebalanceValueE6: 1n },
  risk: { maxWctcExposureBps: 6000, maxRiskReductionValueE6: 1n, dailyRiskReductionValueE6: 1n },
} satisfies MandateSnapshot;
const context = {
  treasuryAddress: mandate.treasuryAddress, observationHash: h("b"),
  evidence: { evidenceHash: h("c"),
    source: { chainKey: 3n, blockHeight: 100n, transactionIndex: 1n, transactionHash: h("d"), reporter: address("5"), arithmeticMeanTick: 0n, spotSqrtPriceX96: 1n, liquidity: 1000n, priceE6: 1_000_000n },
    confirmation: { chainKey: 3n, blockHeight: 105n, transactionIndex: 2n, transactionHash: h("e"), reporter: address("5"), arithmeticMeanTick: 0n, spotSqrtPriceX96: 1n, liquidity: 1000n, priceE6: 1_000_000n } },
  destination: { readBlockNumber: 1n, twapPriceE6: 1_100_000n, spotPriceE6: 1_100_000n, arithmeticMeanTick: 0n, liquidity: 1000n, poolFee: 500 },
  portfolio: { readBlockNumber: 1n, wctcBalance: 100n * 10n ** 18n, stableBalance: 100_000_000n },
} satisfies VerifiedContext;

describe("ArbitrageStrategy", () => {
  it("mirrors deterministic sell direction, costs, and balance-capped size", () => {
    const candidate = new ArbitrageStrategy(50).evaluate(context, mandate);
    expect(candidate?.strategy).toBe(StrategyType.ARBITRAGE);
    expect(candidate?.direction).toBe(TradeDirection.SELL_WCTC);
    expect(candidate?.deterministicAmountIn).toBe(100n * 10n ** 18n);
    expect(candidate?.metrics.netEdgeBps).toBe(925);
  });
  it("returns no candidate for drift, weak edge, liquidity, or excessive requested slippage", () => {
    expect(new ArbitrageStrategy(101).evaluate(context, mandate)).toBeNull();
    expect(new ArbitrageStrategy(50).evaluate({ ...context, destination: { ...context.destination, twapPriceE6: 1_005_000n, spotPriceE6: 1_005_000n } }, mandate)).toBeNull();
    expect(new ArbitrageStrategy(50).evaluate({ ...context, destination: { ...context.destination, liquidity: 1n } }, mandate)).toBeNull();
  });
  it("builds a replayable prompt with a closed non-executable response boundary", () => {
    const candidate = new ArbitrageStrategy(50).evaluate(context, mandate)!;
    const prompt = JSON.parse(buildArbitragePrompt(candidate, mandate));
    expect(prompt.allowedResponseKeys).toEqual(["decision", "strategy", "rationale", "reasonTags"]);
    expect(prompt.immutableMandate.minNetEdgeBps).toBe(80);
    expect(prompt).not.toHaveProperty("calldata");
  });
});
