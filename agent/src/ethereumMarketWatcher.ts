import { ethers } from "ethers";
import { config } from "./config.js";
import marketObserverAbi from "./abi/EthereumV3MarketObserver.json" with { type: "json" };

export interface MarketObservation {
  blockHeight: number;
  transactionIndex: number;
  transactionHash: string;
  price: bigint;
  arithmeticMeanTick: bigint;
  spotSqrtPriceX96: bigint;
  liquidity: bigint;
  reporter: string;
}

/** The slice of a provider/contract pair the watcher actually exercises (kept narrow so tests can stub it). */
export interface EthereumEndpoint {
  provider: Pick<ethers.Provider, "getBlockNumber" | "getNetwork">;
  contract: Pick<ethers.Contract, "queryFilter" | "filters">;
}

/**
 * Read-only Ethereum-mainnet watcher for the immutable Uniswap V3 market observer.
 * It holds no wallet and accepts only the observer's pool-derived event shape.
 *
 * Every read is executed with endpoint failover: public RPCs can degrade in waves
 * (bogus eth_getLogs errors, timeouts, dropped connections — observed repeatedly on
 * 2026-09-02), so each call tries the endpoint that worked last, then the rest in order,
 * and only fails when every endpoint fails. The working endpoint is "pinned" to avoid
 * adding latency to healthy periods.
 */
export class EthereumMarketWatcher {
  private endpoints: EthereumEndpoint[];
  /** Index of the endpoint that most recently served a successful read. */
  private primary = 0;
  private lastScannedBlock: number | null = null;

  constructor(endpoints?: EthereumEndpoint[]) {
    const urls = config.ethereumRpcUrls.length > 0
      ? config.ethereumRpcUrls
      : [config.ethereumRpcUrl];
    this.endpoints = endpoints ?? urls.map((url) => {
      const provider = new ethers.JsonRpcProvider(url);
      return {
        provider,
        contract: new ethers.Contract(config.marketObserverAddress, marketObserverAbi, provider),
      } as EthereumEndpoint;
    });
    if (this.endpoints.length === 0) {
      throw new Error("EthereumMarketWatcher needs at least one RPC endpoint");
    }
  }

  /**
   * Runs `op` against each endpoint in turn, starting from the last-known-good one.
   * Throws the LAST endpoint's error only if every endpoint failed.
   */
  private async failover<T>(op: (endpoint: EthereumEndpoint) => Promise<T>): Promise<T> {
    const order = [...this.endpoints.keys()];
    order.push(...order.splice(0, this.primary)); // rotate so the pinned primary is tried first
    let lastError: unknown;
    for (const i of order) {
      try {
        const network = await this.endpoints[i].provider.getNetwork();
        if (network.chainId !== 1n) {
          throw new Error(
            `Source RPC must be Ethereum mainnet (chainId 1), received ${network.chainId}`
          );
        }
        const result = await op(this.endpoints[i]);
        this.primary = i;
        return result;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  /**
   * Returns the most recent MarketPriceObserved event within the lookback,
   * or null if none. Tracks the last scanned block so repeated polls don't re-scan the
   * entire lookback window every time.
   */
  async pollLatest(lookbackBlocks = 40): Promise<MarketObservation | null> {
    return this.failover(async (endpoint) => {
      const latest = await endpoint.provider.getBlockNumber();
      const fromBlock = this.lastScannedBlock ?? Math.max(0, latest - lookbackBlocks);

      const events = await endpoint.contract.queryFilter(
        endpoint.contract.filters.MarketPriceObserved(),
        fromBlock,
        latest
      );

      this.lastScannedBlock = latest + 1;

      if (events.length === 0) return null;

      const ev = events[events.length - 1] as ethers.EventLog;
      return {
        blockHeight: ev.blockNumber,
        transactionIndex: ev.transactionIndex,
        transactionHash: ev.transactionHash,
        price: ev.args.priceE6 as bigint,
        arithmeticMeanTick: ev.args.arithmeticMeanTick as bigint,
        spotSqrtPriceX96: ev.args.spotSqrtPriceX96 as bigint,
        liquidity: ev.args.liquidity as bigint,
        reporter: ev.args.reporter as string,
      };
    });
  }

  /** Re-reads a specific observation at a later point, used for the confirmation proof. */
  async pollAt(blockHeight: number): Promise<MarketObservation | null> {
    return this.failover(async (endpoint) => {
      // Scan [target, target+15]: the firer's write cadence (~1 per 2-3 blocks when healthy)
      // can leave a bare 6-block window empty during RPC storms, and the tenants'
      // confirm-gap bounds (20/30 blocks) are the real ceiling — the contract re-checks
      // them on-chain regardless.
      const events = await endpoint.contract.queryFilter(
        endpoint.contract.filters.MarketPriceObserved(),
        blockHeight,
        blockHeight + 15
      );
      if (events.length === 0) return null;
      const ev = events[0] as ethers.EventLog;
      return {
        blockHeight: ev.blockNumber,
        transactionIndex: ev.transactionIndex,
        transactionHash: ev.transactionHash,
        price: ev.args.priceE6 as bigint,
        arithmeticMeanTick: ev.args.arithmeticMeanTick as bigint,
        spotSqrtPriceX96: ev.args.spotSqrtPriceX96 as bigint,
        liquidity: ev.args.liquidity as bigint,
        reporter: ev.args.reporter as string,
      };
    });
  }

  async currentBlockNumber(): Promise<number> {
    return this.failover((endpoint) => endpoint.provider.getBlockNumber());
  }
}
