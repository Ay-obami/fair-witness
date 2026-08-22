import { ethers } from "ethers";
// Real, confirmed exports per DEVLOG.md session-3 research (npm pack @gluwa/usc-sdk).
import { proofProvider, blockProver as blockProverNs, chainInfo as chainInfoNs } from "@gluwa/usc-sdk";
import { config } from "./config.js";

export interface AttestedProof {
  chainKey: number;
  blockHeight: number; // headerNumber in SDK terms
  transactionIndex: number;
  encodedTransaction: string; // txBytes
  merkleProof: unknown; // opaque — passed straight through to the contract call
  continuityProof: unknown;
}

/**
 * Thin wrapper around the real SDK components, isolated in one file so that if the SDK's
 * API shifts across versions, only this file needs to change. See DEVLOG.md for the two
 * distinct "attested" checks this class exposes and why they're kept separate rather than
 * unified into one method.
 */
export class AttestcoinClient {
  private proofBuilder: InstanceType<typeof proofProvider.service.ProofBuilder>;
  private blockProver: InstanceType<typeof blockProverNs.PrecompileBlockProver>;
  private chainInfoProvider: InstanceType<typeof chainInfoNs.PrecompileChainInfoProvider>;
  private creditcoinProvider: ethers.JsonRpcProvider;
  private submitWallet: ethers.Wallet;

  constructor() {
    this.creditcoinProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
    this.submitWallet = new ethers.Wallet(config.agentSubmitPrivateKey, this.creditcoinProvider);

    // NOTE: cast through `unknown` here — see DEVLOG.md "Pitfall: ethers type-identity
    // mismatch with usc-sdk". Only one `ethers` package is actually installed
    // (confirmed via `find node_modules`); this is TypeScript treating the SDK's
    // bundled `.d.ts` private-field brands as a structurally different type than our
    // installed copy, not a real runtime incompatibility.
    this.proofBuilder = new proofProvider.service.ProofBuilder(config.sourceChainKey, config.proofBuilderUrl);
    this.blockProver = new blockProverNs.PrecompileBlockProver(this.creditcoinProvider as unknown as ConstructorParameters<typeof blockProverNs.PrecompileBlockProver>[0]);
    this.chainInfoProvider = new chainInfoNs.PrecompileChainInfoProvider(this.creditcoinProvider as unknown as ConstructorParameters<typeof chainInfoNs.PrecompileChainInfoProvider>[0]);
  }

  /** Confirms the source chain is actually supported before wasting a poll cycle on it.
   *  Run this once at startup — see PRD "call getSupportedChains() on day one". */
  async assertSourceChainSupported(): Promise<void> {
    const chain = await this.chainInfoProvider.getSupportedChainByKey(config.sourceChainKey);
    if (!chain) {
      throw new Error(
        `Source chain key ${config.sourceChainKey} is not in the supported chains list. ` +
          `Run getSupportedChains() to see what's actually available on this network.`
      );
    }
  }

  /**
   * Waits for BOTH: (a) the proof builder service's cache to have ingested the target
   * height (so getProof() won't fail/retry), AND (b) the ChainInfo precompile to agree
   * the height is attested on-chain. See DEVLOG for why these are checked separately —
   * they can disagree under proof-builder cache lag, and only the precompile's answer is
   * the on-chain source of truth the contract itself will re-derive when it calls verify.
   */
  async waitUntilReady(targetHeight: number): Promise<void> {
    await this.proofBuilder.waitUntilHeightAttested(config.sourceChainKey, targetHeight);
    await this.chainInfoProvider.waitUntilHeightAttested(config.sourceChainKey, targetHeight);
  }

  async buildProof(transactionHash: string): Promise<AttestedProof> {
    const result = await this.proofBuilder.getProof(transactionHash);
    if (!result.success || !result.data) {
      throw new Error(`Proof generation failed for ${transactionHash}: ${"error" in result ? result.error : "unknown"}`);
    }
    const data = result.data;
    return {
      chainKey: data.chainKey,
      blockHeight: data.headerNumber,
      transactionIndex: data.txIndex,
      encodedTransaction: data.txBytes,
      merkleProof: data.merkleProof,
      continuityProof: data.continuityProof,
    };
  }

  /** Read-only pre-check (no gas spent) before the real on-chain submission. */
  async verifyOffchain(proof: AttestedProof): Promise<boolean> {
    return this.blockProver.verifySingle(
      proof.chainKey,
      proof.blockHeight,
      proof.encodedTransaction,
      proof.merkleProof as never,
      proof.continuityProof as never
    );
  }

  get submitterAddress(): string {
    return this.submitWallet.address;
  }

  get signer(): ethers.Wallet {
    return this.submitWallet;
  }
}
