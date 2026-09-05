import { ethers } from "ethers";
import { config } from "./config";
import type { ReplayData, ReasoningPayload, TreasuryInfo, TradeDirection } from "./types";
import { ActionType } from "./types";

// Minimal ABI slice — only what the replay viewer needs to read.
const TREASURY_ABI = [
  "function getJournalEntry(bytes32 actionKey) view returns (tuple(bytes32 factKey, bytes32 actionKey, uint64 attestedAt, uint64 actedAt, address agent, bytes32 decisionHash, uint8 actionType, bytes actionPayload))",
  // Immutable guardrails + identity (V2 multi-tenant): constructor-set immutables, so
  // these are the authoritative per-tenant bounds — reading them live from the instance
  // is what lets the viewer show WHICH rigid bounds governed a given action.
  "function owner() view returns (address)",
  "function MAX_TRADE_SIZE() view returns (uint256)",
  "function MAX_SLIPPAGE_BPS() view returns (uint256)",
  "function MIN_ARB_WIDTH_BPS() view returns (uint256)",
  "function MAX_DRIFT_BPS() view returns (uint256)",
  "function MAX_CONFIRM_GAP_BLOCKS() view returns (uint256)",
  "function MAX_ACTIONS_PER_EPOCH() view returns (uint256)",
  "function EPOCH_LENGTH() view returns (uint256)",
  "function journalIndex(uint256) view returns (bytes32)",
  // Auto-getter of the `mapping(address => bool) public registeredAgents` — the
  // only read accessor for the submitter allowlist (there is no single agent()
  // field; multiple submitters can be allowlisted by the owner).
  "function registeredAgents(address) view returns (bool)",
];

function getProvider() {
  if (!config.creditcoinRpcUrl) {
    throw new Error(
      "No Creditcoin RPC configured — set VITE_CREDITCOIN_RPC_URL (see docs/DEPLOYMENT.md)."
    );
  }
  return new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
}

/**
 * Reads a treasury instance's immutable identity + guardrails straight from the chain.
 * Works for ANY factory-deployed instance — instances are independent, so the address
 * passed in is the source of truth (the factory deliberately keeps no tenant registry).
 */
export async function fetchTreasuryInfo(treasuryAddress: string): Promise<TreasuryInfo> {
  const provider = getProvider();
  const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, provider);

  const [owner, maxTradeSize, maxSlippageBps, minArbWidthBps, maxDriftBps, maxConfirmGapBlocks, maxActionsPerEpoch, epochLength] =
    await Promise.all([
      treasury.owner(),
      treasury.MAX_TRADE_SIZE(),
      treasury.MAX_SLIPPAGE_BPS(),
      treasury.MIN_ARB_WIDTH_BPS(),
      treasury.MAX_DRIFT_BPS(),
      treasury.MAX_CONFIRM_GAP_BLOCKS(),
      treasury.MAX_ACTIONS_PER_EPOCH(),
      treasury.EPOCH_LENGTH(),
    ]);

  // journalIndex length is the honest "how many journaled actions does this instance
  // have" count. Read via a ranged probe of the array's length through sequential
  // existence checks is O(n) and ugly; instead call the array mapping with an
  // incrementing index until it reverts — capped so a pathological instance can't hang
  // the UI. (The ABI has no length accessor for arrays; this cap is disclosed here.)
  let journalLength = 0;
  const JOURNAL_PROBE_CAP = 500;
  for (let i = 0; i < JOURNAL_PROBE_CAP; i++) {
    try {
      await treasury.journalIndex(i);
      journalLength = i + 1;
    } catch {
      break;
    }
  }

  return {
    address: treasuryAddress,
    owner,
    journalLength,
    guardrails: {
      maxTradeSize: maxTradeSize.toString(),
      maxSlippageBps: Number(maxSlippageBps),
      minArbWidthBps: Number(minArbWidthBps),
      maxDriftBps: Number(maxDriftBps),
      maxConfirmGapBlocks: Number(maxConfirmGapBlocks),
      maxActionsPerEpoch: Number(maxActionsPerEpoch),
      epochLength: Number(epochLength),
    },
  };
}

/**
 * Public read: is `agentAddress` allowlisted as a submitter on this instance?
 * (registeredAgents is a public mapping in ASCTreasuryJournal — see the ABI note
 * above. The sign-up flow's /signup/done page uses this to render the one-tx
 * "Register the agent" owner action.)
 */
export async function fetchAgentRegistered(
  treasuryAddress: string,
  agentAddress: string
): Promise<boolean> {
  if (!agentAddress) {
    throw new Error("No agent address configured (VITE_AGENT_SUBMIT_ADDRESS).");
  }
  const provider = getProvider();
  const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, provider);
  return await treasury.registeredAgents(agentAddress);
}

/**
 * Live counterpart to mockData.ts. Reads a journal entry directly from the deployed
 * ASCTreasuryJournal contract, then attempts to fetch the matching off-chain reasoning
 * payload and independently re-hash it to check against the on-chain commitment — the
 * same tamper-evidence check agent/src/replay.ts's CLI performs, reimplemented here for
 * the browser.
 *
 * `treasuryAddress` defaults to the configured instance, but any factory-deployed
 * instance can be queried — that is the whole point of the V2 multi-tenant viewer.
 *
 * NOTE: `config.reasoningApiUrl` must point at something that can actually serve the
 * agent's locally-stored reasoning payloads (see agent/src/reasoningStore.ts) — a file
 * store on the agent's own machine isn't reachable from a browser as-is. This is an
 * intentionally left-open integration point; see docs/DEPLOYMENT.md.
 */
export async function fetchLiveReplayData(
  actionKey: string,
  treasuryAddress: string = config.treasuryAddress
): Promise<ReplayData | null> {
  if (!treasuryAddress) {
    throw new Error(
      "No treasury instance configured — set VITE_TREASURY_ADDRESS or enter an instance address in the viewer."
    );
  }
  const provider = getProvider();
  const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, provider);

  const raw = await treasury.getJournalEntry(actionKey);
  if (raw.actedAt === 0n) return null;

  // Task 3.3: the payload gained a 6th word (trade direction). Entries journaled
  // before that change carry a 5-word payload — decode tolerantly rather than crash
  // on the live chain's history, and surface those as honestly "direction not
  // recorded" instead of guessing.
  let tradeSize: bigint;
  let srcPrice: bigint;
  let confPrice: bigint;
  let arbWidthBps: bigint;
  let amountOut: bigint;
  let directionRaw: bigint | undefined;
  try {
    [tradeSize, srcPrice, confPrice, arbWidthBps, amountOut, directionRaw] =
      ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256", "uint256", "uint256", "uint256", "uint8"],
        raw.actionPayload
      );
  } catch {
    [tradeSize, srcPrice, confPrice, arbWidthBps, amountOut] =
      ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256", "uint256", "uint256", "uint256"],
        raw.actionPayload
      );
  }
  const direction: TradeDirection | undefined =
    directionRaw === undefined ? undefined : directionRaw === 0n ? "SELL_BASE_FOR_QUOTE" : "BUY_BASE_FOR_QUOTE";

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
          // MUST sit between llmRationale and timestamp — it mirrors the agent's
          // serialize() key order exactly, and JSON.stringify omits it when undefined
          // so pre-direction payloads still hash-match their on-chain commitments.
          direction: reasoning.direction,
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
      direction,
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
