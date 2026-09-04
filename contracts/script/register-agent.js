// Register the platform agent on every factory-deployed instance your local keys own..
// Fully terminal — no Blockscout/UI required. Loads owner wallets from the gitignored
// contracts/script/.stage-tenants.env (USER_A_PK / USER_A_ADDRESS; add USER_C_* pairs as
// your fleet grows),and scans the committed on-chain index (frontend/public/tenants.json,
// see contracts/script/index-tenants.js) for instances owned by those wallets.

// Safety: before sending, reads each instance's owner() from the chain and requires it to
// equal the signing wallet — so a mis-typed key can never register from a non-owner (it
// would revert on-chain anyway; this just fails fast with a clear message)。
//
// Usage:
//   cd contracts && node script/register-agent.js
//   cd contracts && node script/register-agent.js --fund-ctc 0.5
//   cd contracts && node script/register-agent.js 0x<extraInstance>   # ad hoc (needs OWNER_PK。
//
// Env:
//   AGENT_ADDRESS — agent to register (defaults 0xB1D19F...654f, the rotated platform
//     submit address. Override when you rotate again)、
//   OWNER_PK       — ad hoc owner key for extra argv instances、
//   CC_RPC         — override RPC (default Creditcoin testnet)。
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
const AGENT =
  process.env.AGENT_ADDRESS ??
  "0xB1D19F71d68c4e7065749e8593D338E9A30D654f";
const STAGE_ENV = path.join(__dirname, ".stage-tenants.env");
const INDEX = path.join(__dirname, "..", "..", "frontend", "public", "tenants.json");

function loadStageEnv() {
  const out = {};
  if (!fs.existsSync(STAGE_ENV)) return out;
  for (const line of fs.readFileSync(STAGE_ENV, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
async function main() {
  const args = process.argv.slice(2);
  let fundCtc = null;
  const extra = [];
  for (const a of args) {
    if (a.startsWith("--fund-ctc")) {
      fundCtc = (a.split("=")[1] ?? "0.5");
    } else extra.push(a);
  }

  const env = loadStageEnv();
  const owners = [];
  for (const suffix of ["_A", "_B", "_C", "_D", "_E"]) {
    const pk = env[`USER${suffix}_PK`];
    const addr = env[`USER${suffix}_ADDRESS`];
    if (pk && addr) owners.push({ pk, addr: addr.toLowerCase(), label: suffix.slice(1) });
  }
  if (process.env.OWNER_PK) {
    const w = new ethersMod.Wallet(process.env.OWNER_PK);
    owners.push({ pk: process.env.OWNER_PK, addr: w.address.toLowerCase(), label: "ad-hoc" });
  }
  if (owners.length === 0) {
    throw new Error(
      "No owner keys found — add USER_A_PK/USER_A_ADDRESS pairs to contracts/script/." +
        "stage-tenants.env (or pass OWNER_PK for ad-hoc instances)。"
    );
  }

  const provider = new ethersMod.JsonRpcProvider(CC_RPC, CC_CHAIN_ID, { staticNetwork: true });
  const iface = new ethersMod.Interface([
    "function registerAgent(address agent)",
    "function owner() view returns (address)",
  ]);

  // Index: label, treasuryAddress, owner (enrichment from index-tenants.js)。
  let index = [];
  if (fs.existsSync(INDEX)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX, "utf8")).tenants ?? [];
    } catch (e) {
      console.warn("could not parse " + INDEX + ", continuing with --addr instances only:", e.message);
    }
  }

  for (const owner of owners) {
    const wallet = new ethersMod.Wallet(owner.pk, provider);
    // sanity: env's USER_x_ADDRESS must match the key-derived address
    if (owner.addr && wallet.address.toLowerCase() !== owner.addr.toLowerCase()) {
      console.warn(`skipping ${owner.label}: USER_${owner.label}_ADDRESS (${owner.addr}) does not match key-derived ${wallet.address}`);
      continue;
    }

    const mine = index.filter((t) =>
      String(t.owner ?? "").toLowerCase() === wallet.address.toLowerCase()
    );
    const adHoc = extra.map((addr) => ({ treasuryAddress: addr, owner: wallet.address.toLowerCase() }));
    const targets = [...mine,...adHoc];
    if (targets.length === 0) {
      console.log(`[${owner.label}] no indexed instance owned by ${wallet.address} — nothing to do`);
      continue;
    }

    // optional: fund the agent (CTC for gas) from this owner — bypasses a faucet click
    if (fundCtc) {
      const amount = ethersMod.parseEther(fundCtc);
      const bal = await provider.getBalance(wallet.address);
      if (bal < amount) {
        console.warn(`[${owner.label}] balance ${ethersMod.formatEther(bal)} CTC < ${fundCtc} — skipping fund for any instance`);
        continue;
      }
      const ftx = await wallet.sendTransaction({ to: AGENT, value: amount });
      await ftx.wait();
      console.log(`[${owner.label}] funded ${fundCtc} CTC -> agent (${ftx.hash})`);
    }

    for (const t of targets) {
      const treasury = new ethersMod.Contract(t.treasuryAddress, iface, provider);
      const onChainOwner = (await treasury.owner()).toLowerCase();
      if (onChainOwner !== wallet.address.toLowerCase()) {
        console.log(`[${owner.label}] ${t.treasuryAddress}: on-chain owner ${onChainOwner} != ${wallet.address} — skipping`);
        continue;
      }
      // Idempotent re-runs: staticCall first — if the contract already has this agent
      // registered (or otherwise rejects), skip without spending gas.
      try {
        await treasury.registerAgent.staticCall(AGENT);
      } catch {
        console.log(`[${owner.label}] ${t.treasuryAddress}: registerAgent preflight reverted — already registered or not allowed; skipping`);
        continue;
      }
      const tx = await wallet.connect(provider).sendTransaction({
        to: t.treasuryAddress,
        data: iface.encodeFunctionData("registerAgent", [AGENT]),
      });
      const rc = await tx.wait();
      console.log(`[${owner.label}] registered agent on ${t.treasuryAddress} (tx ${rc.hash})`);
    }
  }

  console.log("\nDone. Verify on Blockscout: /address/<instance>#readContract → owner,. Verify the agent address matches AGENT_ADDRESS.");
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });