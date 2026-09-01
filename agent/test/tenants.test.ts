import { describe, it, expect } from "vitest";
import { parseTenantsJson } from "../src/tenants.js";

// The tenants registry is the multi-tenant agent's front door: a typo'd address or a
// duplicate entry must die HERE (loudly, naming the offending entry) — not surface later
// as a confusing per-cycle RPC failure against a nonexistent contract.

describe("parseTenantsJson", () => {
  const valid = JSON.stringify({
    tenants: [
      { label: "tenant-a", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
      { label: "tenant-b", treasuryAddress: "0xD66C607072df7dB98A75aEe81fCA4089462c60aB" },
    ],
  });

  it("parses a valid registry into checksummed tenant configs", () => {
    const tenants = parseTenantsJson(valid);
    expect(tenants).toHaveLength(2);
    expect(tenants[0].label).toBe("tenant-a");
    expect(tenants[0].treasuryAddress).toBe("0x13CACe3989b295048De47C68F32Ff3d844AC2026");
    expect(tenants[1].label).toBe("tenant-b");
  });

  it("checksums a lowercase address ( getAddress normalizes )", () => {
    const raw = JSON.stringify({
      tenants: [
        { label: "a", treasuryAddress: "0x13cace3989b295048de47c68f32ff3d844ac2026" },
      ],
    });
    const tenants = parseTenantsJson(raw);
    expect(tenants[0].treasuryAddress).toBe("0x13CACe3989b295048De47C68F32Ff3d844AC2026");
  });

  it("rejects malformed JSON with a clear error", () => {
    expect(() => parseTenantsJson("{not json")).toThrow(/not valid JSON/);
  });

  it("rejects an empty or missing tenants array (loud, not silent no-op)", () => {
    expect(() => parseTenantsJson("{}")).toThrow(/non-empty "tenants" array/);
    expect(() => parseTenantsJson(JSON.stringify({ tenants: [] }))).toThrow(/non-empty "tenants" array/);
  });

  it("rejects a blank label, naming the entry index", () => {
    const raw = JSON.stringify({
      tenants: [
        { label: "  ", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
      ],
    });
    expect(() => parseTenantsJson(raw)).toThrow(/#0.*"label"/);
  });

  it("rejects an invalid address, naming the offending entry", () => {
    const raw = JSON.stringify({
      tenants: [{ label: "bad", treasuryAddress: "0x1234" }],
    });
    expect(() => parseTenantsJson(raw)).toThrow(/"bad".*not a valid Ethereum address/);
  });

  it("rejects duplicate treasury addresses (one instance = one tenant row)", () => {
    const raw = JSON.stringify({
      tenants: [
        { label: "a", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
        { label: "a-again", treasuryAddress: "0x13cace3989b295048de47c68f32ff3d844ac2026" },
      ],
    });
    expect(() => parseTenantsJson(raw)).toThrow(/duplicate treasury address/);
  });

  it("trims surrounding whitespace in labels", () => {
    const raw = JSON.stringify({
      tenants: [
        { label: "  tenant-a  ", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
      ],
    });
    expect(parseTenantsJson(raw)[0].label).toBe("tenant-a");
  });
});