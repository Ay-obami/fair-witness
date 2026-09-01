import { ethers } from "ethers";
import { config } from "./config.js";
import { loadTenantConfigs } from "./tenants.js";

/**
 * Per-tenant onboarding step (arch §4 stage 3→4): EACH tenant's OWNER registers the
 * platform agent submit address on THEIR OWN instance. Registration is per-instance, so
 * this must be run once per tenant, signed by that tenant's owner key.
 *
 * Usage: OWNER_PK=0x... TENANTS_FILE=tenants.json npx tsx src/registerAgentPerTenant.ts
 * (or per-tenant: OWNER_PK + TENANT_LABEL to register on just one instance)
 */
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

const OWNER_ABI = [
  "function registerAgent(address agent)",
  "function registeredAgents(address) view returns (bool)",
  "function owner() view returns (address)",
];

async function main() {
  const ownerPk = process.env.OWNER_PK;
  if (!ownerPk) throw new Error("Set OWNER_PK to the TENANT OWNER's key (never the agent key)");

  const tenants = await loadTenantConfigs();
  if (!tenants) throw new Error("TENANTS_FILE not set");
  const only = process.env.TENANT_LABEL;
  const targets = only ? tenants.filter((t) => t.label === only) : tenants;
  if (targets.length === 0) throw new Error(`No tenant with label "${only}" in the registry`);

  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const owner = new ethers.Wallet(ownerPk, provider);
  const agentAddress = new ethers.Wallet(config.agentSubmitPrivateKey).address;
  log(`owner=${owner.address} registering agent=${agentAddress}`);

  for (const t of targets) {
    const c = new ethers.Contract(t.treasuryAddress, OWNER_ABI, owner);
    const instanceOwner = await c.owner();
    if (instanceOwner.toLowerCase() !== owner.address.toLowerCase()) {
      throw new Error(
        `[${t.label}] key ${owner.address} is NOT the owner of ${t.treasuryAddress} (owner is ${instanceOwner}) — refusing`
      );
    }
    const already = await c.registeredAgents(agentAddress);
    if (already) {
      log(`[${t.label}] agent already registered — no-op`);
      continue;
    }
    const tx = await c.registerAgent(agentAddress);
    const receipt = await tx.wait();
    log(`[${t.label}] registered. tx=${receipt.hash} block=${receipt.blockNumber}`);
  }
  log("REGISTRATION DONE");
}

main().catch((e) => {
  console.error("REGISTRATION FAILED:", e);
  process.exit(1);
});
