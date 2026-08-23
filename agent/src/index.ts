import { ethers } from "ethers";
import { config } from "./config.js";
import { SepoliaWatcher } from "./sepoliaWatcher.js";
import { AttestcoinClient } from "./attestcoinClient.js";
import { DecisionEngine } from "./decisionEngine.js";
import { ReasoningStore } from "./reasoningStore.js";
import { TreasurySubmitter } from "./submitter.js";
import { DexPriceReader, bpsGap } from "./dexPriceReader.js";
import { factKey, deterministicNonce, actionKey } from "./keys.js";

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main() {
  log("Starting agent runner (no funds held — see DEVLOG.md custody-separation notes)");

  const watcher = new SepoliaWatcher();
  const attestcoin = new AttestcoinClient();
  const decisionEngine = new DecisionEngine();
  const reasoningStore = new ReasoningStore();
  const submitter = new TreasurySubmitter(attestcoin.signer);

  const creditcoinProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  // NOTE: DEX_ROUTER_ADDRESS / BASE_ASSET / QUOTE_ASSET are read from the deployed
  // treasury contract's own immutables at startup, rather than duplicated in agent env
  // vars, so the agent can never drift out of sync with what the contract actually
  // trades. See docs/DEPLOYMENT.md for the one-time setup this assumes.
  const treasuryReadOnly = new ethers.Contract(
    config.treasuryAddress,
    ["function DEX_ROUTER() view returns (address)", "function BASE_ASSET() view returns (address)", "function QUOTE_ASSET() view returns (address)"],
    creditcoinProvider
  );
  const [routerAddress, baseAsset, quoteAsset] = await Promise.all([
    treasuryReadOnly.DEX_ROUTER(),
    treasuryReadOnly.BASE_ASSET(),
    treasuryReadOnly.QUOTE_ASSET(),
  ]);
  const dexReader = new DexPriceReader(routerAddress, baseAsset, quoteAsset, creditcoinProvider);

  log(`Agent submit address: ${attestcoin.submitterAddress} (must hold zero token balance — verify manually before going live)`);
  await attestcoin.assertSourceChainSupported();
  log(`Source chain key ${config.sourceChainKey} confirmed supported.`);

  async function evaluateAndAct(): Promise<void> {
    const observation = await watcher.pollLatest();
    if (!observation) return;

    const destPrice = await dexReader.currentPrice();
    const gap = bpsGap(observation.price, destPrice);

    if (gap < config.minArbWidthBpsLocalEstimate) {
      // Local pre-filter only — saves a proof-generation round trip on an obviously
      // too-narrow gap. The contract's MIN_ARB_WIDTH_BPS is the real, authoritative
      // bound and is re-checked independently on submission regardless.
      return;
    }

    log(`Candidate: src=${observation.price} dest=${destPrice} gap=${gap}bps — building source proof`);

    // The source tx's block must clear Sepolia's reorg-protection window AND be attested
    // before the proof builder can serve a proof for it — otherwise getProof() 404s with
    // "BlockNotOnSourceChain" (retriable) and this candidate would be silently dropped,
    // since pollLatest() advances its scan cursor regardless. Wait for attestation first;
    // same pattern the confirmation proof below already uses.
    log(`Waiting for source block ${observation.blockHeight} to be attested...`);
    await attestcoin.waitUntilReady(observation.blockHeight);

    const sourceProof = await attestcoin.buildProof(observation.transactionHash);
    const fact = factKey(sourceProof.chainKey, sourceProof.blockHeight, sourceProof.transactionIndex);

    // Wait for a later block to be attested before building the confirmation proof —
    // this IS the "second independent attestation" from the design doc, not a formality.
    const targetConfirmHeight = observation.blockHeight + config.confirmGapTargetBlocks;
    log(`Waiting for block ${targetConfirmHeight} to be attested for the confirmation proof...`);
    await attestcoin.waitUntilReady(targetConfirmHeight);

    const confirmObservation = await watcher.pollAt(targetConfirmHeight);
    if (!confirmObservation) {
      log("No new observation at the confirmation height — skipping this cycle.");
      return;
    }
    const confirmProof = await attestcoin.buildProof(confirmObservation.transactionHash);

    const nonce = deterministicNonce(fact, observation.price, confirmObservation.price);
    const key = actionKey(fact, attestcoin.submitterAddress, nonce);

    // Pre-flight replay check — gas-saving optimization only, see submitter.ts docs.
    if (await submitter.alreadyExecuted(key)) {
      log(`Action ${key} already executed — skipping resubmission (retry-safe, no-op).`);
      return;
    }

    const destPriceNow = await dexReader.currentPrice();
    const finalGap = bpsGap(confirmObservation.price, destPriceNow);

    const decision = await decisionEngine.decide({
      srcPrice: observation.price,
      confPrice: confirmObservation.price,
      destPrice: destPriceNow,
      gapBps: finalGap,
    });

    log(`LLM decision: act=${decision.act} — "${decision.rationale}"`);

    const decisionHash = await reasoningStore.put({
      observedGapBps: finalGap,
      sourcePrice: observation.price.toString(),
      confirmPrice: confirmObservation.price.toString(),
      destPrice: destPriceNow.toString(),
      rule: "R-ARB-1",
      llmRationale: decision.rationale,
      timestamp: new Date().toISOString(),
    });

    if (!decision.act) {
      log("LLM recommended not acting — no submission made. (The contract's bounds are a floor, not a target; the LLM may decline even when the contract would technically allow it.)");
      return;
    }

    try {
      const result = await submitter.submit(sourceProof, confirmProof, nonce, decisionHash);
      log(`Executed. actionKey=${result.actionKey} tx=${result.txHash}`);
    } catch (err) {
      // Expected reverts (stale, too-narrow, rate-limited, replay) are the rigid
      // business logic working as designed, not agent failures — see DEVLOG.md.
      log(`Rejected by contract (expected if stale/narrow/rate-limited/replayed): ${err}`);
    }
  }

  log(`Entering poll loop (interval ${config.pollIntervalMs}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await evaluateAndAct();
    } catch (err) {
      log(`Unexpected error in evaluation cycle (will retry next poll): ${err}`);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
