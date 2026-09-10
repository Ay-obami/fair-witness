import { ethers } from "ethers";
import type { AuditRepository, ReplayBundle } from "./types.js";

export function canonicalDecisionHash(envelope: unknown): string {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(envelope)));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("canonical JSON rejects undefined, functions, and symbols");
}

export async function reconstructReplay(
  repository: AuditRepository,
  chainId: bigint,
  treasury: string,
  attemptId: bigint,
): Promise<ReplayBundle> {
  const attempt = await repository.attempt(chainId, treasury, attemptId);
  if (!attempt) return { attempt: null, decision: null, integrity: "MISSING_ARTIFACT" };
  const decision = await repository.decision(attempt.decisionHash);
  if (!decision) return { attempt, decision: null, integrity: "MISSING_ARTIFACT" };
  const hashMatches = canonicalDecisionHash(decision.canonicalEnvelope).toLowerCase() === attempt.decisionHash.toLowerCase();
  return { attempt, decision, integrity: hashMatches ? "MATCH" : "MISMATCH" };
}

export function replayWait(decision: import("./types.js").DecisionArtifact): ReplayBundle {
  if (decision.outcome !== "WAIT") throw new Error("only WAIT decisions have no submitted attempt");
  return { attempt: null, decision, integrity: "WAIT_NOT_SUBMITTED" };
}
