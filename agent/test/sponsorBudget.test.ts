import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SponsorBudget } from "../src/sponsorBudget.js";

const directories: string[] = [];
const identity = "102031:0x1111111111111111111111111111111111111111";
function ledger() {
  const dir = mkdtempSync(join(tmpdir(), "sponsor-budget-"));
  directories.push(dir);
  return join(dir, "ledger.json");
}
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const now = 1_700_000_000_000;

describe("sponsor spending boundary", () => {
  it("keeps a failed or unconfirmed send reserved across service restarts", () => {
    const path = ledger();
    new SponsorBudget(path, identity).reserve("wallet-a", 6n, 10n, 1000, now);
    const restarted = new SponsorBudget(path, identity);
    expect(restarted.snapshot(now).spentWei).toBe(6n);
    expect(() => restarted.reserve("wallet-b", 5n, 10n, 1000, now)).toThrow("budget");
  });
  it("keeps per-wallet cooldown across restarts and UTC day boundaries", () => {
    const path = ledger();
    const midnight = Math.ceil(now / 86_400_000) * 86_400_000;
    new SponsorBudget(path, identity).reserve("WALLET-A", 6n, 10n, 1000, midnight - 1);
    const restarted = new SponsorBudget(path, identity);
    expect(restarted.snapshot(midnight).spentWei).toBe(0n);
    expect(() => restarted.reserve("wallet-a", 1n, 10n, 1000, midnight)).toThrow("cooldown");
    restarted.reserve("wallet-a", 1n, 10n, 1000, midnight + 1000);
    expect(restarted.snapshot(midnight + 1000).spentWei).toBe(1n);
  });
  it("shares one spending ceiling between independent instances using the same ledger", () => {
    const path = ledger();
    const first = new SponsorBudget(path, identity);
    const second = new SponsorBudget(path, identity);
    first.reserve("wallet-a", 6n, 10n, 1000, now);
    expect(() => second.reserve("wallet-b", 5n, 10n, 1000, now)).toThrow("budget");
  });
});

// Filesystem failures must deny spending instead of falling back to memory.
describe("sponsor ledger failure handling", () => {
  it("rejects a corrupt ledger and an identity change", () => {
    const path = ledger();
    writeFileSync(path, "{}");
    expect(() => new SponsorBudget(path, identity).reserve("a", 1n, 10n, 1, now)).toThrow("invalid");
    writeFileSync(path, JSON.stringify({ version: 1, identity: "other", day: 1, spentWei: "0", lastReservedAt: {} }));
    expect(() => new SponsorBudget(path, identity).snapshot(now)).toThrow("identity mismatch");
  });
  it("refuses a concurrent or stale reservation lock", () => {
    const path = ledger();
    writeFileSync(`${path}.lock`, "");
    expect(() => new SponsorBudget(path, identity).reserve("a", 1n, 10n, 1, now)).toThrow();
    expect(new SponsorBudget(path, identity).snapshot(now).spentWei).toBe(0n);
  });
  it("retains a lock after persistence failure and never permits a later reservation", () => {
    const path = ledger();
    mkdirSync(`${path}.tmp`);
    const budget = new SponsorBudget(path, identity);
    expect(() => budget.reserve("a", 1n, 10n, 1000, now)).toThrow();
    expect(existsSync(`${path}.lock`)).toBe(true);
    expect(() => budget.reserve("b", 1n, 10n, 1000, now)).toThrow();
  });
  it("does not reset the budget when the clock moves backwards", () => {
    const path = ledger();
    const budget = new SponsorBudget(path, identity);
    budget.reserve("a", 6n, 10n, 1000, now);
    expect(() => budget.reserve("b", 5n, 10n, 1000, now - 86_400_000)).toThrow("budget");
    expect(() => budget.reserve("a", 1n, 10n, 1000, now - 1)).toThrow("cooldown");
  });
});
