import type { AttemptProjection, AuditRepository, DecisionArtifact } from "./types.js";

const attemptKey = (chainId: bigint, treasury: string, id: bigint) =>
  `${chainId}:${treasury.toLowerCase()}:${id}`;

/** Deterministic test/local repository with the same idempotency contract as Supabase. */
export class MemoryAuditRepository implements AuditRepository {
  private attempts = new Map<string, AttemptProjection>();
  private decisions = new Map<string, DecisionArtifact>();

  async upsertAttempt(value: AttemptProjection): Promise<void> {
    const key = attemptKey(value.chainId, value.treasuryAddress, value.attemptId);
    const prior = this.attempts.get(key);
    if (prior && prior.syncStatus !== "ORPHANED" && (prior.transactionHash !== value.transactionHash || prior.logIndex !== value.logIndex)) {
      throw new Error("attempt identity conflicts with a different chain log");
    }
    this.attempts.set(key, structuredClone(value));
  }

  async attempt(chainId: bigint, treasury: string, id: bigint): Promise<AttemptProjection | null> {
    return structuredClone(this.attempts.get(attemptKey(chainId, treasury, id)) ?? null);
  }

  async markBlockOrphaned(chainId: bigint, blockHash: string): Promise<number> {
    let changed = 0;
    for (const [key, attempt] of this.attempts) {
      if (attempt.chainId === chainId && attempt.blockHash === blockHash && attempt.syncStatus !== "ORPHANED") {
        this.attempts.set(key, { ...attempt, syncStatus: "ORPHANED" });
        changed++;
      }
    }
    return changed;
  }

  async putDecision(value: DecisionArtifact): Promise<void> {
    const key = value.decisionHash.toLowerCase();
    const prior = this.decisions.get(key);
    if (prior && JSON.stringify(prior.canonicalEnvelope) !== JSON.stringify(value.canonicalEnvelope)) {
      throw new Error("decision hash conflicts with different canonical content");
    }
    this.decisions.set(key, structuredClone(value));
  }

  async decision(hash: string): Promise<DecisionArtifact | null> {
    return structuredClone(this.decisions.get(hash.toLowerCase()) ?? null);
  }
}
