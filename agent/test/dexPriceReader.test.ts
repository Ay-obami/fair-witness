import { describe, it, expect } from "vitest";
import { bpsGap } from "../src/dexPriceReader.js";

describe("bpsGap", () => {
  it("computes basis points gap relative to the smaller value, matching ASCTreasuryJournal._bpsGap", () => {
    // 1,010,000 vs 1,000,000 -> diff 10,000, base 1,000,000 -> 100bps (1%)
    expect(bpsGap(1_010_000n, 1_000_000n)).toBe(100);
    expect(bpsGap(1_000_000n, 1_010_000n)).toBe(100); // symmetric
  });

  it("returns 0 for identical values", () => {
    expect(bpsGap(1_000_000n, 1_000_000n)).toBe(0);
  });

  it("handles the exact happy-path fixture values from the Foundry test suite", () => {
    // Matches TestBase.sol's buildHappyPathProofs: srcPrice=1_005_000, confPrice=1_010_000
    const gap = bpsGap(1_005_000n, 1_010_000n);
    expect(gap).toBeLessThan(100); // must stay under MAX_DRIFT_BPS (100) for the happy path to be valid
    expect(gap).toBeGreaterThan(0);
  });
});
