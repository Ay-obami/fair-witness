import { promises as fs } from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

export interface ReasoningPayload {
  observedGapBps: number;
  sourcePrice: string;
  confirmPrice: string;
  destPrice: string;
  rule: string;
  llmRationale: string;
  /** Task 3.3: human-readable TradeDirection name ("BuyBaseForQuote" / "SellBaseForQuote").
   *  Optional + omitted when undefined so pre-direction payloads hash identically. */
  direction?: string;
  timestamp: string;
}

/**
 * File-based KV store for off-chain reasoning, keyed by keccak256(JSON.stringify(payload))
 * — the same hash committed on-chain as `decisionHash`. Deliberately simple (no IPFS,
 * no DB) per the PRD: "no need for IPFS unless time allows." A real production version
 * would want content-addressed, harder-to-tamper storage, but for the hackathon's
 * tamper-EVIDENT claim (not tamper-PROOF), a local JSON file is sufficient — the point
 * being demonstrated is that the replay viewer can independently recompute the hash and
 * catch a mismatch, not that this particular storage backend is itself trustless.
 */
export class ReasoningStore {
  constructor(private storeDir: string = ".reasoning-store") {}

  private async ensureDir() {
    await fs.mkdir(this.storeDir, { recursive: true });
  }

  /** Serializes deterministically (fixed key order) so the hash is reproducible. The
   *  optional `direction` field is omitted when undefined (JSON.stringify semantics),
   *  which keeps pre-direction payloads hashing to their original on-chain values. */
  private serialize(payload: ReasoningPayload): string {
    return JSON.stringify({
      observedGapBps: payload.observedGapBps,
      sourcePrice: payload.sourcePrice,
      confirmPrice: payload.confirmPrice,
      destPrice: payload.destPrice,
      rule: payload.rule,
      llmRationale: payload.llmRationale,
      direction: payload.direction,
      timestamp: payload.timestamp,
    });
  }

  async put(payload: ReasoningPayload): Promise<string> {
    await this.ensureDir();
    const serialized = this.serialize(payload);
    const decisionHash = ethers.keccak256(ethers.toUtf8Bytes(serialized));
    await fs.writeFile(path.join(this.storeDir, `${decisionHash}.json`), serialized, "utf-8");
    return decisionHash;
  }

  async get(decisionHash: string): Promise<ReasoningPayload | null> {
    try {
      const raw = await fs.readFile(path.join(this.storeDir, `${decisionHash}.json`), "utf-8");
      return JSON.parse(raw) as ReasoningPayload;
    } catch {
      return null;
    }
  }

  /** Recomputes the hash of a retrieved payload — the actual tamper-evidence check. */
  verifyHash(payload: ReasoningPayload, expectedHash: string): boolean {
    return ethers.keccak256(ethers.toUtf8Bytes(this.serialize(payload))) === expectedHash;
  }
}
