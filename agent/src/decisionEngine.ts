import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config.js";
import { directionFor, type TradeDirection } from "./dexPriceReader.js";
import type { TreasuryGuardrails } from "./treasuryGuardrails.js";

export interface DecisionInput {
  srcPrice: bigint;
  confPrice: bigint;
  destPrice: bigint;
  gapBps: number;
  guardrails: TreasuryGuardrails; // Now tenant-specific
}

export interface Decision {
  act: boolean;
  /**
   * Task 3.3: the decision now proposes a DIRECTION, not just an act/skip boolean.
   * It is derived deterministically from the attested/live price sign — not an LLM
   * judgment call (the sign is arithmetic, and executeArbitrage independently
   * re-derives and enforces the same rule on-chain). Null means the gap has no sign
   * (zero gap): there is no direction the evidence supports.
   */
  direction: TradeDirection | null;
  rationale: string;
}

// Fixed, versioned prompt — changing this changes what a given fact will decide, so it's
// checked into the repo rather than left as a runtime string a future edit could drift
// without anyone noticing. See PRD section 7 "Determinism requirement".
const SYSTEM_PROMPT = `You are a conservative risk-averse arbitrage decision assistant.
You do NOT execute trades yourself — a smart contract enforces hard numeric bounds
(max trade size, max slippage, minimum arbitrage width, max price drift between two
independent proofs, and a rate limit) regardless of your answer. Your job is only to
decide whether a proposed arbitrage condition is one you'd recommend acting on, given
the observed prices.

Rule R-ARB-1: recommend acting only if the gap between the confirmed source price and
the current destination DEX price is wide enough to plausibly represent a real, durable
arbitrage opportunity rather than noise or a stale/manipulated observation. When in
doubt, recommend NOT acting — the contract's bounds are a floor, not a target; you should
be more conservative than the contract, never less.

Rule R-ARB-2: always consider the tenant-specific guardrails provided (max trade size,
max slippage bps, min arb width bps, max drift bps, rate limit). Different tenants have
different risk profiles, so your decision should be calibrated to their specific bounds.

Respond only with the requested JSON structure.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    act: { type: Type.BOOLEAN, description: "Whether to recommend acting on this arbitrage condition." },
    rationale: { type: Type.STRING, description: "One or two sentences explaining the decision." },
  },
  required: ["act", "rationale"],
};

/**
 * LLM-gated decision layer. Two determinism safeguards, per PRD section 7:
 *   1. temperature: 0 and a fixed numeric `seed` on every call.
 *   2. A local in-memory cache keyed by the exact input tuple, so a crashed-and-restarted
 *      agent re-evaluating the SAME fact reuses its own prior decision instead of
 *      re-querying Gemini and risking a different answer (temperature 0 + seed reduces
 *      but does not, per Google's own docs, absolutely guarantee determinism across
 *      calls/provider-side changes — this cache is the belt-and-suspenders on top).
 *
 * Important: this class only produces a RECOMMENDATION. It never bypasses the contract's
 * own bound checks — see ASCTreasuryJournal.sol's executeArbitrage, which independently
 * re-verifies drift/width/rate-limit regardless of what this returns.
 */
export class DecisionEngine {
  private client: GoogleGenAI;
  private cache = new Map<string, Decision>();

  constructor() {
    this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  private cacheKey(input: DecisionInput): string {
    return `${input.srcPrice}:${input.confPrice}:${input.destPrice}:${input.gapBps}:${input.guardrails.maxTradeSize}:${input.guardrails.minArbWidthBps}`;
  }

  async decide(input: DecisionInput): Promise<Decision> {
    const key = this.cacheKey(input);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const prompt = `Source price (attested, Sepolia): ${input.srcPrice}
Confirmation price (attested, later block): ${input.confPrice}
Current destination DEX price (Creditcoin, PenguinSwap): ${input.destPrice}
Observed gap vs destination: ${input.gapBps} bps

Tenant-specific guardrails:
- Max trade size: ${input.guardrails.maxTradeSize} tokens
- Max slippage: ${input.guardrails.maxSlippageBps} bps
- Min arb width: ${input.guardrails.minArbWidthBps} bps
- Max drift: ${input.guardrails.maxDriftBps} bps
- Max actions per epoch: ${input.guardrails.maxActionsPerEpoch}
- Epoch length: ${input.guardrails.epochLength} seconds

Should the contract be recommended to act on this?`;

    // Transient Google-side failures (503 UNAVAILABLE under load, 429 rate limit) are
    // common on the free tier and would otherwise silently drop an otherwise-complete
    // candidate after both attestations were already paid for. Retry a few times with
    // short backoff before giving up; only genuine API errors propagate.
    const maxAttempts = 4;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: config.geminiModel,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0,
            seed: 42,
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        const text = response.text;
        if (!text) throw new Error("Gemini returned no text output");

        const parsed = JSON.parse(text) as Decision;
        // Task 3.3: attach the direction derived from the price sign. The LLM is NOT
        // asked to choose it — the sign is arithmetic, and the contract re-derives and
        // enforces the same rule on-chain regardless of what this returns.
        parsed.direction = directionFor(input.confPrice, input.destPrice);
        this.cache.set(key, parsed);
        return parsed;
      } catch (err) {
        lastError = err;
        const msg = String(err);
        const transient = msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE");
        if (!transient || attempt === maxAttempts) throw err;
        console.log(`[decisionEngine] Gemini transient error (attempt ${attempt}/${maxAttempts}), retrying: ${msg.slice(0, 200)}`);
        await new Promise((res) => setTimeout(res, attempt * 5000));
      }
    }
    throw lastError;
  }
}
