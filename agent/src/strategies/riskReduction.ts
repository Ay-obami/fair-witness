import {
  ActionType, StrategyType, TradeDirection,
  type MandateSnapshot, type RiskReductionCandidate, type VerifiedContext,
} from "../domain/types.js";
import type { Strategy } from "./strategy.js";

const BPS = 10_000n;
const WCTC_UNIT = 10n ** 18n;

/** Exposure-only risk reduction mirrored by the treasury's deterministic policy. */
export class RiskReductionStrategy implements Strategy<RiskReductionCandidate> {
  readonly type = StrategyType.RISK_REDUCTION;
  evaluate(context: VerifiedContext, mandate: MandateSnapshot): RiskReductionCandidate | null {
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
    if (currentWctcBps <= mandate.risk.maxWctcExposureBps) return null;
    const dailyUsed = context.portfolio.dailyRiskReductionUsedE6;
    if (dailyUsed >= mandate.risk.dailyRiskReductionValueE6) return null;
    const excessValueE6 = wctcValueE6 - portfolioValueE6 * BigInt(mandate.risk.maxWctcExposureBps) / BPS;
    const remainingDailyReductionE6 = mandate.risk.dailyRiskReductionValueE6 - dailyUsed;
    let permittedValueE6 = excessValueE6;
    if (permittedValueE6 > mandate.risk.maxRiskReductionValueE6) permittedValueE6 = mandate.risk.maxRiskReductionValueE6;
    if (permittedValueE6 > remainingDailyReductionE6) permittedValueE6 = remainingDailyReductionE6;
    if (permittedValueE6 > mandate.universal.maxActionValueE6) permittedValueE6 = mandate.universal.maxActionValueE6;
    const deterministicAmountIn = permittedValueE6 * WCTC_UNIT / price;
    if (deterministicAmountIn === 0n) return null;
    return {
      strategy: this.type, action: ActionType.SWAP_EXACT_IN,
      evidenceHash: context.evidence.evidenceHash, observationHash: context.observationHash,
      policyHash: mandate.policyHash, direction: TradeDirection.SELL_WCTC,
      deterministicAmountIn, permittedValueE6,
      metrics: { kind: this.type, portfolioValueE6, wctcValueE6, currentWctcBps,
        maxWctcExposureBps: mandate.risk.maxWctcExposureBps, excessValueE6, remainingDailyReductionE6 },
    };
  }
}
