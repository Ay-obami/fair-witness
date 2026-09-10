import { describe, expect, it } from "vitest";
import {
  ActionType,
  AutomationMode,
  DecisionOutcome,
  StrategyType,
  TradeDirection,
  parseAiDecision,
  type Candidate,
  type MandateSnapshot,
} from "../src/domain/index.js";
import { buildProposal } from "../src/proposals/index.js";

const hash = (digit: string) => `0x${digit.repeat(64)}` as `0x${string}`;
const mandate: MandateSnapshot = {
  treasuryAddress: "0x1111111111111111111111111111111111111111",
  wctc: "0x2222222222222222222222222222222222222222",
  stable: "0x3333333333333333333333333333333333333333",
  venue: "0x4444444444444444444444444444444444444444",
  universal: { enabledStrategies: 7, maxActionValueE6: 1_000_000_000n, maxSlippageBps: 100, maxSourceDriftBps: 100, maxSpotTwapDeviationBps: 100, minSourceLiquidity: 1n, minDestinationLiquidity: 1n, maxExecutionsPerEpoch: 5, epochLength: 3600, maxAttemptsPerEpoch: 10 },
  arbitrage: { minNetEdgeBps: 80, maxArbitrageValueE6: 1_000_000_000n },
  rebalance: { targetWctcBps: 4000, toleranceBps: 500, maxRebalanceValueE6: 1_000_000_000n },
  risk: { maxWctcExposureBps: 6000, maxRiskReductionValueE6: 1_000_000_000n, dailyRiskReductionValueE6: 2_000_000_000n },
  automationMode: AutomationMode.AUTONOMOUS,
  policyEpoch: 1n,
  policyHash: hash("a"),
};

const candidate: Candidate = {
  strategy: StrategyType.RISK_REDUCTION,
  action: ActionType.SWAP_EXACT_IN,
  evidenceHash: hash("b"), observationHash: hash("c"), policyHash: mandate.policyHash,
  direction: TradeDirection.SELL_WCTC,
  deterministicAmountIn: 1_000_000_000_000_000_000n,
  permittedValueE6: 1_000_000n,
  metrics: { kind: StrategyType.RISK_REDUCTION, currentWctcBps: 7000, maxWctcExposureBps: 6000, excessValueE6: 1_000_000n, remainingDailyValueE6: 1_000_000n },
};

describe("untrusted AI to deterministic proposal integration", () => {
  it("cannot inject an oversized amount or arbitrary venue", () => {
    expect(() => parseAiDecision({ decision: "EXECUTE", strategy: 2, rationale: "sell", reasonTags: [], amountIn: "7000000000" })).toThrow("unsupported field: amountIn");
    expect(() => parseAiDecision({ decision: "EXECUTE", strategy: 2, rationale: "sell", reasonTags: [], venue: "0xdead" })).toThrow("unsupported field: venue");
  });

  it("turns a valid EXECUTE decision into candidate-owned execution terms", () => {
    const decision = parseAiDecision({ decision: DecisionOutcome.EXECUTE, strategy: StrategyType.RISK_REDUCTION, rationale: "Exposure exceeds the mandate.", reasonTags: ["EXPOSURE_BREACH"] });
    expect(decision.decision).toBe(DecisionOutcome.EXECUTE);
    const proposal = buildProposal(candidate, mandate, { nonce: 7n, deadline: 2_000_000_000n, maxSlippageBps: 50, decisionHash: hash("d") });
    expect(proposal.amountIn).toBe(candidate.deterministicAmountIn);
    expect(proposal.assetIn).toBe(mandate.wctc);
    expect(proposal.assetOut).toBe(mandate.stable);
    expect(proposal.venue).toBe(mandate.venue);
    expect(proposal.policyHash).toBe(mandate.policyHash);
  });

  it("keeps WAIT outside the proposal submission path", () => {
    const decision = parseAiDecision({ decision: DecisionOutcome.WAIT, strategy: StrategyType.RISK_REDUCTION, rationale: "Wait for another verified observation.", reasonTags: [] });
    expect(decision.decision).toBe(DecisionOutcome.WAIT);
  });
});
