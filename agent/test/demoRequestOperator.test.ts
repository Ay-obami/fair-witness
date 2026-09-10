import { describe, expect, it } from "vitest";
import { DemoRequestOperator, supervisedCommand } from "../src/demoRequestOperator.js";

describe("demo request operator boundary", () => {
  it("maps only locked strategies to supervised scripts", () => {
    expect(supervisedCommand("ARBITRAGE")).toBe("npm run demo:arbitrage");
    expect(supervisedCommand("REBALANCING")).toBe("npm run demo:rebalance");
    expect(supervisedCommand("RISK_REDUCTION")).toBe("npm run demo:risk:valid");
  });

  it("requires server-only credentials", () => {
    expect(() => new DemoRequestOperator("", "secret")).toThrow();
    expect(() => new DemoRequestOperator("https://example.supabase.co", "")).toThrow();
  });
});
