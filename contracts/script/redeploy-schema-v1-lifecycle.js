// Focused Creditcoin redeployment for the schema-v1 lifecycle + ceiling release.
// Reuses the already deployed validator, adapter, controlled tokens and source observer.
// Deploys only the contracts whose bytecode/bindings must change:
//   1. ControlledDemoFaucet (also acts as the recycling reserve)
//   2. FairWitnessTreasuryFactory (embeds the new FairWitnessTreasury creation bytecode)
// Then configures the faucet to trust exactly that factory and seeds it for a bounded
// number of demo claims.
//
// Preview (default):
//   node script/redeploy-schema-v1-lifecycle.js
// Broadcast:
//   CONTROLLED_DEMO_BROADCAST=true AGENT_SUBMIT_PRIVATE_KEY=... node script/redeploy-schema-v1-lifecycle.js
// Optional:
//   DEMO_FAUCET_CLAIMS=20 CC_RPC=https://... node ...

const fs = require("fs");
const path = require("path");

function resolveEthers() {
  const candidate = path.join(__dirname, "..", "..", "agent", "node_modules", "ethers");
  return fs.existsSync(path.join(candidate, "package.json")) ? require(candidate) : require("ethers");
}
const ethers = resolveEthers();

const ROOT = path.join(__dirname, "..");
const MANIFEST_FILE = path.join(ROOT, "deployments", "controlled-demo-schema-v1.json");
const OUTPUT_FILE = path.join(ROOT, "deployments", "controlled-demo-schema-v1-next.json");
const CHAIN_ID = 102031n;
const FALLBACK_RPC = "https://rpc.cc3-testnet.creditcoin.network";
const WCTC_CLAIM = 100n * 10n ** 18n;
const STABLE_CLAIM = 500n * 10n ** 6n;
const CLAIMS = BigInt(process.env.DEMO_FAUCET_CLAIMS ?? "10");
const WCTC_SEED = WCTC_CLAIM * CLAIMS;
const STABLE_SEED = STABLE_CLAIM * CLAIMS;
const ERC20_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)",
];

function load(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function artifact(contractPath, name) {
  const value = load(path.join(ROOT, "out", contractPath, `${name}.json`));
  return { abi: value.abi, bytecode: value.bytecode.object };
}
function json(value) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
}
async function provider() {
  const rpcs = [process.env.CC_RPC, process.env.CREDITCOIN_RPC_URL, FALLBACK_RPC].filter(Boolean);
  let last;
  for (const rpc of [...new Set(rpcs)]) {
    try {
      const p = new ethers.JsonRpcProvider(rpc, Number(CHAIN_ID), { staticNetwork: true });
      const network = await p.getNetwork();
      if (network.chainId !== CHAIN_ID) throw new Error(`wrong chain ${network.chainId}`);
      await p.getBlockNumber();
      return p;
    } catch (error) { last = error; }
  }
  throw new Error(`all Creditcoin RPC endpoints failed: ${last?.message || last}`);
}
async function wait(tx, label) {
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}
async function deploy(wallet, contractPath, name, args) {
  const item = artifact(contractPath, name);
  const contract = await new ethers.ContractFactory(item.abi, item.bytecode, wallet).deploy(...args);
  const receipt = await wait(contract.deploymentTransaction(), `deploy ${name}`);
  return { contract, receipt };
}

