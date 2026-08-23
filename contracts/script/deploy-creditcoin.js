// Deploy full stack to Creditcoin testnet
// Usage: DEPLOYER_PK=<hex key> node deploy-creditcoin.js
// NOTE: never hardcode keys here — this file is committed to git.
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CC_RPC = process.env.CC_RPC ?? "https://rpc.cc3-testnet.creditcoin.network";
const DEPLOYER_PK = requireEnv("DEPLOYER_PK");
const VERIFIER = "0x0000000000000000000000000000000000000FD2";
// Sepolia-side toy price contract whose observePrice() calls are the arbitrage facts
const PRICE_CONTRACT = requireEnv("PRICE_CONTRACT");
const OWNER = requireEnv("OWNER_ADDRESS");
const AGENT = requireEnv("AGENT_ADDRESS");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const basePath = "/home/ayobami/Downloads/attested-arbitrage-journal/contracts";

async function deployContract(name, jsonFile, args, wallet) {
  const art = JSON.parse(fs.readFileSync(path.join(basePath, jsonFile), "utf8"));
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  console.log(`  Deploying ${name}...`);
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`  ${name} => ${addr}`);
  return addr;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(CC_RPC);
  const wallet = new ethers.Wallet(DEPLOYER_PK, provider);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "CTC\n");

  // 1. Deploy mock tokens
  const base = await deployContract("baseAsset (USDC-like)", "out/MockERC20.sol/MockERC20.json", ["USDC on CTC", "USDC", 6], wallet);
  const quote = await deployContract("quoteAsset (MQT)", "out/MockERC20.sol/MockERC20.json", ["Quote Token", "MQT", 6], wallet);

  // 2. Deploy mock DEX
  const dex = await deployContract("MockDexRouter", "out/MockDexRouter.sol/MockDexRouter.json", [base, quote], wallet);

  // 3. Seed DEX liquidity — mint directly to the DEX (avoids approve timing issue)
  const oneM = ethers.parseUnits("1000000", 6);
  const usdc = new ethers.Contract(base, ["function mint(address,uint256)", "function approve(address,uint256)", "function balanceOf(address) view returns (uint256)"], wallet);
  const mqt = new ethers.Contract(quote, ["function mint(address,uint256)", "function approve(address,uint256)"], wallet);
  console.log("  Minting & seeding DEX liquidity...");
  await (await usdc.mint(wallet.address, oneM)).wait();
  await (await mqt.mint(wallet.address, oneM)).wait();
  await (await usdc.approve(dex, oneM)).wait();
  await (await mqt.approve(dex, oneM)).wait();
  const router = new ethers.Contract(dex, ["function seedLiquidity(uint256,uint256)"], wallet);
  await (await router.seedLiquidity(oneM, oneM)).wait();
  console.log("  DEX seeded with 1M each (1:1)\n");

  // 4. Deploy treasury
  const treasury = await deployContract("ASCTreasuryJournal", "out/ASCTreasuryJournal.sol/ASCTreasuryJournal.json",
    [VERIFIER, dex, base, quote, PRICE_CONTRACT, OWNER], wallet);

  // 5. Fund treasury
  await usdc.mint(treasury, ethers.parseUnits("1000", 6));
  console.log("  Treasury funded with 1,000 USDC\n");

  // 6. Register agent & verify custody separation
  const treasuryContract = new ethers.Contract(treasury,
    ["function registerAgent(address)", "function registeredAgents(address) view returns (bool)"], wallet);
  await (await treasuryContract.registerAgent(AGENT)).wait();
  const isReg = await treasuryContract.isRegisteredAgent(AGENT);
  console.log("  Agent registered:", isReg);

  const agentUsdc = await usdc.balanceOf(AGENT);
  console.log("  Agent USDC balance:", ethers.formatUnits(agentUsdc, 6));
  const agentMqt = await mqt.balanceOf(AGENT);
  console.log("  Agent MQT balance:", ethers.formatUnits(agentMqt, 6));

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("PRICE_CONTRACT=", PRICE_CONTRACT);
  console.log("BASE_ASSET=", base);
  console.log("QUOTE_ASSET=", quote);
  console.log("DEX_ROUTER=", dex);
  console.log("TREASURY=", treasury);
  console.log("VERIFIER=", VERIFIER);
  console.log("OWNER=", OWNER);
  console.log("AGENT=", AGENT);
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });