import { ethers } from "ethers";
import { config } from "./config";
import type { ReplayData, ReasoningPayload } from "./types";
import { ActionType } from "./types";

// Minimal ABI slice — only what the replay viewer needs to read.
const TREASURY_ABI = [
  "function getJournalEntry(bytes32 actionKey) view returns (tuple(bytes32 factKey, bytes32 actionKey, uint64 attestedAt, uint64 actedAt, address agent, bytes32 decisionHash, uint8 actionType, bytes actionPayload))",
];

/**
 * Live counterpart to mockData.ts. Reads a journal entry directly from the deployed
 * ASCTreasuryJournal contract, then attempts to fetch the matching off-chain reasoning
 * payload and independently re-hash it to check against the on-chain commitment — the
 * same tamper-evidence check agent/src/replay.ts's CLI performs, reimplemented here for
 * the browser.
 *
 * NOTE: `config.reasoningApiUrl` must point at something that can actually serve the
 * agent's locally-stored reasoning payloads (see agent/src/reasoningStore.ts) — a file
 * store on the agent's own machine isn't reachable from a browser as-is. This is an
 * intentionally left-open integration point; see docs/DEPLOYMENT.md.
 */
export async function fetchLiveReplayData(actionKey: string): Promise<ReplayData | null> {
  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const treasury = new ethers.Contract(config.treasuryAddress, TREASURY_ABI, provider);

  const raw = await treasury.getJournalEntry(actionKey);
  if (raw.actedAt === 0n) return null;

  const [tradeSize, srcPrice, confPrice, arbWidthBps, amountOut] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "uint256", "uint256"],
    raw.actionPayload
  );

  let reasoning: ReasoningPayload | null = null;
  let hashMatches: boolean | null = null;

  if (config.reasoningApiUrl) {
    try {
      const res = await fetch(`${config.reasoningApiUrl}/${raw.decisionHash}.json`);
      if (res.ok) {
        reasoning = (await res.json()) as ReasoningPayload;
        const serialized = JSON.stringify({
          observedGapBps: reasoning.observedGapBps,
          sourcePrice: reasoning.sourcePrice,
          confirmPrice: reasoning.confirmPrice,
          destPrice: reasoning.destPrice,
          rule: reasoning.rule,
          llmRationale: reasoning.llmRationale,
          timestamp: reasoning.timestamp,
        });
        hashMatches = ethers.keccak256(ethers.toUtf8Bytes(serialized)) === raw.decisionHash;
      }
    } catch {
      // Leave reasoning null / hashMatches null — the UI shows an honest
      // "couldn't be retrieved" state rather than a false positive or a crash.
    }
  }

  return {
    entry: {
      actionKey,
      factKey: raw.factKey,
      attestedAt: Number(raw.attestedAt),
      actedAt: Number(raw.actedAt),
      agent: raw.agent,
      decisionHash: raw.decisionHash,
      actionType: Number(raw.actionType) as ActionType,
      tradeSize: tradeSize.toString(),
      srcPrice: srcPrice.toString(),
      confPrice: confPrice.toString(),
      arbWidthBps: Number(arbWidthBps),
      amountOut: amountOut.toString(),
    },
    reasoning,
    hashMatches,
    sepoliaExplorerFactHint: "Independently verifiable: Sepolia block containing the PriceObserved event this factKey commits to.",
  };
}