async function main() {
  if (!fs.existsSync(MANIFEST_FILE)) throw new Error(`missing ${MANIFEST_FILE}`);
  const current = load(MANIFEST_FILE);
  const validator = current.destination?.validator;
  const adapter = current.destination?.adapter;
  const wctc = current.destination?.wctc;
  const stable = current.destination?.stable;
  if (![validator, adapter, wctc, stable].every(ethers.isAddress)) {
    throw new Error("current schema-v1 manifest is missing validator/adapter/wctc/stable addresses");
  }

  const p = await provider();
  const broadcast = process.env.CONTROLLED_DEMO_BROADCAST === "true";
  const preview = {
    mode: broadcast ? "BROADCAST" : "PREVIEW_ONLY",
    chainId: CHAIN_ID,
    reuses: { validator, adapter, wctc, stable, sourceObserver: current.source?.observer },
    deploys: ["ControlledDemoFaucet", "FairWitnessTreasuryFactory"],
    faucetClaim: { fwWCTC: WCTC_CLAIM, fwUSD: STABLE_CLAIM },
    faucetSeed: { claims: CLAIMS, fwWCTC: WCTC_SEED, fwUSD: STABLE_SEED },
    closeBehavior: "demo treasury close returns remaining fwWCTC/fwUSD directly to the new faucet reserve",
  };
  console.log(json(preview));
  if (!broadcast) return;

  const key = process.env.AGENT_SUBMIT_PRIVATE_KEY;
  if (!key) throw new Error("AGENT_SUBMIT_PRIVATE_KEY is required only for broadcast");
  const wallet = new ethers.Wallet(key, p);
  const wctcToken = new ethers.Contract(wctc, ERC20_ABI, wallet);
  const stableToken = new ethers.Contract(stable, ERC20_ABI, wallet);
  const [wctcBalance, stableBalance] = await Promise.all([
    wctcToken.balanceOf(wallet.address), stableToken.balanceOf(wallet.address),
  ]);
  if (wctcBalance < WCTC_SEED || stableBalance < STABLE_SEED) {
    throw new Error(
      `deployer lacks demo assets to seed ${CLAIMS} claims; ` +
      `need ${WCTC_SEED} fwWCTC units and ${STABLE_SEED} fwUSD units, ` +
      `have ${wctcBalance} and ${stableBalance}. Lower DEMO_FAUCET_CLAIMS if necessary.`
    );
  }

  // Faucet must be first: its address is the immutable demo reserve embedded in the factory.
  const faucetDeployment = await deploy(
    wallet,
    "ControlledDemoFaucet.sol",
    "ControlledDemoFaucet",
    [wctc, stable, WCTC_CLAIM, STABLE_CLAIM],
  );
  const faucet = faucetDeployment.contract;
  const faucetAddress = await faucet.getAddress();

  const factoryDeployment = await deploy(
    wallet,
    "FairWitnessTreasuryFactory.sol",
    "FairWitnessTreasuryFactory",
    [validator, adapter, faucetAddress],
  );
  const factory = factoryDeployment.contract;
  const factoryAddress = await factory.getAddress();

  await wait(await faucet.configureFactory(factoryAddress), "configure faucet factory");
  await wait(await wctcToken.transfer(faucetAddress, WCTC_SEED), "seed faucet fwWCTC");
  await wait(await stableToken.transfer(faucetAddress, STABLE_SEED), "seed faucet fwUSD");

  const [configured, configuredFactory, demoReserve, faucetWctc, faucetStable] = await Promise.all([
    faucet.factoryConfigured(),
    faucet.FACTORY(),
    factory.DEMO_RESERVE(),
    wctcToken.balanceOf(faucetAddress),
    stableToken.balanceOf(faucetAddress),
  ]);
  if (!configured || configuredFactory.toLowerCase() !== factoryAddress.toLowerCase()) {
    throw new Error("faucet factory readback failed");
  }
  if (demoReserve.toLowerCase() !== faucetAddress.toLowerCase()) {
    throw new Error("factory demo reserve readback failed");
  }

  const output = {
    generatedAt: new Date().toISOString(),
    chainId: CHAIN_ID,
    previous: {
      factory: current.destination?.factory ?? null,
      faucet: current.destination?.faucet ?? null,
      factoryDeploymentBlock: current.destination?.factoryDeploymentBlock ?? null,
    },
    destination: {
      validator,
      adapter,
      wctc,
      stable,
      factory: factoryAddress,
      factoryDeploymentBlock: factoryDeployment.receipt.blockNumber,
      faucet: faucetAddress,
      demoReserve: faucetAddress,
      faucetBalance: { fwWCTC: faucetWctc, fwUSD: faucetStable },
    },
    environmentUpdates: {
      FACTORY_ADDRESS: factoryAddress,
      FACTORY_DEPLOYMENT_BLOCK: String(factoryDeployment.receipt.blockNumber),
      VITE_FACTORY_ADDRESS: factoryAddress,
      VITE_FACTORY_DEPLOYMENT_BLOCK: String(factoryDeployment.receipt.blockNumber),
      VITE_CONTROLLED_DEMO_FAUCET: faucetAddress,
    },
  };
  fs.writeFileSync(OUTPUT_FILE, `${json(output)}\n`);
  console.log(`\nWrote ${OUTPUT_FILE}`);
  console.log("\nUpdate Railway and Vercel with the values in environmentUpdates, then redeploy both services.");
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exitCode = 1;
});
