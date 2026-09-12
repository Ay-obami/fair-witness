import { ethers } from "ethers";
import treasuryAbi from "./abi/FairWitnessTreasury.json" with { type: "json" };
import type { AttestedProof } from "./attestcoinClient.js";
import type { ProposalV1 } from "./proposals/types.js";

export interface PolicySubmissionResult {
  attemptId: bigint;
  result: number;
  reason: number;
  txHash: string;
}

export interface PolicyPreviewResult {
  attemptId: bigint;
  reason: number;
}

/** Schema-v1 submitter. It transports typed artifacts and has no execution authority. */
export class PolicySubmitter {
  private readonly contract: ethers.Contract;
  constructor(treasury: string, signer: ethers.Signer) {
    this.contract = new ethers.Contract(treasury, treasuryAbi, signer);
  }
  async alreadyExecuted(executionKey: string): Promise<boolean> {
    return this.contract.executedEvidence(executionKey);
  }
  async preview(proposal: ProposalV1, source: AttestedProof, confirmation: AttestedProof): Promise<PolicyPreviewResult> {
    const proof = (value: AttestedProof) => ({
      chainKey: value.chainKey, blockHeight: value.blockHeight, transactionIndex: value.transactionIndex,
      encodedTransaction: value.encodedTransaction, merkleProof: value.merkleProof, continuityProof: value.continuityProof,
    });
    const result = await this.contract.submitProposal.staticCall(proposal, proof(source), proof(confirmation));
    return { attemptId: BigInt(result[0]), reason: Number(result[1]) };
  }
  async submit(proposal: ProposalV1, source: AttestedProof, confirmation: AttestedProof): Promise<PolicySubmissionResult> {
    const proof = (value: AttestedProof) => ({
      chainKey: value.chainKey, blockHeight: value.blockHeight, transactionIndex: value.transactionIndex,
      encodedTransaction: value.encodedTransaction, merkleProof: value.merkleProof, continuityProof: value.continuityProof,
    });
    const tx = await this.contract.submitProposal(proposal, proof(source), proof(confirmation));
    const receipt = await tx.wait();
    const resolved = receipt.logs.map((log: ethers.Log) => {
      try { return this.contract.interface.parseLog(log); } catch { return null; }
    }).find((entry: ethers.LogDescription | null) => entry?.name === "AttemptResolved");
    if (!resolved) throw new Error("AttemptResolved event missing from successful submission receipt");
    return { attemptId: resolved.args.attemptId, result: Number(resolved.args.result), reason: Number(resolved.args.reason), txHash: receipt.hash };
  }
}
