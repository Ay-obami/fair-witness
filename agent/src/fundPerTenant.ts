import { ethers } from "ethers";
import { config } from "./config.js";
import { loadTenantConfigs } from "./tenants.js";

/**
 * Tenant lifecycle "Fund" step (arch §4 stage 3): each tenant OWNER funds THEIR OWN
 * instance with BASE_ASSET. The instance holds the funds; neither the platform, the
 * factory, nor the agent ever holds them. There is deliberately no admin withdraw on the
 * instance — funding is a plain ERC20 transfer to the instance address.
 *
 * Reads FUND_AMOUNT (base units, 6dp; default 1_000_000_000 = 1,000 USDC).
 * Usage: OWNER_PK=0x... TENANTS_FILE=tenants.json npx tsx src/fundPerTenant.ts
 */
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

const ABI = [
  "function mint(address to, uint256 amount)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
];

async function main() {
  const ownerPk = process.env.OWNER_PK;
  if (!ownerPk) throw new Error("Set OWNER_PK to the TENANT OWNER's key");
  const amount = BigInt(process.env.FUND_AMOUNT ?? "1000000000");

  const tenants = await loadTenantConfigs();
  if (!tenants) throw new Error("TENANTS_FILE not set");
  const only = process.env.TENANT_LABEL;
  const targets = only ? tenants.filter((t) => t.label === only) : tenants;
  if (targets.length === 0) throw new Error(`No tenant with label "${only}" in the registry`);

  const provider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const owner = new ethers.Wallet(ownerPk, provider);

  for (const t of targets) {
    // Read BASE_ASSET from the instance itself — never from env — so the funding target
    // token can't drift from the token the instance actually trades.
    const treasuryReadOnly = new ethers.Contract(
      t.treasuryAddress,
      ["function BASE_ASSET() view returns (address)"],
      provider
    );
    const baseAddress = await treasuryReadOnly.BASE_ASSET();
    const base = new ethers.Contract(baseAddress, ABI, owner);
    const symbol = await base.symbol();

    const before = await base.balanceOf(t.treasuryAddress);
    if (before >= amount) {
      log(`[${t.label}] instance already holds ${before} ${symbol} — no-op`);
      continue;
    }
    const mintTo = amount - before;
    const m = await base.mint(owner.address, mintTo);
    await m.wait();
    log(`[${t.label}] minted ${mintTo} ${symbol} to owner`);
    const tx = await base.transfer(t.treasuryAddress, amount);
    const receipt = await tx.wait();
    const after = await base.balanceOf(t.treasuryAddress);
    log(`[${t.label}] funded: instance now holds ${after} ${symbol}. tx=${receipt.hash} block=${receipt.blockNumber}`);
  }
  log("FUNDING DONE");
}

main().catch((e) => {
  console.error("FUNDING FAILED:", e);
  process.exit(1);
});
