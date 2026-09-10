import { describe, expect, it, vi } from "vitest";
import { canonicalDecisionHash, MemoryAuditRepository, normalizeAttempt, reconstructReplay, replayWait } from "../src/audit/index.js";
import type { AttemptProjection, DecisionArtifact } from "../src/audit/types.js";

const h = (n: string) => `0x${n.repeat(64)}`;
const a = (n: string) => `0x${n.repeat(40)}`;
const envelope = { schema: 1, outcome: "EXECUTE", rationale: "bounded action" };
const decisionHash = canonicalDecisionHash(envelope);
const attempt = (overrides: Partial<AttemptProjection> = {}): AttemptProjection => ({
  chainId: 102031n, treasuryAddress: a("1"), transactionHash: h("2"), blockNumber: 100n,
  blockHash: h("3"), logIndex: 4, attemptId: 1n, proposalId: h("4"), executionKey: h("5"), agent: a("6"),
  nonce: 1n, sourceChainKey: 3n, sourceBlockHeight: 10n, sourceTxIndex: 1n,
  confirmBlockHeight: 15n, confirmTxIndex: 2n, assetIn: a("7"), assetOut: a("8"), venue: a("9"),
  strategy: 2, action: 0, result: 1, reason: 0, evidenceStatus: 2, evidenceHash: h("7"),
  observationHash: h("8"), decisionHash, policyHash: h("9"), evaluatedStateHash: h("a"), proposedAmountIn: 1n,
  permittedValueE6: 1n, amountInActual: 1n, amountOutActual: 1n, currentWctcBps: 7000,
  referenceBps: 6000, submittedAt: 1n, resolvedAt: 1n, syncStatus: "CANONICAL", ...overrides,
});
const decision = (overrides: Partial<DecisionArtifact> = {}): DecisionArtifact => ({
  decisionHash, observationHash: h("8"), evidenceHash: h("7"), policyHash: h("9"), strategy: 2,
  outcome: "EXECUTE", canonicalEnvelope: envelope, ...overrides,
});

describe("Phase 7 audit journal", () => {
  it("is idempotent for the same chain identity and rejects conflicting logs", async () => {
    const repo = new MemoryAuditRepository(); const value = attempt();
    await repo.upsertAttempt(value); await repo.upsertAttempt(value);
    expect((await repo.attempt(value.chainId, value.treasuryAddress, value.attemptId))?.transactionHash).toBe(value.transactionHash);
    await expect(repo.upsertAttempt({ ...value, transactionHash: h("b") })).rejects.toThrow("conflicts");
  });
  it("marks projections orphaned when reconciliation detects a replaced block", async () => {
    const repo = new MemoryAuditRepository(); const value = attempt(); await repo.upsertAttempt(value);
    expect(await repo.markBlockOrphaned(value.chainId, value.blockHash)).toBe(1);
    expect((await repo.attempt(value.chainId, value.treasuryAddress, value.attemptId))?.syncStatus).toBe("ORPHANED");
    const replacement = { ...value, transactionHash: h("c"), blockHash: h("d") };
    await repo.upsertAttempt(replacement);
    expect((await repo.attempt(value.chainId, value.treasuryAddress, value.attemptId))?.transactionHash).toBe(h("c"));
  });
  it("hashes canonical decision objects independently of key insertion order", () => {
    expect(canonicalDecisionHash({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(canonicalDecisionHash({ a: { c: 3, d: 4 }, b: 2 }));
  });
  it("joins an attempt to reasoning and detects missing or tampered artifacts", async () => {
    const repo = new MemoryAuditRepository(); const value = attempt(); await repo.upsertAttempt(value);
    expect((await reconstructReplay(repo, value.chainId, value.treasuryAddress, 1n)).integrity).toBe("MISSING_ARTIFACT");
    await repo.putDecision(decision());
    expect((await reconstructReplay(repo, value.chainId, value.treasuryAddress, 1n)).integrity).toBe("MATCH");
    const tamperedRepo = new MemoryAuditRepository(); await tamperedRepo.upsertAttempt(value);
    await tamperedRepo.putDecision(decision({ canonicalEnvelope: { ...envelope, rationale: "edited" } }));
    expect((await reconstructReplay(tamperedRepo, value.chainId, value.treasuryAddress, 1n)).integrity).toBe("MISMATCH");
  });
  it("represents WAIT as not submitted rather than rejected", () => {
    const bundle = replayWait(decision({ outcome: "WAIT" }));
    expect(bundle.integrity).toBe("WAIT_NOT_SUBMITTED"); expect(bundle.attempt).toBeNull();
  });
  it("normalizes invalid evidence honestly from the complete chain record", () => {
    const record = {
      attemptId: 3n, nonce: 2n, sourceChainKey: 3n, sourceBlockHeight: 10n, sourceTxIndex: 1n,
      confirmBlockHeight: 15n, confirmTxIndex: 2n, agent: a("1"), assetIn: a("2"), assetOut: a("3"), venue: a("4"),
      strategy: 0n, action: 0n, result: 0n, evidenceStatus: 1n, reason: 15n, proposedAmountIn: 2n,
      permittedValueE6: 0n, amountInActual: 0n, amountOutActual: 0n, currentWctcBps: 0n, referenceBps: 0n,
      proposalId: h("1"), executionKey: h("2"), evidenceHash: h("3"), observationHash: h("4"),
      decisionHash: h("5"), policyHash: h("6"), evaluatedStateHash: h("0"), submittedAt: 10n, resolvedAt: 10n,
    };
    const normalized = normalizeAttempt(102031n, a("9"), {
      transactionHash: h("a"), blockNumber: 100, blockHash: h("b"), index: 1,
    }, record);
    expect(normalized.evidenceStatus).toBe(1); expect(normalized.reason).toBe(15);
    expect(normalized.amountInActual).toBe(0n); expect(normalized.syncStatus).toBe("CANONICAL");
  });
  it("does not expose a service credential through browser-style environment names", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
