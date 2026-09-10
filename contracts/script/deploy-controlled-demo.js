// Deploys the explicitly controlled Fair Witness demo markets. Preview is the default.
// Broadcast requires: CONTROLLED_DEMO_BROADCAST=true and AGENT_SUBMIT_PRIVATE_KEY.
// Run from contracts/: node script/deploy-controlled-demo.js sepolia|creditcoin
const fs = require("fs");
const path = require("path");

function resolveEthers() {
  const candidate = path.join(__dirname, "..", "..", "agent", "node_modules", "ethers");
  return fs.existsSync(path.join(candidate, "package.json")) ? require(candidate) : require("ethers");
}
const ethers = resolveEthers();

const LABEL = "Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.";
const DEPLOYER = "0xB1D19F71d68c4e7065749e8593D338E9A30D654f";
const TREASURY_OWNER = "0xF40003d36567478489BcCF1a1fEd094f87EeC9a5";
const FEE = 3000;
const LIQUIDITY = 10_000_000_000_000_000n;
const MIN_TICK = -887220;
const MAX_TICK = 887220;
const Q96 = 2n ** 96n;

const NETWORKS = Object.freeze({
  sepolia: {
    chainId: 11155111n,
    rpcs: [process.env.SEPOLIA_RPC_URL, "https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia", "https://gateway.tenderly.co/public/sepolia"],
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    router: null,
    token0Kind: "stable",
    sqrtPriceX96: Q96 * 1_000_000n,
  },
  creditcoin: {
    chainId: 102031n,
    rpcs: [process.env.CC_RPC, process.env.CREDITCOIN_RPC_URL, "https://rpc.cc3-testnet.creditcoin.network"],
    factory: "0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9",
    router: "0x3f65634837F914F18dBc4Db3E9d8Aa8F547f3229",
    token0Kind: "wctc",
    sqrtPriceX96: Q96 / 1_000_000n,
  },
});

const FACTORY_ABI = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)",
];
const POOL_ABI = [
  "function initialize(uint160)",
  "function increaseObservationCardinalityNext(uint16)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];
const ERC20_ABI = ["function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)"];
const PROVIDER_ABI = ["function provide(address,address,int24,int24,uint128) returns (uint256,uint256)"];

function artifact(contractPath, name) {
  const value = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "out", contractPath, `${name}.json`), "utf8"));
  return { abi: value.abi, bytecode: value.bytecode.object };
}

function tokenArgs(kind) {
  return kind === "stable"
    ? ["Fair Witness Demo Stable", "fwUSD", 6, DEPLOYER, 1_000_000n * 10n ** 6n]
    : ["Fair Witness Demo WCTC", "fwWCTC", 18, DEPLOYER, 1_000_000n * 10n ** 18n];
}

function json(value) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2);
}

async function selectProvider(config) {
  let lastError;
  for (const rpc of config.rpcs.filter((value, index, all) => value && all.indexOf(value) === index)) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, Number(config.chainId), { staticNetwork: true });
      if ((await provider.getNetwork()).chainId !== config.chainId) throw new Error("chain ID mismatch");
      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`all configured RPC endpoints failed: ${lastError?.message || lastError}`);
}

