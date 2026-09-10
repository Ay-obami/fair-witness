import { ethers } from "ethers";
import treasuryAbi from "../abi/FairWitnessTreasury.json" with { type: "json" };
import type { AttemptProjection, AuditRepository } from "./types.js";

const ZERO_HASH = `0x${"00".repeat(32)}`;

export class AttemptIndexer {
  private readonly iface = new ethers.Interface(treasuryAbi);
  constructor(
    private readonly provider: ethers.Provider,
    private readonly repository: AuditRepository,
    private readonly chainId: bigint,
  ) {}

  async ingest(treasuryAddress: string, fromBlock: number, toBlock: number): Promise<number> {
    const event = this.iface.getEvent("AttemptResolved");
    if (!event) throw new Error("AttemptResolved ABI missing");
    const logs = await this.provider.getLogs({ address: treasuryAddress, topics: [event.topicHash], fromBlock, toBlock });
    let ingested = 0;
    const contract = new ethers.Contract(treasuryAddress, treasuryAbi, this.provider);
    for (const log of logs) {
      const parsed = this.iface.parseLog(log);
      if (!parsed) continue;
      const record = await contract.getAttempt(parsed.args.attemptId, { blockTag: log.blockNumber });
      await this.repository.upsertAttempt(normalizeAttempt(this.chainId, treasuryAddress, log, record));
      ingested++;
    }
    return ingested;
  }

  async reconcileBlock(blockNumber: number, indexedBlockHash: string): Promise<boolean> {
    const canonical = await this.provider.getBlock(blockNumber);
    if (canonical?.hash?.toLowerCase() === indexedBlockHash.toLowerCase()) return true;
    await this.repository.markBlockOrphaned(this.chainId, indexedBlockHash);
    return false;
  }
}

export function normalizeAttempt(
  chainId: bigint,
  treasuryAddress: string,
  log: Pick<ethers.Log, "transactionHash" | "blockNumber" | "blockHash" | "index">,
  r: Record<string, unknown>,
): AttemptProjection {
  const n = (key: string): bigint => BigInt(r[key] as bigint);
  const s = (key: string): string => String(r[key] ?? ZERO_HASH);
  return {
    chainId, treasuryAddress, transactionHash: log.transactionHash, blockNumber: BigInt(log.blockNumber),
    blockHash: log.blockHash, logIndex: log.index, attemptId: n("attemptId"), proposalId: s("proposalId"),
    executionKey: s("executionKey"), agent: s("agent"), nonce: n("nonce"), sourceChainKey: n("sourceChainKey"),
    sourceBlockHeight: n("sourceBlockHeight"), sourceTxIndex: n("sourceTxIndex"),
    confirmBlockHeight: n("confirmBlockHeight"), confirmTxIndex: n("confirmTxIndex"),
    assetIn: s("assetIn"), assetOut: s("assetOut"), venue: s("venue"), strategy: Number(r.strategy),
    action: Number(r.action), result: Number(r.result), reason: Number(r.reason), evidenceStatus: Number(r.evidenceStatus),
    evidenceHash: s("evidenceHash"), observationHash: s("observationHash"), decisionHash: s("decisionHash"),
    policyHash: s("policyHash"), evaluatedStateHash: s("evaluatedStateHash"), proposedAmountIn: n("proposedAmountIn"),
    permittedValueE6: n("permittedValueE6"), amountInActual: n("amountInActual"), amountOutActual: n("amountOutActual"),
    currentWctcBps: Number(r.currentWctcBps), referenceBps: Number(r.referenceBps), submittedAt: n("submittedAt"),
    resolvedAt: n("resolvedAt"), syncStatus: "CANONICAL",
  };
}
