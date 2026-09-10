import {
  ActionType, StrategyType, TradeDirection,
  type MandateSnapshot, type RebalanceCandidate, type VerifiedContext,
} from "../domain/types.js";
import type { Strategy } from "./strategy.js";

const BPS = 10_000n;
const WCTC_UNIT = 10n ** 18n;

/** Deterministic two-asset portfolio accounting mirrored by the treasury. */
export class RebalancingStrategy implements Strategy<RebalanceCandidate> {
  readonly type = StrategyType.REBALANCE;
  evaluate(context: VerifiedContext, mandate: MandateSnapshot): RebalanceCandidate | null {
    const bpsGap = (a: bigint, b: bigint): number => {
      const base = a < b ? a : b;
      return base === 0n ? Number.MAX_SAFE_INTEGER : Number(((a > b ? a - b : b - a) * BPS) / base);
    };
    if (bpsGap(context.evidence.source.priceE6, context.evidence.confirmation.priceE6) > mandate.universal.maxSourceDriftBps ||
        context.evidence.source.liquidity < mandate.universal.minSourceLiquidity ||
        context.evidence.confirmation.liquidity < mandate.universal.minSourceLiquidity ||
        context.destination.liquidity < mandate.universal.minDestinationLiquidity ||
        bpsGap(context.destination.twapPriceE6, context.destination.spotPriceE6) > mandate.universal.maxSpotTwapDeviationBps) return null;
    const price = context.evidence.confirmation.priceE6;
    if (price <= 0n) return null;
    const wctcValueE6 = context.portfolio.wctcBalance * price / WCTC_UNIT;
    const portfolioValueE6 = wctcValueE6 + context.portfolio.stableBalance;
    if (portfolioValueE6 === 0n) return null;
    const currentWctcBps = Number(wctcValueE6 * BPS / portfolioValueE6);
    const targetWctcBps = mandate.rebalance.targetWctcBps;
    const deviationBps = Math.abs(currentWctcBps - targetWctcBps);
    if (deviationBps <= mandate.rebalance.toleranceBps) return null;
    const targetValueE6 = portfolioValueE6 * BigInt(targetWctcBps) / BPS;
    const requiredAdjustmentE6 = wctcValueE6 > targetValueE6
      ? wctcValueE6 - targetValueE6 : targetValueE6 - wctcValueE6;
    let permittedValueE6 = requiredAdjustmentE6;
    if (permittedValueE6 > mandate.rebalance.maxRebalanceValueE6) permittedValueE6 = mandate.rebalance.maxRebalanceValueE6;
    if (permittedValueE6 > mandate.universal.maxActionValueE6) permittedValueE6 = mandate.universal.maxActionValueE6;
    const direction = currentWctcBps > targetWctcBps ? TradeDirection.SELL_WCTC : TradeDirection.BUY_WCTC;
    const deterministicAmountIn = direction === TradeDirection.SELL_WCTC
      ? permittedValueE6 * WCTC_UNIT / price : permittedValueE6;
    if (deterministicAmountIn === 0n) return null;
    return {
      strategy: this.type, action: ActionType.SWAP_EXACT_IN,
      evidenceHash: context.evidence.evidenceHash, observationHash: context.observationHash,
      policyHash: mandate.policyHash, direction, deterministicAmountIn, permittedValueE6,
      metrics: { kind: this.type, portfolioValueE6, wctcValueE6, currentWctcBps,
        targetWctcBps, toleranceBps: mandate.rebalance.toleranceBps, deviationBps, requiredAdjustmentE6 },
    };
  }
}
