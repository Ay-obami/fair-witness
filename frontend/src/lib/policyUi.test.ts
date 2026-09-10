import { describe, expect, it } from "vitest";
import { reasonLabel, strategyLabel, validateMandate, type MandateDraft } from "./policyUi";

const valid: MandateDraft = {
  capitalInstructions: "Fund after review",
  enabledStrategies: { Arbitrage: true, Rebalancing: true, "Risk Reduction": true },
  targetWctcBps: 4000, toleranceBps: 500, maxWctcExposureBps: 6000,
  maxActionValue: "1000", maxSlippageBps: 150,
  wctc: "0x1111111111111111111111111111111111111111",
  stable: "0x2222222222222222222222222222222222222222",
  venue: "0x3333333333333333333333333333333333333333",
  automation: "Paused",
};

describe("schema-v1 UI vocabulary", () => {
  it("maps all strategy ordinals without collapsing their semantics", () => {
    expect([0, 1, 2].map(strategyLabel)).toEqual(["Arbitrage", "Rebalancing", "Risk Reduction"]);
    expect(strategyLabel(3)).toBe("Unknown strategy");
  });

  it("maps security-significant policy reasons", () => {
    expect(reasonLabel(6)).toBe("Asset is not allowed");
    expect(reasonLabel(7)).toBe("Venue is not allowed");
    expect(reasonLabel(12)).toBe("Proposal was already processed");
    expect(reasonLabel(29)).toBe("Amount differs from deterministic calculation");
    expect(reasonLabel(99)).toBe("Unknown reason code (99)");
  });
});

describe("mandate draft validation", () => {
  it("accepts a bounded draft", () => expect(validateMandate(valid)).toEqual([]));

  it("rejects disabled strategies, malformed addresses and bounds above ceilings", () => {
    const errors = validateMandate({
      ...valid,
      enabledStrategies: { Arbitrage: false, Rebalancing: false, "Risk Reduction": false },
      maxSlippageBps: 1001,
      venue: "ordinary-api-response",
    });
    expect(errors).toContain("Enable at least one strategy.");
    expect(errors).toContain("Maximum slippage cannot exceed the protocol ceiling of 1,000 bps.");
    expect(errors).toContain("venue must be a valid address.");
  });
});
