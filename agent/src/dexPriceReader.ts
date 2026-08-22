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