async function checkedReceipt(tx, action, records) {
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${action} reverted`);
  records.push({ action, transactionHash: receipt.hash, blockNumber: receipt.blockNumber });
  return receipt;
}

async function main() {
  const name = process.argv[2];
  const config = NETWORKS[name];
  if (!config) throw new Error("usage: node script/deploy-controlled-demo.js sepolia|creditcoin");
  const provider = await selectProvider(config);
  const network = await provider.getNetwork();
  if (network.chainId !== config.chainId) throw new Error(`wrong chain: ${network.chainId}`);
  const nonce = await provider.getTransactionCount(DEPLOYER, "pending");
  const first = ethers.getCreateAddress({ from: DEPLOYER, nonce });
  const second = ethers.getCreateAddress({ from: DEPLOYER, nonce: nonce + 1 });
  const lowFirst = BigInt(first) < BigInt(second);
  const firstKind = lowFirst ? config.token0Kind : (config.token0Kind === "stable" ? "wctc" : "stable");
  const secondKind = firstKind === "stable" ? "wctc" : "stable";
  const predicted = { [firstKind]: first, [secondKind]: second };
  const plan = {
    label: LABEL,
    mode: process.env.CONTROLLED_DEMO_BROADCAST === "true" ? "BROADCAST" : "PREVIEW_ONLY",
    network: name,
    chainId: config.chainId,
    deployer: DEPLOYER,
    treasuryOwner: TREASURY_OWNER,
    ownerAgentSeparated: DEPLOYER.toLowerCase() !== TREASURY_OWNER.toLowerCase(),
    startingNonce: nonce,
    factory: config.factory,
    router: config.router,
    fee: FEE,
    initialHumanPrice: "1 fwUSD per fwWCTC",
    fullRangeLiquidity: LIQUIDITY,
    seedTarget: "approximately 10,000 units of each token; actual debit determined by V3 math",
    predictedTokens: predicted,
    requiredToken0: predicted[config.token0Kind],
    requiredToken1: predicted[config.token0Kind === "stable" ? "wctc" : "stable"],
    observationCardinalityNext: 16,
    automationMode: "PAUSED",
  };
  console.log(json(plan));
  if (process.env.CONTROLLED_DEMO_BROADCAST !== "true") return;

  const privateKey = process.env.AGENT_SUBMIT_PRIVATE_KEY;
  if (!privateKey) throw new Error("AGENT_SUBMIT_PRIVATE_KEY is required for broadcast");
  const wallet = new ethers.Wallet(privateKey, provider);
  if (wallet.address !== DEPLOYER) throw new Error(`signer mismatch: ${wallet.address}`);
  if (await provider.getTransactionCount(DEPLOYER, "pending") !== nonce) throw new Error("deployer nonce changed after preview");
  if (await provider.getCode(config.factory) === "0x") throw new Error("factory has no code");
  if (config.router && await provider.getCode(config.router) === "0x") throw new Error("router has no code");

  const tokenArtifact = artifact("ControlledDemoToken.sol", "ControlledDemoToken");
  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, wallet);
  const records = [];
  const tokens = {};
  for (const kind of [firstKind, secondKind]) {
    const token = await tokenFactory.deploy(...tokenArgs(kind));
    await checkedReceipt(token.deploymentTransaction(), `deploy-${kind}`, records);
    if ((await token.getAddress()).toLowerCase() !== predicted[kind].toLowerCase()) throw new Error(`${kind} address mismatch`);
    tokens[kind] = token;
  }

  const token0 = await tokens[config.token0Kind].getAddress();
  const token1Kind = config.token0Kind === "stable" ? "wctc" : "stable";
  const token1 = await tokens[token1Kind].getAddress();
  const v3Factory = new ethers.Contract(config.factory, FACTORY_ABI, wallet);
  if (await v3Factory.getPool(token0, token1, FEE) !== ethers.ZeroAddress) throw new Error("controlled pool already exists");
  await checkedReceipt(await v3Factory.createPool(token0, token1, FEE), "create-pool", records);
  const poolAddress = await v3Factory.getPool(token0, token1, FEE);
  const pool = new ethers.Contract(poolAddress, POOL_ABI, wallet);
  if ((await pool.token0()).toLowerCase() !== token0.toLowerCase() || (await pool.token1()).toLowerCase() !== token1.toLowerCase()) {
    throw new Error("pool token ordering mismatch");
  }
  await checkedReceipt(await pool.initialize(config.sqrtPriceX96), "initialize-pool", records);
  await checkedReceipt(await pool.increaseObservationCardinalityNext(16), "increase-cardinality", records);

  const helperArtifact = artifact("ControlledV3LiquidityProvider.sol", "ControlledV3LiquidityProvider");
  const helperFactory = new ethers.ContractFactory(helperArtifact.abi, helperArtifact.bytecode, wallet);
  const helper = await helperFactory.deploy();
  await checkedReceipt(helper.deploymentTransaction(), "deploy-liquidity-provider", records);
  const helperAddress = await helper.getAddress();
  await checkedReceipt(await tokens.stable.approve(helperAddress, 10_001n * 10n ** 6n), "approve-stable", records);
  await checkedReceipt(await tokens.wctc.approve(helperAddress, 10_001n * 10n ** 18n), "approve-wctc", records);
  const providerContract = new ethers.Contract(helperAddress, PROVIDER_ABI, wallet);
  await checkedReceipt(await providerContract.provide(poolAddress, DEPLOYER, MIN_TICK, MAX_TICK, LIQUIDITY), "seed-liquidity", records);

  const slot0 = await pool.slot0();
  const result = {
    ...plan,
    pool: poolAddress,
    liquidityProvider: helperAddress,
    observed: {
      sqrtPriceX96: slot0[0],
      observationCardinality: slot0[3],
      observationCardinalityNext: slot0[4],
      liquidity: await pool.liquidity(),
    },
    transactions: records,
  };
  const output = path.join(__dirname, "..", "deployments", `controlled-demo-${name}.json`);
  fs.writeFileSync(output, `${json(result)}\n`);
  console.log(`wrote ${output}`);
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exitCode = 1;
});
