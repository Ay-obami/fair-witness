import { describe, expect, it, vi } from "vitest";
import {
  ALL_STRATEGIES_MASK,
  ActionType,
  AutomationMode,
  StrategyType,
  TradeDirection,
  strategyBit,
  type Address,
  type Candidate,
  type Hex32,
  type MandateSnapshot,
  type TypedStrategyMetrics,
  type VerifiedContext,
} from "../src/domain/index.js";
import {
  STRATEGY_PRIORITY,
  StrategyCoordinator,
  StrategyEvaluationCycle,
  selectHighestPriorityCandidate,
  type Strategy,
} from "../src/strategies/index.js";

const address = (digit: string) => `0x${digit.repeat(40)}` as Address;
const hash = (digit: string) => `0x${digit.repeat(64)}` as Hex32;

const context: VerifiedContext = {
  treasuryAddress: address("1"),
  observationHash: hash("a"),
  evidence: {
    evidenceHash: hash("b"),
    source: {
      chainKey: 1n,
      blockHeight: 100n,
      transactionIndex: 2n,
      transactionHash: hash("c"),
      reporter: address("2"),
      arithmeticMeanTick: 10n,
      spotSqrtPriceX96: 1n << 96n,
      liquidity: 1_000n,
      priceE6: 1_000_000n,
    },
    confirmation: {
      chainKey: 1n,
      blockHeight: 103n,
      transactionIndex: 1n,
      transactionHash: hash("d"),
      reporter: address("2"),
      arithmeticMeanTick: 11n,
      spotSqrtPriceX96: 1n << 96n,
      liquidity: 1_100n,
      priceE6: 1_001_000n,
    },
  },
  destination: {
    readBlockNumber: 500n,
    twapPriceE6: 1_020_000n,
    spotPriceE6: 1_019_000n,
    arithmeticMeanTick: 12n,
    liquidity: 2_000n,
    poolFee: 500,
  },
  portfolio: {
    readBlockNumber: 500n,
    wctcBalance: 10n * 10n ** 18n,
    stableBalance: 10_000_000n,
    dailyRiskReductionUsedE6: 0n,
  },
};

const mandate: MandateSnapshot = {
  treasuryAddress: context.treasuryAddress,
  wctc: address("3"),
  stable: address("4"),
  venue: address("5"),
  policyHash: hash("e"),
  policyEpoch: 0n,
  automationMode: AutomationMode.AUTONOMOUS,
  universal: {
    enabledStrategies: ALL_STRATEGIES_MASK,
    maxActionValueE6: 1_000_000n,
    maxSlippageBps: 100,
    maxSourceDriftBps: 100,
    maxSpotTwapDeviationBps: 100,
    minSourceLiquidity: 1n,
    minDestinationLiquidity: 1n,
    maxExecutionsPerEpoch: 3,
    epochLength: 3_600,
    maxAttemptsPerEpoch: 10,
  },
  arbitrage: { minNetEdgeBps: 50, maxArbitrageValueE6: 500_000n },
  rebalance: { targetWctcBps: 4_000, toleranceBps: 500, maxRebalanceValueE6: 600_000n },
  risk: { maxWctcExposureBps: 6_000, maxRiskReductionValueE6: 700_000n, dailyRiskReductionValueE6: 1_000_000n },
};

function metrics(type: StrategyType): TypedStrategyMetrics {
  if (type === StrategyType.ARBITRAGE) {
    return {
      kind: type,
      sourcePriceE6: 1_000_000n,
      confirmationPriceE6: 1_001_000n,
      destinationTwapPriceE6: 1_020_000n,
      destinationSpotPriceE6: 1_019_000n,
      sourceDriftBps: 10,
      spotTwapDeviationBps: 10,
      grossEdgeBps: 190,
      poolFeeBps: 5,
      effectiveSlippageBps: 100,
      executionReserveBps: 20,
      netEdgeBps: 65,
    };
  }
  if (type === StrategyType.REBALANCE) {
    return {
      kind: type,
      portfolioValueE6: 20_000_000n,
      wctcValueE6: 10_000_000n,
      currentWctcBps: 5_000,
      targetWctcBps: 4_000,
      toleranceBps: 500,
      deviationBps: 1_000,
      requiredAdjustmentE6: 2_000_000n,
    };
  }
  return {
    kind: type,
    portfolioValueE6: 20_000_000n,
    wctcValueE6: 14_000_000n,
    currentWctcBps: 7_000,
    maxWctcExposureBps: 6_000,
    excessValueE6: 2_000_000n,
    remainingDailyReductionE6: 1_000_000n,
  };
}

