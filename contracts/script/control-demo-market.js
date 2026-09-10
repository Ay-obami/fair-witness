// Bounded controller for the two explicitly controlled demo pools. Preview-only by default.
// Usage: node script/control-demo-market.js sepolia|creditcoin <target-price-e6>
// Broadcast: CONTROLLED_DEMO_BROADCAST=true (target range: 0.50-2.00 fwUSD/fwWCTC).
const fs = require("fs");
const path = require("path");
const ethers = require(path.join(__dirname, "..", "..", "agent", "node_modules", "ethers"));

const LABEL = "Controlled demonstration markets and liquidity. Token equivalence and price conditions are configured for demonstration and do not represent a production bridge, natural arbitrage, or economic profitability.";
const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "deployments", "controlled-demo-schema-v1.json");
const actionsPath = path.join(root, "deployments", "controlled-demo-market-actions.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const Q96 = 2n ** 96n;
const ROUTER_ABI = ["function factory() view returns (address)"];
const SEPOLIA_ROUTER_ABI = [
  ...ROUTER_ABI,
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
];
const PENGUIN_ROUTER_ABI = [
  ...ROUTER_ABI,
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) returns (uint256)",
];
const POOL_ABI = ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)", "function token0() view returns (address)", "function token1() view returns (address)"];
const TOKEN_ABI = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];

function sqrt(value) {
  if (value < 0n) throw new Error("negative square root");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + value / x) / 2n; }
  return x;
}
function targetSqrtPrice(network, priceE6) {
  return network === "sepolia" ? Q96 * 1_000_000_000n / sqrt(priceE6) : Q96 * sqrt(priceE6) / 1_000_000_000n;
}
function stringify(value) { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2); }

async function main() {
  const network = process.argv[2];
  const priceE6 = BigInt(process.argv[3] || "1000000");
  if (!['sepolia', 'creditcoin'].includes(network)) throw new Error("network must be sepolia or creditcoin");
  if (priceE6 < 500_000n || priceE6 > 2_000_000n) throw new Error("target price must remain between 0.50 and 2.00");
  const source = network === "sepolia";
  const market = source ? manifest.source : manifest.destination;
  const routerAddress = source ? "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" : market.penguinRouter;
  const expectedFactory = source ? market.factory : market.penguinFactory;
  const rpc = source ? (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") : (process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network");
  const chainId = source ? 11155111 : 102031;
  const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
  const pool = new ethers.Contract(market.pool, POOL_ABI, provider);
  const router = new ethers.Contract(routerAddress, source ? SEPOLIA_ROUTER_ABI : PENGUIN_ROUTER_ABI, provider);
  const [slot0, token0, token1, routerFactory] = await Promise.all([pool.slot0(), pool.token0(), pool.token1(), router.factory()]);
  if (routerFactory.toLowerCase() !== expectedFactory.toLowerCase()) throw new Error("router factory mismatch");
  const target = targetSqrtPrice(network, priceE6);
  const current = slot0[0];
  const zeroForOne = target < current;
  const tokenIn = zeroForOne ? token0 : token1;
  const tokenOut = zeroForOne ? token1 : token0;
  const decimals = tokenIn.toLowerCase() === market.stable.toLowerCase() ? 6n : 18n;
  const amountInMaximum = 10_000n * 10n ** decimals;
  const plan = { label: LABEL, mode: process.env.CONTROLLED_DEMO_BROADCAST === "true" ? "BROADCAST" : "PREVIEW_ONLY", network, pool: market.pool, router: routerAddress, targetPriceE6: priceE6, currentSqrtPriceX96: current, targetSqrtPriceX96: target, tokenIn, tokenOut, amountInMaximum };
  console.log(stringify(plan));
  if (current === target || process.env.CONTROLLED_DEMO_BROADCAST !== "true") return;
  const wallet = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY, provider);
  if (wallet.address.toLowerCase() !== manifest.roles.deployer.toLowerCase()) throw new Error("market-controller signer mismatch");
  const input = new ethers.Contract(tokenIn, TOKEN_ABI, wallet);
  const output = new ethers.Contract(tokenOut, TOKEN_ABI, wallet);
  const [inputBefore, outputBefore] = await Promise.all([input.balanceOf(wallet.address), output.balanceOf(wallet.address)]);
  if (inputBefore < amountInMaximum) throw new Error("controller lacks bounded input balance");
  await (await input.approve(routerAddress, amountInMaximum)).wait();
  const signedRouter = router.connect(wallet);
  const swapParams = source
    ? { tokenIn, tokenOut, fee: market.fee, recipient: wallet.address, amountIn: amountInMaximum, amountOutMinimum: 1, sqrtPriceLimitX96: target }
    : { tokenIn, tokenOut, fee: market.fee, recipient: wallet.address, deadline: Math.floor(Date.now() / 1000) + 600, amountIn: amountInMaximum, amountOutMinimum: 1, sqrtPriceLimitX96: target };
  const receipt = await (await signedRouter.exactInputSingle(swapParams)).wait();
  await (await input.approve(routerAddress, 0)).wait();
  const [afterSlot0, inputAfter, outputAfter] = await Promise.all([pool.slot0(), input.balanceOf(wallet.address), output.balanceOf(wallet.address)]);
  const result = { ...plan, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, actualAmountIn: inputBefore - inputAfter, actualAmountOut: outputAfter - outputBefore, resultingSqrtPriceX96: afterSlot0[0], approvalCleared: true, twapReadyAfterSeconds: 300 };
  const existing = fs.existsSync(actionsPath) ? JSON.parse(fs.readFileSync(actionsPath, "utf8")) : { label: LABEL, actions: [] };
  existing.actions.push(result);
  fs.writeFileSync(actionsPath, `${stringify(existing)}\n`);
  console.log(stringify(result));
}

if (require.main === module) {
  main().catch((error) => { console.error(error.shortMessage || error.message || error); process.exitCode = 1; });
}

module.exports = { sqrt, targetSqrtPrice };
