// Additive schema-v1 deployment bound to the controlled public-testnet markets.
// Preview is default. Broadcast requires CONTROLLED_DEMO_BROADCAST=true.
// Run: node script/deploy-controlled-schema-v1.js sepolia|creditcoin
const fs = require("fs");
const path = require("path");

function resolveEthers() {
  const candidate = path.join(__dirname, "..", "..", "agent", "node_modules", "ethers");
  return fs.existsSync(path.join(candidate, "package.json")) ? require(candidate) : require("ethers");
}
const ethers = resolveEthers();

const LABEL = "Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.";
const DEPLOYER = "0xB1D19F71d68c4e7065749e8593D338E9A30D654f";
const OWNER = "0xF40003d36567478489BcCF1a1fEd094f87EeC9a5";
const ROOT = path.join(__dirname, "..");
const SOURCE_FILE = path.join(ROOT, "deployments", "controlled-demo-sepolia.json");
const DESTINATION_FILE = path.join(ROOT, "deployments", "controlled-demo-creditcoin.json");
const OUTPUT_FILE = path.join(ROOT, "deployments", "controlled-demo-schema-v1.json");

const CHAINS = {
  sepolia: { chainId: 11155111n, rpcs: [process.env.SEPOLIA_RPC_URL, "https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia", "https://gateway.tenderly.co/public/sepolia"] },
  creditcoin: { chainId: 102031n, rpcs: [process.env.CC_RPC, process.env.CREDITCOIN_RPC_URL, "https://rpc.cc3-testnet.creditcoin.network"] },
};

const POLICY = Object.freeze({
  universal: [7, 100n * 10n ** 6n, 300, 500, 500, 10n ** 15n, 10n ** 15n, 10, 3600, 50],
  arbitrage: [100, 100n * 10n ** 6n],
  rebalance: [4000, 500, 100n * 10n ** 6n],
  risk: [6000, 50n * 10n ** 6n, 200n * 10n ** 6n],
});

const ERC20_ABI = ["function transfer(address,uint256) returns (bool)"];
const OBSERVER_READ_ABI = ["function currentObservation() view returns (uint160,int24,uint16,uint128,bool,uint256)"];
const ADAPTER_READ_ABI = ["function marketState() view returns (uint256,int24,uint256,uint128)"];
const TREASURY_READ_ABI = [
  "function owner() view returns (address)", "function automationMode() view returns (uint8)",
  "function currentPolicyHash() view returns (bytes32)", "function registeredAgents(address) view returns (bool)",
];

function load(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function artifact(contractPath, name) {
  const value = load(path.join(ROOT, "out", contractPath, `${name}.json`));
  return { abi: value.abi, bytecode: value.bytecode.object };
}
function json(value) { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2); }
async function selectProvider(config) {
  let lastError;
  for (const rpc of config.rpcs.filter((value, index, all) => value && all.indexOf(value) === index)) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, Number(config.chainId), { staticNetwork: true });
      if ((await provider.getNetwork()).chainId !== config.chainId) throw new Error("chain mismatch");
      await provider.getBlockNumber();
      return provider;
    } catch (error) { lastError = error; }
  }
  throw new Error(`all RPC endpoints failed: ${lastError?.message || lastError}`);
}
async function receipt(tx, action, records) {
  const value = await tx.wait();
  if (value.status !== 1) throw new Error(`${action} reverted`);
  records.push({ action, transactionHash: value.hash, blockNumber: value.blockNumber });
  return value;
}
async function deploy(wallet, contractPath, name, args, records) {
  const item = artifact(contractPath, name);
  const contract = await new ethers.ContractFactory(item.abi, item.bytecode, wallet).deploy(...args);
  await receipt(contract.deploymentTransaction(), `deploy-${name}`, records);
  return contract;
}
function baseManifest(source, destination) {
  return {
    schemaVersion: 1,
    status: "CONTROLLED_DEMO_DEPLOYING",
    label: LABEL,
    source: { chainId: "11155111", attestcoinChainKey: "1", factory: source.factory, stable: source.predictedTokens.stable, wctc: source.predictedTokens.wctc, pool: source.pool, fee: source.fee },
    destination: { chainId: "102031", blockProver: "0x0000000000000000000000000000000000000FD2", chainInfo: "0x0000000000000000000000000000000000000FD3", penguinFactory: destination.factory, penguinRouter: destination.router, penguinPool: destination.pool, wctc: destination.predictedTokens.wctc, stable: destination.predictedTokens.stable, pool: destination.pool, fee: destination.fee },
    oracle: { twapWindowSeconds: 300, minimumCardinality: 16, maxProofAgeBlocks: 64, maxConfirmGapBlocks: 12 },
    roles: { deployer: DEPLOYER, treasuryOwner: OWNER, agentSubmitter: DEPLOYER, ownerAgentSeparated: true },
    mandate: { approved: true, enabledStrategies: ["ARBITRAGE", "REBALANCE", "RISK_REDUCTION"], automationMode: "PAUSED", universal: POLICY.universal, arbitrage: POLICY.arbitrage, rebalance: POLICY.rebalance, riskReduction: POLICY.risk },
    blockers: [],
    controlledMarketTransactions: { sepolia: source.transactions, creditcoin: destination.transactions },
    claims: { environment: "PUBLIC_TESTNET_CONTROLLED_DEMO", naturallyOccurringArbitrage: false, productionProfitability: false, bridgedOrRedeemableTokens: false },
  };
}

