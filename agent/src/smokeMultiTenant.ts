import { ethers } from "ethers";
import { config } from "./config.js";
import { loadTenantConfigs, assertAgentRegisteredOrWarn } from "./tenants.js";
import { createTenantRuntime } from "./tenantRunner.js";

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function main() {
  const tenants = await loadTenantConfigs();
  if (!tenants) throw new Error("TENANTS_FILE not set — set it to tenants.json for this smoke test");
  log(`registry: ${tenants.map((t) => t.label).join(", ")}`);

  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const wallet = new ethers.Wallet(config.agentSubmitPrivateKey, provider);
  log(`agent address: ${wallet.address}`);

  for (const t of tenants) {
    const runtime = await createTenantRuntime(t, provider, wallet, log);
    await assertAgentRegisteredOrWarn(provider, t, wallet.address, log);
    const price = await runtime.dexReader.currentPrice();
    log(`[${t.label}] live DEX price for 1 base unit: ${price}`);
  }
  log("SMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
