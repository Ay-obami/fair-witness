import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config.js";

export interface DecisionInput {
  srcPrice: bigint;
  confPrice: bigint;
  destPrice: bigint;
  gapBps: number;
}

export interface Decision {
  act: boolean;
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
    return `${input.srcPrice}:${input.confPrice}:${input.destPrice}`;
  }

  async decide(input: DecisionInput): Promise<Decision> {
    const key = this.cacheKey(input);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const prompt = `Source price (attested, Sepolia): ${input.srcPrice}
Confirmation price (attested, later block): ${input.confPrice}
Current destination DEX price (Creditcoin, PenguinSwap): ${input.destPrice}
Observed gap vs destination: ${input.gapBps} bps

Should the contract be recommended to act on this?`;

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
    this.cache.set(key, parsed);
    return parsed;
  }
}
