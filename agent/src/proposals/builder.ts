import { ethers } from "ethers";
import {
  ActionType,
  TradeDirection,
  isStrategyType,
  type Address,
  type Candidate,
  type Hex32,
  type MandateSnapshot,
} from "../domain/types.js";
import { PROPOSAL_SCHEMA_VERSION, type ProposalEnvelope, type ProposalV1 } from "./types.js";

const UINT64_MAX = (1n << 64n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO_HASH = `0x${"00".repeat(32)}`;

function uint(value: bigint, maximum: bigint, field: string): void {
  if (value < 0n || value > maximum) throw new RangeError(`${field} is outside its canonical width`);
}

function address(value: string, field: string): asserts value is Address {
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new TypeError(`${field} is not a nonzero address`);
}

function hash(value: string, field: string): asserts value is Hex32 {
  if (!HEX32.test(value) || value.toLowerCase() === ZERO_HASH) throw new TypeError(`${field} is not a nonzero bytes32`);
}

/** Constructs execution terms exclusively from deterministic strategy and mandate outputs. */
export function buildProposal(
  candidate: Candidate,
  mandate: MandateSnapshot,
  envelope: ProposalEnvelope
): ProposalV1 {
  if (!isStrategyType(candidate.strategy)) throw new TypeError("strategy is outside the closed strategy set");
  if (candidate.action !== ActionType.SWAP_EXACT_IN) throw new TypeError("action is not permitted by schema v1");
  if (candidate.policyHash.toLowerCase() !== mandate.policyHash.toLowerCase()) {
    throw new Error("candidate was evaluated under a different policy snapshot");
  }
  if (!Number.isInteger(envelope.maxSlippageBps) || envelope.maxSlippageBps < 0 || envelope.maxSlippageBps > 10_000) {
    throw new RangeError("maxSlippageBps is outside basis-point bounds");
  }
  if (envelope.maxSlippageBps > mandate.universal.maxSlippageBps) {
    throw new RangeError("maxSlippageBps exceeds the mandate ceiling");
  }
  uint(candidate.deterministicAmountIn, UINT128_MAX, "amountIn");
  if (candidate.deterministicAmountIn === 0n) throw new RangeError("amountIn must be positive");
  uint(envelope.deadline, UINT64_MAX, "deadline");
  uint(envelope.nonce, UINT64_MAX, "nonce");
  address(mandate.wctc, "wctc");
  address(mandate.stable, "stable");
  address(mandate.venue, "venue");
  hash(candidate.evidenceHash, "evidenceHash");
  hash(candidate.observationHash, "observationHash");
  hash(envelope.decisionHash, "decisionHash");
  hash(candidate.policyHash, "policyHash");

  const sellingWctc = candidate.direction === TradeDirection.SELL_WCTC;
  if (!sellingWctc && candidate.direction !== TradeDirection.BUY_WCTC) {
    throw new TypeError("direction is outside the closed direction set");
  }

  return {
    schemaVersion: PROPOSAL_SCHEMA_VERSION,
    strategy: candidate.strategy,
    action: candidate.action,
    assetIn: sellingWctc ? mandate.wctc : mandate.stable,
    assetOut: sellingWctc ? mandate.stable : mandate.wctc,
    venue: mandate.venue,
    amountIn: candidate.deterministicAmountIn,
    maxSlippageBps: envelope.maxSlippageBps,
    deadline: envelope.deadline,
    nonce: envelope.nonce,
    evidenceHash: candidate.evidenceHash,
    observationHash: candidate.observationHash,
    decisionHash: envelope.decisionHash,
    policyHash: candidate.policyHash,
  };
}
