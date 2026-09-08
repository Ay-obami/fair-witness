import { describe, expect, it } from "vitest";
import {
  ActionType,
  AutomationMode,
  StrategyType,
  TradeDirection,
  type Candidate,
  type MandateSnapshot,
} from "../src/domain/types.js";
import { buildProposal } from "../src/proposals/builder.js";
import { executionKey, hashEvidence, hashPolicy, hashProposal } from "../src/proposals/hashing.js";

const treasury = "0x6666666666666666666666666666666666666666" as const;
const evidenceInput = {
  sourceChainKey: 10_200n,
  sourceBlockHeight: 6_123_456n,
  sourceTxIndex: 7n,
  confirmBlockHeight: 6_123_468n,
  confirmTxIndex: 2n,
  immutableObserver: "0x1111111111111111111111111111111111111111" as const,
  immutableSourcePool: "0x2222222222222222222222222222222222222222" as const,
  sourcePriceE6: 850_000n,
  confirmPriceE6: 851_000n,
  sourceMeanTick: -1_625n,
  confirmMeanTick: -1_613n,
  sourceLiquidity: 9_000_000_000_000_000_000n,
  confirmLiquidity: 9_100_000_000_000_000_000n,
};

const policyInput = {
  wctc: "0x3333333333333333333333333333333333333333" as const,
  stable: "0x4444444444444444444444444444444444444444" as const,
  venue: "0x5555555555555555555555555555555555555555" as const,
  universal: {
    enabledStrategies: 7,
    maxActionValueE6: 10_000_000_000n,
    maxSlippageBps: 100,
    maxSourceDriftBps: 75,
    maxSpotTwapDeviationBps: 50,
    minSourceLiquidity: 1_000_000n,
    minDestinationLiquidity: 2_000_000n,
    maxExecutionsPerEpoch: 4,
    epochLength: 3_600,
    maxAttemptsPerEpoch: 12,
  },
  arbitrage: { minNetEdgeBps: 80, maxArbitrageValueE6: 2_000_000_000n },
  rebalance: { targetWctcBps: 4_000, toleranceBps: 500, maxRebalanceValueE6: 1_000_000_000n },
  risk: {
    maxWctcExposureBps: 6_000,
    maxRiskReductionValueE6: 1_000_000_000n,
    dailyRiskReductionValueE6: 2_500_000_000n,
  },
  automationMode: AutomationMode.AUTONOMOUS,
  policyEpoch: 3n,
};

const evidenceHash = hashEvidence(evidenceInput);
const policyHash = hashPolicy(102_031n, treasury, policyInput);
const proposal = {
  schemaVersion: 1 as const,
  strategy: StrategyType.ARBITRAGE,
  action: ActionType.SWAP_EXACT_IN,
  assetIn: policyInput.wctc,
  assetOut: policyInput.stable,
  venue: policyInput.venue,
  amountIn: 500_000_000_000_000_000n,
  maxSlippageBps: 75,
  deadline: 2_000_000_000n,
  nonce: 42n,
  evidenceHash: evidenceHash as `0x${string}`,
  observationHash: `0x${"aa".repeat(32)}` as `0x${string}`,
  decisionHash: `0x${"bb".repeat(32)}` as `0x${string}`,
  policyHash: policyHash as `0x${string}`,
};

