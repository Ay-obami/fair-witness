import { describe, expect, it } from "vitest";
import { DEMO_STRATEGIES, isDemoStrategy } from "./demoRequest";

describe("public demo request boundary", () => {
  it("permits exactly the three locked strategies", () => {
    expect(DEMO_STRATEGIES).toEqual(["ARBITRAGE", "REBALANCING", "RISK_REDUCTION"]);
    for (const strategy of DEMO_STRATEGIES) expect(isDemoStrategy(strategy)).toBe(true);
  });

  it("rejects arbitrary actions and execution-shaped inputs", () => {
    for (const value of ["TRANSFER", "SWAP", "CALLDATA", "WITHDRAW", ""]) expect(isDemoStrategy(value)).toBe(false);
  });
});
