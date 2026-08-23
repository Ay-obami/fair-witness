// Fires a PriceObservation on Sepolia every ~50s so the running agent always has
// a fresh observation available as its confirmation proof (needs one at source+3..8).
// Prices oscillate 1_010_000 <-> 1_011_000: ~10bps apart (within MAX_DRIFT_BPS=100)
// and ~130-140bps above the mock-DEX quote of 996999 (above MIN_ARB_WIDTH_BPS=80).
const { ethers } = require("ethers");

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const PK = process.env.DEPLOYER_PK;
const CONTRACT = "0x23433fcA0f35CC5e801b6888293B2B11017900c7";
const PRICES = [1_010_000n, 1_011_000n];

async function main() {
  const w = new ethers.Wallet(PK, new ethers.JsonRpcProvider(RPC));
  const pc = new ethers.Contract(CONTRACT, ["function observePrice(uint256)"], w);
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const price = PRICES[i % PRICES.length];
    try {
      // Explicit generous gasLimit: ethers' per-tx estimate can go stale when Sepolia's
      // base fee moves between estimation and inclusion, and the mined tx then fails
      // with a bare "Out of gas" revert (observed live). 200k vs ~60k actual need.
      const tx = await pc.observePrice(price, { gasLimit: 200_000 });
      const r = await tx.wait();
      console.log(`[${new Date().toISOString()}] observed ${price} in block ${r.blockNumber} tx ${r.hash}`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] observe failed: ${e.shortMessage || e.message}`);
    }
    i++;
    await new Promise((res) => setTimeout(res, 15_000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });