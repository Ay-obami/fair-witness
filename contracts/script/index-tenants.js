// Index tenants from on-chain `TreasuryDeployed` events — the honest enumeration path.
//
// The factory is deliberately registry-free (docs/ARCHITECTURE_V2.md §2 + §3.3: adding a
// tenant list would be mutable shared state — forbidden). So the source of truth for
// "which instances exist" is the factory's own event log. This script scans that log and
// regenerates the agent's tenant registry (`tenants.json` schema) + an enriched table
// (owner + all seven immutable guardrails as emitted in each event).
//
// Usage:
//   cd contracts && node script/index-tenants.js
//
// Env (optional):
//   FACTORY_ADDRESS  — ASCTreasuryFactory instance (default 0x97c8…7f2, the stage-1 deploy)
//   FROM_BLOCK       — first block to scan (default 5411764, the factory deployment block)
//   CC_RPC           — RPC URL (default Creditcoin testnet)
//   OUT_FILE         — where to write the registry JSON (default contracts/out/tenants.scanned.json)
//
// Output JSON matches agent/src/tenants.ts's expected shape:
//   { "tenants": [ { "label": "tenant-1", "treasuryAddress": "0x…", "owner": "0x…" }, … ] }
// (label + treasuryAddress are what the agent reads; `owner` is enrichment and is
// ignored by parseTenantsJson -> harmless.)
const fs = require("fs");
const path = require("path");

function resolveEthers() {
  const candidates = [
    path.join(__dirname, "..", "..", "agent", "node_modules", "ethers"),
    path.join(__dirname, "..", "..", "node_modules", "ethers"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return require(c);
  }
  return require("ethers");
}

const ethersMod = resolveEthers();

const CC_RPC = process.env.CC_RPC ?? "https://rpc.cc3-testnet.creditcoin.network";
const CC_CHAIN_ID = 102031;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS ?? "0x97c81D68BbCDb1A673b61176d60F071963Abe7f2";
const FROM_BLOCK = Number(process.env.FROM_BLOCK ?? "5411764");
const OUT_FILE = process.env.OUT_FILE ?? path.join(__dirname, "..", "out", "tenants.scanned.json");

const basePath = path.join(__dirname, "..");

async function main() {
  const provider = new ethersMod.JsonRpcProvider(CC_RPC, CC_CHAIN_ID, { staticNetwork: true });
  const art = JSON.parse(
    fs.readFileSync(path.join(basePath, "out", "ASCTreasuryFactory.sol", "ASCTreasuryFactory.json"), "utf8")
  );
  const iface = new ethersMod.Interface(art.abi);

  const eventTopic = iface.getEvent("TreasuryDeployed").topicHash;
  console.log(`Scanning TreasuryDeployed events on ${FACTORY_ADDRESS} from block ${FROM_BLOCK}…`);

  const logs = await provider.getLogs({
    address: FACTORY_ADDRESS,
    topics: [eventTopic],
    fromBlock: FROM_BLOCK,
    toBlock: "latest",
  });
  console.log(`Found ${logs.length} instance deployment(s).\n`);

  const tenants = [];
  for (const [i, log] of logs.entries()) {
    const parsed = iface.parseLog(log);
    const t = {
      label: `tenant-${i + 1}`,
      treasuryAddress: parsed.args.treasury,
      owner: parsed.args.owner,
      guardrails: {
        maxTradeSize: parsed.args.maxTradeSize.toString(),
        maxSlippageBps: parsed.args.maxSlippageBps.toString(),
        minArbWidthBps: parsed.args.minArbWidthBps.toString(),
        maxDriftBps: parsed.args.maxDriftBps.toString(),
        maxConfirmGapBlocks: parsed.args.maxConfirmGapBlocks.toString(),
        maxActionsPerEpoch: parsed.args.maxActionsPerEpoch.toString(),
        epochLength: parsed.args.epochLength.toString(),
      },
    };
    tenants.push(t);
    console.log(`#${i + 1} ${t.label}`);
    console.log(`  treasury   ${t.treasuryAddress}`);
    console.log(`  owner      ${t.owner}`);
    console.log(
      `  guardrails maxTradeSize=${t.guardrails.maxTradeSize} slippage=${t.guardrails.maxSlippageBps}bps ` +
        `width=${t.guardrails.minArbWidthBps}bps drift=${t.guardrails.maxDriftBps}bps ` +
        `gap=${t.guardrails.maxConfirmGapBlocks} blocks rate=${t.guardrails.maxActionsPerEpoch}/${t.guardrails.epochLength}s`
    );
    console.log(`  deploy tx  ${log.transactionHash} (block ${log.blockNumber})\n`);
  }

  // The agent's tenants.ts expects `{ tenants: [...] }` — write exactly that (owner is
  // extra, ignored by parseTenantsJson).
  const registry = { tenants: tenants.map(({ label, treasuryAddress, owner }) => ({ label, treasuryAddress, owner })) };
  await fs.promises.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.promises.writeFile(OUT_FILE, JSON.stringify(registry, null, 2) + "\n", "utf8");
  console.log(`Agent-compatible registry written to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("INDEX FAILED:", err);
  process.exit(1);
});