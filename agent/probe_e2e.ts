import "dotenv/config";
import { ethers } from "ethers";
import { config } from "./src/config.js";
import { AttestcoinClient } from "./src/attestcoinClient.js";
import { SepoliaWatcher } from "./src/sepoliaWatcher.js";
import { DecisionEngine } from "./src/decisionEngine.js";
import { ReasoningStore } from "./src/reasoningStore.js";
import {
  createTenantRuntime,
  runTenantCycle,
  type SharedDeps,
  type CycleProofs,
} from "./src/tenantRunner.js";
import { factKey, deterministicNonce } from "./src/keys.js";
import type { PriceObservation } from "./src/sepoliaWatcher.js";

// Live end-to-end probe against BOTH funded instances, reusing the height that
// the CC3 proof-builder already attested (11615757) so we exercise the real
// buildProof -> runTenantCycle -> Gemini -> executeArbitrage path WITHOUT
// re-paying the ~8-min attestation-wait. Retries pollAt to absorb publicnode
// queryFilter flakes (the firer lands ~1 observation per 15s, so a 5-block
// window reliably contains events).
const SOURCE_HEIGHT = 1_615_757;
const CONFIRM_HEIGHT = SOURCE_HEIGHT + 3; // = 11615760

const log = (m: string) => console.log(`[probe] ${new Date().toISOString()} ${m}`);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// pollAt with retries: publicnode occasionally returns an empty log range on a
// flaky rpc call, so retry a few times before declaring "no observation".
async function pollAtRobust(
  watcher: SepoliaWatcher,
  height: number,
  attempts = 12,
  backoffMs = 6000
): Promise<PriceObservation | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const obs = await watcher.pollAt(height);
      if (obs) {
        log(`pollAt(${height}) resolved on try ${i + 1}: tx=${obs.transactionHash} price=${obs.price}`);
        return obs;
      }
    } catch (e: any) {
      log(`pollAt(${height}) threw on try ${i + 1}/${attempts}: ${e?.message ?? e}`);
    }
    await delay(backoffMs);
  }
  return null;
}

async function main() {
  const ac = new AttestcoinClient();
  const watcher = new SepoliaWatcher();
  const decisionEngine = new DecisionEngine();
  const reasoningStore = new ReasoningStore();
  const shared: SharedDeps = { watcher, attestcoin: ac, decisionEngine, reasoningStore };

  await ac.assertSourceChainSupported();
  log("source chain key confirmed supported");

  await ac.waitUntilReady(SOURCE_HEIGHT);
  log(`source ${SOURCE_HEIGHT} attested by CC3`);
  const sourceObs = await pollAtRobust(watcher, SOURCE_HEIGHT);
  if (!sourceObs) throw new Error(`no PriceObserved event found at ${SOURCE_HEIGHT} after retries`);
  log(`source obs: tx=${sourceObs.transactionHash} price=${sourceObs.price}`);

  await ac.waitUntilReady(CONFIRM_HEIGHT);
  log(`confirm ${CONFIRM_HEIGHT} attested by CC3`);
  const confirmObs = await pollAtRobust(watcher, CONFIRM_HEIGHT);
  if (!confirmObs) throw new Error(`no PriceObserved event found at ${CONFIRM_HEIGHT} after retries`);
  log(`confirm obs: tx=${confirmObs.transactionHash} price=${confirmObs.price}`);

  log("building SOURCE proof (up to 120s window)...");
  const sourceProof = await ac.buildProof(sourceObs.transactionHash);
  log(`source proof: chainKey=${sourceProof.chainKey} block=${sourceProof.blockHeight} idx=${sourceProof.transactionIndex}`);
  log("building CONFIRM proof (up to 120s window)...");
  const confirmProof = await ac.buildProof(confirmObs.transactionHash);
  log(`confirm proof built (block ${confirmProof.blockHeight})`);

  const fact = factKey(sourceProof.chainKey, sourceProof.blockHeight, sourceProof.transactionIndex);
  const nonce = deterministicNonce(fact, sourceObs.price, confirmObs.price);
  log(`fact=${fact}`);
  log(`nonce=${nonce}`);

  const proofs: CycleProofs = {
    sourceObservationPrice: sourceObs.price,
    confirmObservationPrice: confirmObs.price,
    sourceProof,
    confirmProof,
    fact,
    nonce,
    agentAddress: ac.submitterAddress,
  };
  log("PROOFS_OK — now driving BOTH tenant cycles live (Gemini + on-chain submit)");

  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const signer = ac.signer;
  const tenants = [
    { label: "tenant-a", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
    { label: "tenant-b", treasuryAddress: "0xD66C607072df7dB98A75aEe81fCA4089462c60aB" },
  ];
  for (const t of tenants) {
    try {
      const runtime = await createTenantRuntime(t, provider, signer, log);
      await runTenantCycle(runtime, shared, proofs, log);
      log(`[${t.label}] cycle COMPLETE`);
    } catch (e: any) {
      log(`[${t.label}] ERROR: ${e?.stack ?? e}`);
    }
  }
  log("PROBE_DONE");
}

main().catch((e: any) => {
  console.error("FATAL:", e?.stack ?? e);
  process.exit(1);
});

