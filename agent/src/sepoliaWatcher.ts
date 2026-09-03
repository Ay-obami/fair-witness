import { ethers } from "ethers";
import { config } from "./config.js";
import priceObservationAbi from "./abi/PriceObservation.json" with { type: "json" };

export interface PriceObservation {
  blockHeight: number;
  transactionIndex: number;
  transactionHash: string;
  price: bigint;
}

/** The slice of a provider/contract pair the watcher actually exercises (kept narrow so tests can stub it). */
export interface SepoliaEndpoint {
  provider: Pick<ethers.Provider, "getBlockNumber">;
  contract: Pick<ethers.Contract, "queryFilter" | "filters">;
}

/**
 * Read-only Sepolia watcher. Deliberately holds no wallet, no private key, no funds —
 * it only ever calls read (`provider.getLogs`) methods. See DEVLOG.md and DESIGN.md for
 * why this separation matters: the agent process as a whole must never be capable of
 * moving treasury funds through any channel other than the contract's gated function.
 *
 * Every read is executed with endpoint failover: Sepolia public RPCs degrade in waves
 * (bogus eth_getLogs errors, timeouts, dropped connections — observed repeatedly on
 * 2026-09-02), so each call tries the endpoint that worked last, then the rest in order,
 * and only fails when every endpoint fails. The working endpoint is "pinned" to avoid
 * adding latency to healthy periods.
 */
export class SepoliaWatcher {
  private endpoints: SepoliaEndpoint[];
  /** Index of the endpoint that most recently served a successful read. */
  private primary = 0;
  private lastScannedBlock: number | null = null;

  constructor(endpoints?: SepoliaEndpoint[]) {
    this.endpoints = endpoints ?? config.sepoliaRpcUrls.map((url) => {
      const provider = new ethers.JsonRpcProvider(url);
      return { provider, contract: new ethers.Contract(config.priceContractAddress, priceObservationAbi, provider) } as SepoliaEndpoint;
    });
    if (this.endpoints.length === 0) throw new Error("SepoliaWatcher needs at least one RPC endpoint");
  }

  /**
   * Runs `op` against each endpoint in turn, starting from the last-known-good one.
   * Throws the LAST endpoint's error only if every endpoint failed.
   */
  private async failover<T>(op: (endpoint: SepoliaEndpoint) => Promise<T>): Promise<T> {
    const order = [...this.endpoints.keys()];
    order.push(...order.splice(0, this.primary)); // rotate so the pinned primary is tried first
    let lastError: unknown;
    for (const i of order) {
      try {
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
   * Returns the most recent PriceObserved event within the last `lookbackBlocks` blocks,
   * or null if none. Tracks the last scanned block so repeated polls don't re-scan the
   * entire lookback window every time.
   */
  async pollLatest(lookbackBlocks = 20): Promise<PriceObservation | null> {
    return this.failover(async (endpoint) => {
      const latest = await endpoint.provider.getBlockNumber();
      const fromBlock = this.lastScannedBlock ?? Math.max(0, latest - lookbackBlocks);

      const events = await endpoint.contract.queryFilter(
        endpoint.contract.filters.PriceObserved(),
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
        price: ev.args.price as bigint,
      };
    });
  }

  /** Re-reads a specific observation at a later point, used for the confirmation proof. */
  async pollAt(blockHeight: number): Promise<PriceObservation | null> {
    return this.failover(async (endpoint) => {
      // Scan [target, target+15]: the firer's write cadence (~1 per 2-3 blocks when healthy)
      // can leave a bare 6-block window empty during RPC storms, and the tenants'
      // confirm-gap bounds (20/30 blocks) are the real ceiling — the contract re-checks
      // them on-chain regardless.
      const events = await endpoint.contract.queryFilter(
        endpoint.contract.filters.PriceObserved(),
        blockHeight,
        blockHeight + 15
      );
      if (events.length === 0) return null;
      const ev = events[0] as ethers.EventLog;
      return {
        blockHeight: ev.blockNumber,
        transactionIndex: ev.transactionIndex,
        transactionHash: ev.transactionHash,
        price: ev.args.price as bigint,
      };
    });
  }

  async currentBlockNumber(): Promise<number> {
    return this.failover((endpoint) => endpoint.provider.getBlockNumber());
  }
}