describe("canonical schema-v1 hashing", () => {
  it("locks TypeScript enum ordinals to Solidity", () => {
    expect([StrategyType.ARBITRAGE, StrategyType.REBALANCE, StrategyType.RISK_REDUCTION]).toEqual([0, 1, 2]);
    expect(ActionType.SWAP_EXACT_IN).toBe(0);
  });

  it("matches the published golden vector", () => {
    expect(evidenceHash).toBe("0x5b4f0f2a41cd0bc59b85e16fe4528575db25c79d63875b2eb208afa9e228010d");
    expect(policyHash).toBe("0xc2f1a976e0b4f34bb98757bf8d0ad1385443b47a7dabba50c089f997d3d8d3dd");
    expect(hashProposal(102_031n, treasury, proposal)).toBe(
      "0x343b6f24f17d257706b7f11f4b8f482f6afddd1206391fed43a940ff381fbe21"
    );
    expect(executionKey(treasury, proposal)).toBe(
      "0x4f75099d5463c2fec6b9c12709451b0cb863c2277b6c066850ae8b7bd75062c0"
    );
  });

  it("separates proposal identity by chain and treasury instance", () => {
    const id = hashProposal(102_031n, treasury, proposal);
    expect(hashProposal(102_032n, treasury, proposal)).not.toBe(id);
    expect(hashProposal(102_031n, "0x7777777777777777777777777777777777777777", proposal)).not.toBe(id);
  });

  it("makes execution identity strategy-scoped", () => {
    expect(executionKey(treasury, { ...proposal, strategy: StrategyType.REBALANCE })).not.toBe(
      executionKey(treasury, proposal)
    );
  });

  it("changes when any security-relevant field changes", () => {
    expect(hashEvidence({ ...evidenceInput, confirmPriceE6: 851_001n })).not.toBe(evidenceHash);
    expect(hashPolicy(102_031n, treasury, { ...policyInput, policyEpoch: 4n })).not.toBe(policyHash);
    expect(hashProposal(102_031n, treasury, { ...proposal, nonce: 43n })).not.toBe(
      hashProposal(102_031n, treasury, proposal)
    );
  });

  it("rejects values outside canonical ABI widths", () => {
    expect(() => hashEvidence({ ...evidenceInput, sourceTxIndex: 1n << 64n })).toThrow();
    expect(() => hashEvidence({ ...evidenceInput, sourceMeanTick: 1n << 23n })).toThrow();
    expect(() => hashPolicy(102_031n, treasury, {
      ...policyInput,
      universal: { ...policyInput.universal, epochLength: 2 ** 32 },
    })).toThrow();
  });
});

describe("deterministic proposal builder", () => {
  const mandate = {
    treasuryAddress: treasury,
    ...policyInput,
    policyHash: policyHash as `0x${string}`,
  } satisfies MandateSnapshot;
  const candidate = {
    strategy: StrategyType.ARBITRAGE,
    action: ActionType.SWAP_EXACT_IN,
    evidenceHash: evidenceHash as `0x${string}`,
    observationHash: proposal.observationHash,
    policyHash: proposal.policyHash,
    direction: TradeDirection.SELL_WCTC,
    deterministicAmountIn: proposal.amountIn,
    permittedValueE6: 425_000n,
    metrics: { kind: StrategyType.ARBITRAGE },
  } as Candidate;

  it("derives assets and venue without accepting AI output", () => {
    expect(buildProposal(candidate, mandate, {
      nonce: 42n, deadline: 2_000_000_000n, maxSlippageBps: 75, decisionHash: proposal.decisionHash,
    })).toEqual(proposal);
  });

  it("rejects policy mismatch, excessive slippage, zero amount, and width overflow", () => {
    expect(() => buildProposal({ ...candidate, policyHash: `0x${"cc".repeat(32)}` }, mandate, {
      nonce: 1n, deadline: 2n, maxSlippageBps: 1, decisionHash: proposal.decisionHash,
    })).toThrow(/different policy/);
    expect(() => buildProposal(candidate, mandate, {
      nonce: 1n, deadline: 2n, maxSlippageBps: 101, decisionHash: proposal.decisionHash,
    })).toThrow(/mandate ceiling/);
    expect(() => buildProposal({ ...candidate, deterministicAmountIn: 0n }, mandate, {
      nonce: 1n, deadline: 2n, maxSlippageBps: 1, decisionHash: proposal.decisionHash,
    })).toThrow(/positive/);
    expect(() => buildProposal(candidate, mandate, {
      nonce: 1n << 64n, deadline: 2n, maxSlippageBps: 1, decisionHash: proposal.decisionHash,
    })).toThrow(/canonical width/);
  });
});
