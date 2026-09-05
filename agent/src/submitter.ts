import { ethers } from "ethers";
import { config } from "./config.js";
import treasuryAbi from "./abi/ASCTreasuryJournal.json" with { type: "json" };
import { TradeDirection } from "./dexPriceReader.js";
import type { AttestedProof } from "./attestcoinClient.js";

export class TreasurySubmitter {
  private contract: ethers.Contract;
  private signer: ethers.Wallet;

  constructor(signer: ethers.Wallet) {
    this.signer = signer;
    // Note: contract will be initialized with the correct address via setTreasuryAddress
    this.contract = new ethers.Contract(
      "0x0000000000000000000000000000000000000000",
      treasuryAbi.abi,
      signer
    );
  }

  /**
   * Sets the target treasury address. This allows the submitter to work with
   * factory-deployed instances.
   */
  setTreasuryAddress(treasuryAddress: string): void {
    this.contract = new ethers.Contract(treasuryAddress, treasuryAbi.abi, this.signer);
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
    decisionHash: string,
    direction: TradeDirection
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
      decisionHash,
      direction
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
