import { ethers } from "ethers";
import { config } from "./config.js";
import { SepoliaWatcher } from "./sepoliaWatcher.js";
import { AttestcoinClient } from "./attestcoinClient.js";
import { DecisionEngine } from "./decisionEngine.js";
import { ReasoningStore } from "./reasoningStore.js";
import { resolveTreasuryAddress } from "./treasuryGuardrails.js";
import { loadTenantConfigs, assertAgentRegisteredOrWarn, type TenantConfig } from "./tenants.js";
import {
  createTenantRuntime,
  buildCycleProofs,
  runTenantCycle,
  type SharedDeps,
  type TenantRuntime,
} from "./tenantRunner.js";

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

/**
 * Resolves the tenant roster. Two modes:
 *  - MULTI-TENANT: TENANTS_FILE points at a JSON registry of instances → one agent
 *    process polls every tenant, submitting proofs per user against THAT user's contract
 *    (docs/ARCHITECTURE_V2.md §3.1 "Multi-tenant agent service").
 *  - SINGLE-TENANT (V1 runbook, unchanged): TREASURY_ADDRESS (+ optional TENANT_ID).
 */
async function resolveTenantRoster(): Promise<TenantConfig[]> {
  const tenants = await loadTenantConfigs();
  if (tenants) {
    log(`Tenant registry loaded (${tenants.length} tenant(s)) — multi-tenant mode.`);
    return tenants;
  }
  const address = await resolveTreasuryAddress(process.env.TENANT_ID);
  log(`Single-tenant mode: ${address}${process.env.TENANT_ID ? ` (tenant: ${process.env.TENANT_ID})` : ""}`);
  return [
    {
      label: process.env.TENANT_ID ?? "default",
      treasuryAddress: ethers.getAddress(address),
    },
  ];
}

async function main() {
  log("Starting agent runner (no funds held — see DEVLOG.md custody-separation notes)");

  const watcher = new SepoliaWatcher();
  const attestcoin = new AttestcoinClient();
  const decisionEngine = new DecisionEngine();
  const reasoningStore = new ReasoningStore();
  const shared: SharedDeps = { watcher, attestcoin, decisionEngine, reasoningStore };

  const creditcoinProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const signer = attestcoin.signer;

  log(`Agent submit address: ${attestcoin.submitterAddress} (must hold zero token balance — verify manually before going live)`);
  await attestcoin.assertSourceChainSupported();
  log(`Source chain key ${config.sourceChainKey} confirmed supported.`);

  // Build each tenant's runtime sequentially (chain reads), with a per-tenant
  // registration check — registration is per-instance, so being registered on Tenant A's
  // instance grants nothing on Tenant B's. A missing registration is a loud warning, not
  // fatal: the owner may register later, and submissions would revert clearly.
  const roster = await resolveTenantRoster();
  const runtimes: TenantRuntime[] = [];
  for (const tenantConfig of roster) {
    const runtime = await createTenantRuntime(tenantConfig, creditcoinProvider, signer, log);
    await assertAgentRegisteredOrWarn(creditcoinProvider, tenantConfig, attestcoin.submitterAddress, log);
    runtimes.push(runtime);
  }
  log(`${runtimes.length} tenant runtime(s) ready.`);

  log(`Entering poll loop (interval ${config.pollIntervalMs}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Fact-scoped work ONCE per cycle (source poll → attestations → both proofs), then
      // the per-tenant half sequentially: one tenant's failure must never abort the
      // others' evaluation, and the loop must survive a whole cycle throwing.
      const proofs = await buildCycleProofs(shared, runtimes[0]?.dexReader, log);
      if (proofs) {
        for (const runtime of runtimes) {
          try {
            await runTenantCycle(runtime, shared, proofs, log);
          } catch (err) {
            log(`[${runtime.config.label}] tenant cycle failed (other tenants unaffected): ${err}`);
          }
        }
      }
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
