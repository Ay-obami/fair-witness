// Deploy the V2 factory + two independent demo instances to Creditcoin testnet.
//
// Usage:
//   cd contracts && node script/deploy-factory.js
//
// Env (never commit secrets):
//   DEPLOYER_PK   — gas-payer wallet (any funded key; factory deployer has no post-deploy power)
//   USER_A_PK     — tenant A wallet (owns instance A)
//   USER_B_PK     — tenant B wallet (owns instance B)
//
// Optional env overrides for the canonical chain config (defaults = the V1 live addresses):
//   VERIFIER_ADDRESS, DEX_ROUTER_ADDRESS, BASE_ASSET_ADDRESS, QUOTE_ASSET_ADDRESS,
//   PRICE_CONTRACT_ADDRESS, CC_RPC
//
// NOTE: the RPC node is unreliable about ethers' automatic network detection, so the
// provider is pinned to the Creditcoin testnet chain id with staticNetwork:true (see
// DEVLOG.md stage 1, "Pitfall: ethers auto network detection").
const fs = require("fs");
const path = require("path");

function resolveEthers() {
  // Resolve `ethers` from this repo's node_modules locations before falling back to a
  // bare require (which works if NODE_PATH points at agent/node_modules, the way the
  // original deploy-creditcoin.js was run). Note: this script lives in contracts/script/,
  // so the repo root is two levels up.
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

// Canonical chain config — the DeFi infrastructure the single-tenant V1 system was
// verified against. Every factory-deployed instance is bound to these same addresses.
const VERIFIER = process.env.VERIFIER_ADDRESS ?? "0x0000000000000000000000000000000000000FD2"; // Attestcoin precompile
const DEX_ROUTER = process.env.DEX_ROUTER_ADDRESS ?? "0x8D40f9D47886f21223357874e1a99a22DD4f9E5e"; // V1 MockDexRouter (seeded 1M:1M)
const BASE_ASSET = process.env.BASE_ASSET_ADDRESS ?? "0x0bFA6eF009f8739c727b292849029608bd6b115A"; // V1 USDC-like
const QUOTE_ASSET = process.env.QUOTE_ASSET_ADDRESS ?? "0x6A97b1913Bca9d17A57cAae1F6b5C1885bE1DAA1"; // V1 MQT
const PRICE_CONTRACT =
  process.env.PRICE_CONTRACT_ADDRESS ?? "0x23433fcA0f35CC5e801b6888293B2B11017900c7"; // Sepolia source

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const basePath = path.join(__dirname, "..");

async function deployContract(name, jsonFile, args, wallet) {
  const art = JSON.parse(fs.readFileSync(path.join(basePath, jsonFile), "utf8"));
  const factory = new ethersMod.ContractFactory(art.abi, art.bytecode, wallet);
  console.log(`  Deploying ${name}...`);
  const c = await factory.deploy(...args);
  const tx = c.deploymentTransaction();
  const receipt = await tx.wait();
  const addr = await c.getAddress();
  console.log(`  ${name} => ${addr}`);
  console.log(`    tx ${receipt.hash} block ${receipt.blockNumber}`);
  return addr;
}

function guardrails(maxTradeSize, maxSlippageBps, minArbWidthBps, maxDriftBps, maxConfirmGapBlocks, maxActionsPerEpoch, epochLength) {
  return {
    maxTradeSize: BigInt(maxTradeSize),
    maxSlippageBps: BigInt(maxSlippageBps),
    minArbWidthBps: BigInt(minArbWidthBps),
    maxDriftBps: BigInt(maxDriftBps),
    maxConfirmGapBlocks: BigInt(maxConfirmGapBlocks),
    maxActionsPerEpoch: BigInt(maxActionsPerEpoch),
    epochLength: BigInt(epochLength),
  };
}

const GUARDRAILS_A = guardrails(5_000_000, 150, 80, 100, 20, 6, 86400); // default / V1-classic profile
const GUARDRAILS_B = guardrails(10_000_000, 200, 120, 150, 30, 3, 86400); // tightened: fewer trades, bigger caps
async function main() {
  const provider = new ethersMod.JsonRpcProvider(CC_RPC, CC_CHAIN_ID, { staticNetwork: true });
  const deployer = new ethersMod.Wallet(requireEnv("DEPLOYER_PK"), provider);
  const userA = new ethersMod.Wallet(requireEnv("USER_A_PK"), provider);
  const userB = new ethersMod.Wallet(requireEnv("USER_B_PK"), provider);

  console.log("Deployer:", deployer.address, "bal:", ethersMod.formatEther(await provider.getBalance(deployer.address)), "CTC");
  console.log("Tenant A:", userA.address, "bal:", ethersMod.formatEther(await provider.getBalance(userA.address)), "CTC");
  console.log("Tenant B:", userB.address, "bal:", ethersMod.formatEther(await provider.getBalance(userB.address)), "CTC");
  console.log("Chain config: verifier=%s dex=%s base=%s quote=%s priceSource=%s\n", VERIFIER, DEX_ROUTER, BASE_ASSET, QUOTE_ASSET, PRICE_CONTRACT);

  // 1. Deploy the factory (permissionless — deployer has no post-deployment power), or
  // reuse an existing one via FACTORY_ADDRESS (idempotent re-runs).
  const factoryAddr =
    process.env.FACTORY_ADDRESS ??
    (await deployContract(
      "ASCTreasuryFactory",
      "out/ASCTreasuryFactory.sol/ASCTreasuryFactory.json",
      [VERIFIER, DEX_ROUTER, BASE_ASSET, QUOTE_ASSET, PRICE_CONTRACT],
      deployer
    ));

  // 2. Give each tenant a little CTC so stage-2+ sign-ups can pay their own gas.
  const GAS_STAKE = ethersMod.parseEther("0.5");
  for (const [name, w] of [["A", userA], ["B", userB]]) {
    const bal = await provider.getBalance(w.address);
    if (bal < GAS_STAKE) {
      const tx = await deployer.sendTransaction({ to: w.address, value: GAS_STAKE });
      await tx.wait();
      console.log(`  funded tenant ${name} with 0.5 CTC (tx ${tx.hash})`);
    } else {
      console.log(`  tenant ${name} already funded (${ethersMod.formatEther(bal)} CTC)`);
    }
  }

  // 3. Two independent instances through the factory, different guardrails.
  const factoryAbi = JSON.parse(
    fs.readFileSync(path.join(basePath, "out/ASCTreasuryFactory.sol/ASCTreasuryFactory.json"), "utf8")
  );
  const factory = new ethersMod.Contract(factoryAddr, factoryAbi.abi, deployer);

  async function createInstance(label, owner, g) {
    console.log(`\nCreating instance for ${label} (owner ${owner})...`);
    const tx = await factory.createTreasury(owner, g, { gasLimit: 5_000_000 });
    const receipt = await tx.wait();
    let instance = "";
    for (const log of receipt.logs) {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === "TreasuryDeployed") {
        instance = parsed.args.treasury;
        console.log(`  event TreasuryDeployed: instance=${instance} owner=${parsed.args.owner}`);
      }
    }
    if (!instance) throw new Error(`TreasuryDeployed event not found in tx for ${label}`);
    console.log(`  tx ${receipt.hash} block ${receipt.blockNumber}`);
    return instance;
  }

  const instanceA = await createInstance("Tenant A", userA.address, GUARDRAILS_A);
  const instanceB = await createInstance("Tenant B", userB.address, GUARDRAILS_B);

  // 4. Independent on-chain verification of the guardrails carried by each instance.
  const treasuryAbi = JSON.parse(
    fs.readFileSync(path.join(basePath, "out/ASCTreasuryJournal.sol/ASCTreasuryJournal.json"), "utf8")
  );
  const readInstance = async (label, addr, expectedOwner, expected) => {
    const t = new ethersMod.Contract(addr, treasuryAbi.abi, provider);
    const got = {
      owner: await t.owner(),
      maxTradeSize: (await t.MAX_TRADE_SIZE()).toString(),
      maxSlippageBps: (await t.MAX_SLIPPAGE_BPS()).toString(),
      minArbWidthBps: (await t.MIN_ARB_WIDTH_BPS()).toString(),
      maxDriftBps: (await t.MAX_DRIFT_BPS()).toString(),
      maxConfirmGapBlocks: (await t.MAX_CONFIRM_GAP_BLOCKS()).toString(),
      maxActionsPerEpoch: (await t.MAX_ACTIONS_PER_EPOCH()).toString(),
      epochLength: (await t.EPOCH_LENGTH()).toString(),
      journalLength: (await t.journalLength()).toString(),
    };
    console.log(`\n  ${label} on-chain reads (${addr}):`);
    console.log(`    ${JSON.stringify(got, null, 4)}`);
    const match =
      got.owner.toLowerCase() === expectedOwner.toLowerCase() &&
      got.maxTradeSize === expected.maxTradeSize.toString() &&
      got.maxSlippageBps === expected.maxSlippageBps.toString() &&
      got.minArbWidthBps === expected.minArbWidthBps.toString() &&
      got.maxDriftBps === expected.maxDriftBps.toString() &&
      got.maxConfirmGapBlocks === expected.maxConfirmGapBlocks.toString() &&
      got.maxActionsPerEpoch === expected.maxActionsPerEpoch.toString() &&
      got.epochLength === expected.epochLength.toString();
    if (!match) throw new Error(`on-chain guardrail mismatch for ${label}`);
    console.log(`    => guardrails + owner verified on-chain\n`);
  };

  await readInstance("Tenant A", instanceA, userA.address, GUARDRAILS_A);
  await readInstance("Tenant B", instanceB, userB.address, GUARDRAILS_B);

  console.log("=== DEPLOY MANIFEST (Creditcoin testnet, chainId 102031) ===");
  console.log(`factory:    ${factoryAddr}`);
  console.log(`instanceA:  ${instanceA}  (owner ${userA.address})`);
  console.log(`instanceB:  ${instanceB}  (owner ${userB.address})`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});