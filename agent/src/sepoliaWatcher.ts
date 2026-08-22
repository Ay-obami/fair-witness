import { ethers } from "ethers";
import { config } from "./config.js";
import priceObservationAbi from "./abi/PriceObservation.json" with { type: "json" };

export interface PriceObservation {
  blockHeight: number;
  transactionIndex: number;
  transactionHash: string;
  price: bigint;
}

/**
 * Read-only Sepolia watcher. Deliberately holds no wallet, no private key, no funds —
 * it only ever calls read (`provider.getLogs`) methods. See DEVLOG.md and DESIGN.md for
 * why this separation matters: the agent process as a whole must never be capable of
 * moving treasury funds through any channel other than the contract's gated function.
 */
export class SepoliaWatcher {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private lastScannedBlock: number | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    this.contract = new ethers.Contract(config.priceContractAddress, priceObservationAbi, this.provider);
  }

  /**
   * Returns the most recent PriceObserved event within the last `lookbackBlocks` blocks,
   * or null if none. Tracks the last scanned block so repeated polls don't re-scan the
   * entire lookback window every time.
   */
  async pollLatest(lookbackBlocks = 20): Promise<PriceObservation | null> {
    const latest = await this.provider.getBlockNumber();
    const fromBlock = this.lastScannedBlock ?? Math.max(0, latest - lookbackBlocks);

    const events = await this.contract.queryFilter(
      this.contract.filters.PriceObserved(),
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
  }

  /** Re-reads a specific observation at a later point, used for the confirmation proof. */
  async pollAt(blockHeight: number): Promise<PriceObservation | null> {
    const events = await this.contract.queryFilter(
      this.contract.filters.PriceObserved(),
      blockHeight,
      blockHeight + 5
    );
    if (events.length === 0) return null;
    const ev = events[0] as ethers.EventLog;
    return {
      blockHeight: ev.blockNumber,
      transactionIndex: ev.transactionIndex,
      transactionHash: ev.transactionHash,
      price: ev.args.price as bigint,
    };
  }

  async currentBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }
}
