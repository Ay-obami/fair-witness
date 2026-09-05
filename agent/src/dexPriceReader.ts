import { ethers } from "ethers";

// Minimal Uniswap-V2-style router ABI — matches contracts/src/interfaces/IDexRouter.sol.
// DEVLOG.md "Pitfall: PenguinSwap's real ABI unconfirmed" applies here too — confirm
// against PenguinSwap's actual deployed ABI before relying on this in week 1.
const ROUTER_ABI = [
  "function getAmountOut(uint256 amountIn, address[] calldata path) view returns (uint256 amountOut)",
];

export class DexPriceReader {
  private router: ethers.Contract;
  private baseAsset: string;
  private quoteAsset: string;

  constructor(routerAddress: string, baseAsset: string, quoteAsset: string, provider: ethers.JsonRpcProvider) {
    this.router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);
    this.baseAsset = baseAsset;
    this.quoteAsset = quoteAsset;
  }

  /** Quote for 1 unit of BASE_ASSET (assumes 6 decimals, matching USDC) — mirrors the
   *  contract's own `_quoteCreditcoinDexPrice()` exactly so the agent's pre-flight
   *  estimate matches what the contract will compute. */
  async currentPrice(): Promise<bigint> {
    return this.router.getAmountOut(1_000_000n, [this.baseAsset, this.quoteAsset]);
  }
}

export function bpsGap(a: bigint, b: bigint): number {
  const diff = a > b ? a - b : b - a;
  const base = a > b ? b : a;
  if (base === 0n) return Number.MAX_SAFE_INTEGER;
  return Number((diff * 10_000n) / base);
}

// ---------------------------------------------------------------------------
// Task 3.5: explicit trade direction. The SIGN of (destPrice - confPrice) is
// which direction the evidence supports — the contract validates the proposed
// direction against exactly this rule (ASCTreasuryJournal.executeArbitrage).
// ---------------------------------------------------------------------------

/** Mirrors ASCTreasuryJournal.TradeDirection's enum order exactly (ABI uint8). */
export enum TradeDirection {
  SellBaseForQuote = 0, // valid when destPrice > confPrice (BASE expensive on the DEX)
  BuyBaseForQuote = 1, // valid when destPrice < confPrice (BASE cheap on the DEX)
}

/**
 * The direction the attested/live price relationship supports, or null on a zero gap
 * (no direction is profitable — the contract's width check rejects that case anyway).
 */
export function directionFor(confPrice: bigint, destPrice: bigint): TradeDirection | null {
  if (destPrice === confPrice) return null;
  return destPrice > confPrice ? TradeDirection.SellBaseForQuote : TradeDirection.BuyBaseForQuote;
}

/**
 * Direction-aware arbitrage edge in bps — mirrors the contract's post-3.5 computation
 * exactly: the sell edge is measured against the reference value (confPrice), the buy
 * edge against the cost (destPrice). Only meaningful for a direction directionFor()
 * actually returned for this price pair.
 */
/**
 * Platform fee/slippage/gas reserve in bps — MUST mirror
 * ASCTreasuryJournal.MIN_NET_EDGE_BPS (Task 3.4). The contract reverts
 * unless grossWidth >= minArbWidthBps + 25, so the decision engine reasons
 * about the net edge, not the gross gap.
 */
export const MIN_NET_EDGE_BPS = 25;

/** Gross width net of the platform reserve; 0 when gross cannot cover it. */
export function netEdgeBps(grossBps: bigint): bigint {
  const reserve = BigInt(MIN_NET_EDGE_BPS);
  return grossBps > reserve ? grossBps - reserve : 0n;
}

/**
 * Task 3.4 mirror: the edge the decision engine reasons about is the GROSS
 * width net of the platform reserve — the same quantity the contract's gate
 * requires to clear the per-instance floor. 0 when the reserve can't be paid.
 */
export function edgeBps(confPrice: bigint, destPrice: bigint, direction: TradeDirection): number {
  const gross =
    direction === TradeDirection.SellBaseForQuote
      ? Number(((destPrice - confPrice) * 10_000n) / confPrice)
      : Number(((confPrice - destPrice) * 10_000n) / destPrice);
  return gross > MIN_NET_EDGE_BPS ? gross - MIN_NET_EDGE_BPS : 0;
}