function candidate(type: StrategyType): Candidate {
  const base = {
    strategy: type,
    action: ActionType.SWAP_EXACT_IN as const,
    evidenceHash: context.evidence.evidenceHash,
    observationHash: context.observationHash,
    policyHash: mandate.policyHash,
    direction: type === StrategyType.ARBITRAGE ? TradeDirection.BUY_WCTC : TradeDirection.SELL_WCTC,
    deterministicAmountIn: 100_000n,
    permittedValueE6: 100_000n,
  };
  if (type === StrategyType.ARBITRAGE) return { ...base, strategy: type, metrics: metrics(type) };
  if (type === StrategyType.REBALANCE) return { ...base, strategy: type, metrics: metrics(type) };
  return { ...base, strategy: type, metrics: metrics(type) };
}

function strategy(type: StrategyType, result: Candidate | null = candidate(type)): Strategy {
  return { type, evaluate: vi.fn(() => result) };
}

describe("StrategyCoordinator", () => {
  it("dispatches enabled strategies in locked priority order, independent of registration order", () => {
    const calls: StrategyType[] = [];
    const modules = [StrategyType.ARBITRAGE, StrategyType.RISK_REDUCTION, StrategyType.REBALANCE].map((type) => ({
      type,
      evaluate: vi.fn(() => {
        calls.push(type);
        return candidate(type);
      }),
    }));
    const coordinator = new StrategyCoordinator(modules);

    expect(coordinator.evaluate(context, mandate).map((item) => item.strategy)).toEqual(STRATEGY_PRIORITY);
    expect(calls).toEqual(STRATEGY_PRIORITY);
    expect(coordinator.strategy(StrategyType.REBALANCE)).toBe(modules[2]);
  });

  it("does not evaluate strategies disabled by the immutable mandate snapshot", () => {
    const arb = strategy(StrategyType.ARBITRAGE);
    const rebalance = strategy(StrategyType.REBALANCE);
    const risk = strategy(StrategyType.RISK_REDUCTION);
    const coordinator = new StrategyCoordinator([arb, rebalance, risk]);
    const arbOnly = {
      ...mandate,
      universal: { ...mandate.universal, enabledStrategies: strategyBit(StrategyType.ARBITRAGE) },
    };

    expect(coordinator.evaluate(context, arbOnly)).toEqual([candidate(StrategyType.ARBITRAGE)]);
    expect(arb.evaluate).toHaveBeenCalledOnce();
    expect(rebalance.evaluate).not.toHaveBeenCalled();
    expect(risk.evaluate).not.toHaveBeenCalled();
  });

  it("rejects duplicate modules and candidates whose semantics or snapshot hashes drift", () => {
    expect(() => new StrategyCoordinator([
      strategy(StrategyType.ARBITRAGE),
      strategy(StrategyType.ARBITRAGE),
    ])).toThrow("Duplicate strategy");
    expect(() => new StrategyCoordinator([
      strategy(99 as StrategyType),
    ])).toThrow("Invalid strategy");

    const mismatched = {
      ...candidate(StrategyType.ARBITRAGE),
      policyHash: hash("f"),
    } as Candidate;
    expect(() => new StrategyCoordinator([
      strategy(StrategyType.ARBITRAGE, mismatched),
    ]).evaluate(context, mandate)).toThrow("different evaluation snapshot");

    expect(() => new StrategyCoordinator([]).evaluate(
      { ...context, treasuryAddress: address("9") },
      mandate,
    )).toThrow("different treasuries");

    expect(() => new StrategyCoordinator([]).evaluate(context, {
      ...mandate,
      universal: { ...mandate.universal, enabledStrategies: 0b1000 },
    })).toThrow("unknown strategy bit");
  });
});

describe("strategy selection and snapshot lifecycle", () => {
  it("selects risk reduction before rebalancing before arbitrage", () => {
    const arb = candidate(StrategyType.ARBITRAGE);
    const rebalance = candidate(StrategyType.REBALANCE);
    const risk = candidate(StrategyType.RISK_REDUCTION);

    expect(selectHighestPriorityCandidate([arb, rebalance, risk])).toBe(risk);
    expect(selectHighestPriorityCandidate([arb, rebalance])).toBe(rebalance);
    expect(selectHighestPriorityCandidate([arb])).toBe(arb);
    expect(selectHighestPriorityCandidate([])).toBeNull();
  });

  it("rejects multiple candidates for one strategy", () => {
    expect(() => selectHighestPriorityCandidate([
      candidate(StrategyType.ARBITRAGE),
      candidate(StrategyType.ARBITRAGE),
    ])).toThrow("Multiple candidates");
  });

  it("invalidates every candidate from a portfolio snapshot after execution", () => {
    const cycle = new StrategyEvaluationCycle([
      candidate(StrategyType.ARBITRAGE),
      candidate(StrategyType.RISK_REDUCTION),
    ]);

    expect(cycle.claimCandidate()?.strategy).toBe(StrategyType.RISK_REDUCTION);
    expect(cycle.isClaimed).toBe(true);
    expect(cycle.claimCandidate()).toBeNull();
    expect(cycle.isInvalidated).toBe(false);
    cycle.invalidateAfterExecution();
    expect(cycle.isInvalidated).toBe(true);
    expect(cycle.claimCandidate()).toBeNull();
  });
});
