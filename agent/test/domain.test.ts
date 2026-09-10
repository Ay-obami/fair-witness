import { describe, expect, it } from "vitest";
import {
  ALL_STRATEGIES_MASK,
  ActionType,
  DecisionOutcome,
  StrategyType,
  isStrategyEnabled,
  isStrategyType,
  parseAiDecision,
  strategyBit,
} from "../src/domain/index.js";

describe("closed Fair Witness domain vocabulary", () => {
  it("freezes the strategy and action enum order expected by the future ABI", () => {
    expect(StrategyType.ARBITRAGE).toBe(0);
    expect(StrategyType.REBALANCE).toBe(1);
    expect(StrategyType.RISK_REDUCTION).toBe(2);
    expect(ActionType.SWAP_EXACT_IN).toBe(0);
    expect(ALL_STRATEGIES_MASK).toBe(0b111);
  });

  it("uses a strategy bitmap without accepting unknown strategy values", () => {
    const mask = strategyBit(StrategyType.ARBITRAGE) | strategyBit(StrategyType.RISK_REDUCTION);
    expect(isStrategyEnabled(mask, StrategyType.ARBITRAGE)).toBe(true);
    expect(isStrategyEnabled(mask, StrategyType.REBALANCE)).toBe(false);
    expect(isStrategyEnabled(mask, StrategyType.RISK_REDUCTION)).toBe(true);
    expect(isStrategyType(0)).toBe(true);
    expect(isStrategyType(2)).toBe(true);
    expect(isStrategyType(3)).toBe(false);
    expect(isStrategyType("ARBITRAGE")).toBe(false);
  });
});

describe("parseAiDecision", () => {
  it("accepts only EXECUTE or WAIT plus bounded explanatory metadata", () => {
    expect(
      parseAiDecision({
        decision: DecisionOutcome.EXECUTE,
        strategy: StrategyType.REBALANCE,
        rationale: "The verified candidate is outside its allocation tolerance.",
        reasonTags: ["OUTSIDE_TOLERANCE", "LIQUIDITY_ACCEPTABLE"],
      }),
    ).toEqual({
      decision: DecisionOutcome.EXECUTE,
      strategy: StrategyType.REBALANCE,
      rationale: "The verified candidate is outside its allocation tolerance.",
      reasonTags: ["OUTSIDE_TOLERANCE", "LIQUIDITY_ACCEPTABLE"],
    });

    expect(
      parseAiDecision({
        decision: DecisionOutcome.WAIT,
        strategy: StrategyType.ARBITRAGE,
        rationale: "The edge appears too marginal.",
        reasonTags: [],
      }).decision,
    ).toBe(DecisionOutcome.WAIT);
  });

  it.each([
    null,
    [],
    {},
    { decision: "ACT", strategy: 0, rationale: "x", reasonTags: [] },
    { decision: "EXECUTE", strategy: 99, rationale: "x", reasonTags: [] },
    { decision: "EXECUTE", strategy: 0, rationale: "", reasonTags: [] },
    { decision: "EXECUTE", strategy: 0, rationale: "x", reasonTags: "SAFE" },
    { decision: "EXECUTE", strategy: 0, rationale: "x", reasonTags: ["DUP", "DUP"] },
  ])("rejects malformed model output %#", (value) => {
    expect(() => parseAiDecision(value)).toThrow();
  });

  it.each(["amountIn", "venue", "maxSlippageBps", "deadline", "route", "recipient", "calldata"])(
    "rejects the execution field %s even when the rest of the response is valid",
    (field) => {
      expect(() =>
        parseAiDecision({
          decision: DecisionOutcome.EXECUTE,
          strategy: StrategyType.RISK_REDUCTION,
          rationale: "Reduce exposure.",
          reasonTags: ["EXPOSURE_BREACH"],
          [field]: field === "amountIn" ? "7000" : "untrusted",
        }),
      ).toThrow(`unsupported field: ${field}`);
    },
  );

  it("rejects unbounded explanatory metadata", () => {
    expect(() =>
      parseAiDecision({
        decision: DecisionOutcome.WAIT,
        strategy: StrategyType.ARBITRAGE,
        rationale: "x".repeat(2_001),
        reasonTags: [],
      }),
    ).toThrow("rationale");

    expect(() =>
      parseAiDecision({
        decision: DecisionOutcome.WAIT,
        strategy: StrategyType.ARBITRAGE,
        rationale: "wait",
        reasonTags: Array.from({ length: 9 }, (_, index) => `TAG_${index}`),
      }),
    ).toThrow("reasonTags");
  });
});
