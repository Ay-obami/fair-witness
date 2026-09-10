import {
  ALL_STRATEGIES_MASK,
  StrategyType,
  isStrategyEnabled,
  isStrategyType,
  type Candidate,
  type MandateSnapshot,
  type VerifiedContext,
} from "../domain/index.js";
import type { Strategy } from "./strategy.js";

/** Locked safety-first ordering. Array position is policy, not insertion order. */
export const STRATEGY_PRIORITY: readonly StrategyType[] = Object.freeze([
  StrategyType.RISK_REDUCTION,
  StrategyType.REBALANCE,
  StrategyType.ARBITRAGE,
]);

function assertCandidateMatchesContext(
  candidate: Candidate,
  strategy: StrategyType,
  context: VerifiedContext,
  mandate: MandateSnapshot,
): void {
  if (candidate.strategy !== strategy || candidate.metrics.kind !== strategy) {
    throw new Error("Strategy returned a candidate with mismatched strategy semantics");
  }
  if (
    candidate.evidenceHash !== context.evidence.evidenceHash ||
    candidate.observationHash !== context.observationHash ||
    candidate.policyHash !== mandate.policyHash
  ) {
    throw new Error("Strategy returned a candidate for a different evaluation snapshot");
  }
}

/**
 * Closed registry and deterministic dispatcher. Concrete strategy arithmetic is
 * intentionally deferred to the locked strategy implementation phases.
 */
export class StrategyCoordinator {
  private readonly strategies: ReadonlyMap<StrategyType, Strategy>;

  constructor(strategies: readonly Strategy[]) {
    const byType = new Map<StrategyType, Strategy>();
    for (const strategy of strategies) {
      if (!isStrategyType(strategy.type)) {
        throw new Error(`Invalid strategy registration: ${strategy.type}`);
      }
      if (byType.has(strategy.type)) {
        throw new Error(`Duplicate strategy registration: ${strategy.type}`);
      }
      byType.set(strategy.type, strategy);
    }
    this.strategies = byType;
  }

  strategy(type: StrategyType): Strategy | undefined {
    return this.strategies.get(type);
  }

  evaluate(context: VerifiedContext, mandate: MandateSnapshot): Candidate[] {
    if (context.treasuryAddress !== mandate.treasuryAddress) {
      throw new Error("Context and mandate belong to different treasuries");
    }
    if ((mandate.universal.enabledStrategies & ~ALL_STRATEGIES_MASK) !== 0) {
      throw new Error("Mandate enables an unknown strategy bit");
    }

    const candidates: Candidate[] = [];
    for (const type of STRATEGY_PRIORITY) {
      if (!isStrategyEnabled(mandate.universal.enabledStrategies, type)) continue;
      const strategy = this.strategies.get(type);
      if (!strategy) continue;
      const candidate = strategy.evaluate(context, mandate);
      if (!candidate) continue;
      assertCandidateMatchesContext(candidate, type, context, mandate);
      candidates.push(candidate);
    }
    return candidates;
  }
}

/** Selects one candidate without allowing a caller or AI to choose priority. */
export function selectHighestPriorityCandidate(
  candidates: readonly Candidate[],
): Candidate | null {
  for (const type of STRATEGY_PRIORITY) {
    const matching = candidates.filter((candidate) => candidate.strategy === type);
    if (matching.length > 1) {
      throw new Error(`Multiple candidates produced for strategy: ${type}`);
    }
    if (matching[0]) return matching[0];
  }
  return null;
}

/**
 * One treasury snapshot can yield at most one actionable candidate. An execution
 * invalidates the cycle so lower-priority candidates cannot use stale balances.
 */
export class StrategyEvaluationCycle {
  private invalidated = false;
  private claimed = false;
  private readonly selected: Candidate | null;

  constructor(candidates: readonly Candidate[]) {
    this.selected = selectHighestPriorityCandidate(candidates);
  }

  claimCandidate(): Candidate | null {
    if (this.invalidated || this.claimed) return null;
    this.claimed = true;
    return this.selected;
  }

  invalidateAfterExecution(): void {
    this.invalidated = true;
  }

  get isInvalidated(): boolean {
    return this.invalidated;
  }

  get isClaimed(): boolean {
    return this.claimed;
  }
}
