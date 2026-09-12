import { describe, expect, it } from "vitest";
import { RECOMMENDED_MANDATE, reasonLabel, strategyLabel, strategyMask, toContractPolicies, validateMandate, type MandateDraft } from "./policyUi";

const valid: MandateDraft = {
  ...RECOMMENDED_MANDATE,
  enabledStrategies: { Arbitrage: true, Rebalancing: true, "Risk Reduction": true },
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

describe("schema-v1 mandate builder", () => {
  it("accepts the recommended bounded mandate", () => {
    expect(validateMandate(valid)).toEqual([]);
  });

  it("rejects disabled strategies and values above protocol ceilings", () => {
    const errors = validateMandate({
      ...valid,
      enabledStrategies: { Arbitrage: false, Rebalancing: false, "Risk Reduction": false },
      maxSlippageBps: 1001,
    });
    expect(errors).toContain("Enable at least one strategy.");
    expect(errors).toContain("Maximum slippage cannot exceed the protocol ceiling of 1,000 bps.");
  });

  it("encodes the closed strategy set into the Solidity bit mask", () => {
    expect(strategyMask(valid.enabledStrategies)).toBe(7);
    expect(strategyMask({ Arbitrage: false, Rebalancing: true, "Risk Reduction": true })).toBe(6);
  });

  it("builds the exact four policy objects expected by the schema-v1 factory", () => {
    const policy = toContractPolicies(valid);
    expect(policy.universal.enabledStrategies).toBe(7);
    expect(policy.universal.maxActionValueE6).toBe(100_000_000n);
    expect(policy.universal.maxSlippageBps).toBe(300);
    expect(policy.arbitrage).toEqual({ minNetEdgeBps: 100, maxArbitrageValueE6: 100_000_000n });
    expect(policy.rebalance).toEqual({ targetWctcBps: 4000, toleranceBps: 500, maxRebalanceValueE6: 100_000_000n });
    expect(policy.risk).toEqual({ maxWctcExposureBps: 6000, maxRiskReductionValueE6: 100_000_000n, dailyRiskReductionValueE6: 300_000_000n });
  });
});
