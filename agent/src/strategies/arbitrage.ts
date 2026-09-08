import {
  ActionType,
  StrategyType,
  TradeDirection,
  type ArbitrageCandidate,
  type MandateSnapshot,
  type VerifiedContext,
} from "../domain/types.js";
import type { Strategy } from "./strategy.js";

const BPS = 10_000n;
const WCTC_UNIT = 10n ** 18n;
const EXECUTION_RESERVE_BPS = 20;

function gap(a: bigint, b: bigint): number {
  const base = a < b ? a : b;
  if (base === 0n) return Number.MAX_SAFE_INTEGER;
  return Number(((a > b ? a - b : b - a) * BPS) / base);
}

/** Deterministic mirror of the schema-v1 treasury arbitrage branch. */
export class ArbitrageStrategy implements Strategy<ArbitrageCandidate> {
  readonly type = StrategyType.ARBITRAGE;
  constructor(private readonly proposalSlippageBps: number) {}

  evaluate(context: VerifiedContext, mandate: MandateSnapshot): ArbitrageCandidate | null {
    if (this.proposalSlippageBps < 0 || this.proposalSlippageBps > mandate.universal.maxSlippageBps) return null;
    const source = context.evidence.source;
    const confirmation = context.evidence.confirmation;
    const destination = context.destination;
    const sourceDriftBps = gap(source.priceE6, confirmation.priceE6);
    const spotTwapDeviationBps = gap(destination.twapPriceE6, destination.spotPriceE6);
    if (sourceDriftBps > mandate.universal.maxSourceDriftBps ||
        source.liquidity < mandate.universal.minSourceLiquidity ||
        confirmation.liquidity < mandate.universal.minSourceLiquidity ||
        destination.liquidity < mandate.universal.minDestinationLiquidity ||
        spotTwapDeviationBps > mandate.universal.maxSpotTwapDeviationBps ||
        destination.twapPriceE6 === confirmation.priceE6) return null;

    const direction = destination.twapPriceE6 > confirmation.priceE6
      ? TradeDirection.SELL_WCTC : TradeDirection.BUY_WCTC;
    const grossEdgeBps = direction === TradeDirection.SELL_WCTC
      ? Number(((destination.twapPriceE6 - confirmation.priceE6) * BPS) / confirmation.priceE6)
      : Number(((confirmation.priceE6 - destination.twapPriceE6) * BPS) / destination.twapPriceE6);
    const poolFeeBps = Math.ceil(destination.poolFee / 100);
    const costs = poolFeeBps + this.proposalSlippageBps + EXECUTION_RESERVE_BPS;
    const netEdgeBps = grossEdgeBps - costs;
    if (netEdgeBps < mandate.arbitrage.minNetEdgeBps) return null;

    let valueCap = mandate.arbitrage.maxArbitrageValueE6 < mandate.universal.maxActionValueE6
      ? mandate.arbitrage.maxArbitrageValueE6 : mandate.universal.maxActionValueE6;
    const balanceValue = direction === TradeDirection.SELL_WCTC
      ? context.portfolio.wctcBalance * destination.twapPriceE6 / WCTC_UNIT
      : context.portfolio.stableBalance;
    if (balanceValue < valueCap) valueCap = balanceValue;
    let permittedValueE6 = valueCap * BigInt(netEdgeBps) / (BigInt(mandate.arbitrage.minNetEdgeBps) * 4n);
    if (permittedValueE6 > valueCap) permittedValueE6 = valueCap;
    const deterministicAmountIn = direction === TradeDirection.SELL_WCTC
      ? permittedValueE6 * WCTC_UNIT / destination.twapPriceE6 : permittedValueE6;
    if (deterministicAmountIn === 0n) return null;

    return {
      strategy: this.type, action: ActionType.SWAP_EXACT_IN,
      evidenceHash: context.evidence.evidenceHash,
      observationHash: context.observationHash,
      policyHash: mandate.policyHash,
      direction, deterministicAmountIn, permittedValueE6,
      metrics: {
        kind: this.type,
        sourcePriceE6: source.priceE6,
        confirmationPriceE6: confirmation.priceE6,
        destinationTwapPriceE6: destination.twapPriceE6,
        destinationSpotPriceE6: destination.spotPriceE6,
        sourceDriftBps, spotTwapDeviationBps, grossEdgeBps, poolFeeBps,
        effectiveSlippageBps: this.proposalSlippageBps,
        executionReserveBps: EXECUTION_RESERVE_BPS,
        netEdgeBps,
      },
    };
  }
}
