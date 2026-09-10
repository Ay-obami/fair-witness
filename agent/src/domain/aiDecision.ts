import {
  DecisionOutcome,
  isStrategyType,
  type AiDecision,
} from "./types.js";

const ALLOWED_KEYS = new Set(["decision", "strategy", "rationale", "reasonTags"]);
const MAX_RATIONALE_LENGTH = 2_000;
const MAX_REASON_TAGS = 8;
const MAX_REASON_TAG_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict runtime boundary for untrusted model output. Extra keys are rejected so
 * fields such as amount, venue, slippage, route, recipient, or calldata cannot
 * silently cross into the domain decision object.
 */
export function parseAiDecision(value: unknown): AiDecision {
  if (!isRecord(value)) throw new Error("AI decision must be an object");

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`AI decision contains unsupported field: ${key}`);
    }
  }
  for (const key of ALLOWED_KEYS) {
    if (!(key in value)) throw new Error(`AI decision is missing field: ${key}`);
  }

  if (
    value.decision !== DecisionOutcome.EXECUTE &&
    value.decision !== DecisionOutcome.WAIT
  ) {
    throw new Error("AI decision outcome must be EXECUTE or WAIT");
  }
  if (!isStrategyType(value.strategy)) {
    throw new Error("AI decision strategy is invalid");
  }
  if (
    typeof value.rationale !== "string" ||
    value.rationale.trim().length === 0 ||
    value.rationale.length > MAX_RATIONALE_LENGTH
  ) {
    throw new Error("AI decision rationale is invalid");
  }
  if (!Array.isArray(value.reasonTags) || value.reasonTags.length > MAX_REASON_TAGS) {
    throw new Error("AI decision reasonTags are invalid");
  }

  const reasonTags: string[] = [];
  const seen = new Set<string>();
  for (const tag of value.reasonTags) {
    if (
      typeof tag !== "string" ||
      tag.length === 0 ||
      tag.length > MAX_REASON_TAG_LENGTH ||
      tag.trim() !== tag ||
      seen.has(tag)
    ) {
      throw new Error("AI decision contains an invalid reason tag");
    }
    seen.add(tag);
    reasonTags.push(tag);
  }

  return {
    decision: value.decision,
    strategy: value.strategy,
    rationale: value.rationale,
    reasonTags,
  };
}