async function main() {
  const target = process.argv[2];
  if (!CHAINS[target]) throw new Error("usage: node script/deploy-controlled-schema-v1.js sepolia|creditcoin");
  const source = load(SOURCE_FILE);
  const destination = load(DESTINATION_FILE);
  const provider = await selectProvider(CHAINS[target]);
  const nonce = await provider.getTransactionCount(DEPLOYER, "pending");
  const broadcast = process.env.CONTROLLED_DEMO_BROADCAST === "true";
  const existing = fs.existsSync(OUTPUT_FILE) ? load(OUTPUT_FILE) : baseManifest(source, destination);
  console.log(json({ label: LABEL, mode: broadcast ? "BROADCAST" : "PREVIEW_ONLY", target, nonce, deployer: DEPLOYER, treasuryOwner: OWNER, policy: POLICY, existingAddresses: { observer: existing.source.observer || null, treasury: existing.destination.treasury || null } }));
  if (!broadcast) return;
  const key = process.env.AGENT_SUBMIT_PRIVATE_KEY;
  if (!key) throw new Error("AGENT_SUBMIT_PRIVATE_KEY required");
  const wallet = new ethers.Wallet(key, provider);
  if (wallet.address !== DEPLOYER) throw new Error("signer mismatch");
  const records = [];

  if (target === "sepolia") {
    if (existing.source.observer) throw new Error("observer already recorded; refusing duplicate deployment");
    const observer = await deploy(wallet, "EthereumV3MarketObserver.sol", "EthereumV3MarketObserver", [source.factory, source.pool, source.predictedTokens.stable, source.predictedTokens.wctc, source.fee], records);
    const observation = await new ethers.Contract(await observer.getAddress(), OBSERVER_READ_ABI, provider).currentObservation();
    existing.source.observer = await observer.getAddress();
    existing.source.observerReadback = { cardinality: observation[2], liquidity: observation[3], unlocked: observation[4], twapPriceE6: observation[5] };
    existing.source.schemaTransactions = records;
    fs.writeFileSync(OUTPUT_FILE, `${json(existing)}\n`);
    console.log(`wrote ${OUTPUT_FILE}`);
    return;
  }

  if (!existing.source.observer) throw new Error("deploy and record Sepolia observer first");
  if (existing.destination.treasury) throw new Error("treasury already recorded; refusing duplicate deployment");
  const adapter = await deploy(wallet, "PenguinV3Adapter.sol", "PenguinV3Adapter", [destination.router, destination.factory, destination.pool, destination.predictedTokens.wctc, destination.predictedTokens.stable, destination.fee], records);
  const validator = await deploy(wallet, "VerifiedMarketFactValidator.sol", "VerifiedMarketFactValidator", ["0x0000000000000000000000000000000000000FD2", "0x0000000000000000000000000000000000000FD3", existing.source.observer, source.pool, 1, 64, 12], records);
  const factory = await deploy(wallet, "FairWitnessTreasuryFactory.sol", "FairWitnessTreasuryFactory", [await validator.getAddress(), await adapter.getAddress()], records);
  const createReceipt = await receipt(await factory.createTreasury(OWNER, POLICY.universal, POLICY.arbitrage, POLICY.rebalance, POLICY.risk), "create-treasury", records);
  const created = createReceipt.logs.map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } }).find((event) => event?.name === "TreasuryCreated");
  if (!created) throw new Error("TreasuryCreated event missing");
  const treasury = created.args.treasury;
  await receipt(await new ethers.Contract(destination.predictedTokens.stable, ERC20_ABI, wallet).transfer(treasury, 600n * 10n ** 6n), "fund-treasury-stable", records);
  await receipt(await new ethers.Contract(destination.predictedTokens.wctc, ERC20_ABI, wallet).transfer(treasury, 400n * 10n ** 18n), "fund-treasury-wctc", records);
  const adapterState = await new ethers.Contract(await adapter.getAddress(), ADAPTER_READ_ABI, provider).marketState();
  const treasuryRead = new ethers.Contract(treasury, TREASURY_READ_ABI, provider);
  const readback = { owner: await treasuryRead.owner(), automationMode: Number(await treasuryRead.automationMode()), policyHash: await treasuryRead.currentPolicyHash(), deployerRegisteredAsAgent: await treasuryRead.registeredAgents(DEPLOYER), destinationTwapPriceE6: adapterState[0], destinationSpotPriceE6: adapterState[2], destinationLiquidity: adapterState[3] };
  if (readback.owner.toLowerCase() !== OWNER.toLowerCase() || readback.automationMode !== 0 || readback.deployerRegisteredAsAgent) throw new Error("treasury role/mode readback failed");
  existing.destination = { ...existing.destination, adapter: await adapter.getAddress(), validator: await validator.getAddress(), factory: await factory.getAddress(), treasury, readback, schemaTransactions: records };
  existing.mandate.expectedPolicyHash = readback.policyHash;
  existing.status = "DEPLOYED_PAUSED_OWNER_ACTION_REQUIRED";
  fs.writeFileSync(OUTPUT_FILE, `${json(existing)}\n`);
  console.log(`wrote ${OUTPUT_FILE}`);
}

main().catch((error) => { console.error(error.shortMessage || error.message || error); process.exitCode = 1; });
