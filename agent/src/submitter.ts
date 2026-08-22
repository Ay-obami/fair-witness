import { ethers } from "ethers";
import { config } from "./config.js";
import treasuryAbi from "./abi/ASCTreasuryJournal.json" with { type: "json" };
import type { AttestedProof } from "./attestcoinClient.js";

export class TreasurySubmitter {
  private contract: ethers.Contract;

  constructor(signer: ethers.Wallet) {
    this.contract = new ethers.Contract(config.treasuryAddress, treasuryAbi, signer);
  }

  /**
   * Pre-flight check ONLY — this is a gas-saving optimization, not the safety mechanism.
   * The real guarantee is the contract's own `require(!executedActions[actionKey])`
   * inside executeArbitrage; this just avoids paying for a submission we already know
   * will revert. See DEVLOG.md / DESIGN.md for why this distinction matters.
   */
  async alreadyExecuted(actionKey: string): Promise<boolean> {
    return this.contract.executedActions(actionKey);
  }

  async submit(
    sourceProof: AttestedProof,
    confirmProof: AttestedProof,
    nonce: bigint,
    decisionHash: string
  ): Promise<{ actionKey: string; txHash: string }> {
    const toContractProof = (p: AttestedProof) => ({
      chainKey: p.chainKey,
      blockHeight: p.blockHeight,
      transactionIndex: p.transactionIndex,
      encodedTransaction: p.encodedTransaction,
      merkleProof: p.merkleProof,
      continuityProof: p.continuityProof,
    });

    const tx = await this.contract.executeArbitrage(
      toContractProof(sourceProof),
      toContractProof(confirmProof),
      nonce,
      decisionHash
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: ethers.LogDescription | null) => parsed?.name === "ActionJournaled");

    const resolvedActionKey = event ? (event.args.actionKey as string) : "";
    return { actionKey: resolvedActionKey, txHash: receipt.hash };
  }
}
