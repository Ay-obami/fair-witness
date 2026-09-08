import type { ArbitrageCandidate, MandateSnapshot } from "../domain/types.js";

export const ARBITRAGE_PROMPT_VERSION = "fair-witness-arbitrage-v1";

export const ARBITRAGE_SYSTEM_PROMPT = `You are an untrusted decision proposer for Fair Witness.
Deterministic software has already calculated the candidate and the on-chain treasury will independently verify it.
Choose only EXECUTE or WAIT for the supplied arbitrage candidate. You cannot change assets, venue, direction,
amount, slippage, deadline, nonce, evidence, or policy. Return only decision, strategy, rationale, and reasonTags.`;

/** Canonical AI-visible prompt. Numeric terms are context, never model-authorized values. */
export function buildArbitragePrompt(candidate: ArbitrageCandidate, mandate: MandateSnapshot): string {
  return JSON.stringify({
    promptVersion: ARBITRAGE_PROMPT_VERSION,
    strategy: "ARBITRAGE",
    verifiedEvidenceHash: candidate.evidenceHash,
    observationHash: candidate.observationHash,
    policyHash: candidate.policyHash,
    deterministicCandidate: {
      direction: candidate.direction,
      amountIn: candidate.deterministicAmountIn.toString(),
      permittedValueE6: candidate.permittedValueE6.toString(),
      metrics: Object.fromEntries(Object.entries(candidate.metrics).map(([key, value]) =>
        [key, typeof value === "bigint" ? value.toString() : value])),
    },
    immutableMandate: {
      maxActionValueE6: mandate.universal.maxActionValueE6.toString(),
      maxSlippageBps: mandate.universal.maxSlippageBps,
      minNetEdgeBps: mandate.arbitrage.minNetEdgeBps,
      maxArbitrageValueE6: mandate.arbitrage.maxArbitrageValueE6.toString(),
    },
    allowedResponseKeys: ["decision", "strategy", "rationale", "reasonTags"],
  });
}
