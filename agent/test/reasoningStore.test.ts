import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { ReasoningStore, type ReasoningPayload } from "../src/reasoningStore.js";

const TEST_DIR = ".test-reasoning-store";

describe("ReasoningStore", () => {
  let store: ReasoningStore;

  const samplePayload: ReasoningPayload = {
    observedGapBps: 130,
    sourcePrice: "1005000",
    confirmPrice: "1010000",
    destPrice: "997000",
    rule: "R-ARB-1",
    llmRationale: "Gap exceeds threshold, recommend acting.",
    timestamp: "2026-08-22T00:00:00.000Z",
  };

  beforeEach(() => {
    store = new ReasoningStore(TEST_DIR);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("put() returns a hash that verifyHash() confirms against the same payload", async () => {
    const hash = await store.put(samplePayload);
    expect(store.verifyHash(samplePayload, hash)).toBe(true);
  });

  it("get() retrieves exactly what was stored", async () => {
    const hash = await store.put(samplePayload);
    const retrieved = await store.get(hash);
    expect(retrieved).toEqual(samplePayload);
  });

  it("verifyHash() catches tampering — this IS the replay viewer's core trust claim", async () => {
    const hash = await store.put(samplePayload);
    const tampered: ReasoningPayload = { ...samplePayload, llmRationale: "Different reasoning entirely." };
    expect(store.verifyHash(tampered, hash)).toBe(false);
  });

  it("returns null for a decisionHash that was never stored", async () => {
    const result = await store.get("0x" + "00".repeat(32));
    expect(result).toBeNull();
  });

  it("serialization is deterministic regardless of key insertion order in the input object", async () => {
    const hashA = await store.put(samplePayload);
    const reordered: ReasoningPayload = {
      timestamp: samplePayload.timestamp,
      llmRationale: samplePayload.llmRationale,
      rule: samplePayload.rule,
      destPrice: samplePayload.destPrice,
      confirmPrice: samplePayload.confirmPrice,
      sourcePrice: samplePayload.sourcePrice,
      observedGapBps: samplePayload.observedGapBps,
    };
    expect(store.verifyHash(reordered, hashA)).toBe(true);
  });
});
