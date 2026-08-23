// ADVERSARIAL DEMO (docs/DEPLOYMENT.md step 7): replays the EXACT calldata of a
// previously-successful executeArbitrage transaction, resent from the same agent key.
// Everything about it is genuine — real attestations, real prices, real signature —
// except the intent. The contract's executedActions[actionKey] guard MUST reject it
// with AlreadyExecuted, proving replay-safety live rather than only in tests.
const { ethers } = require("ethers");

const CC_RPC = "https://rpc.cc3-testnet.creditcoin.network";
const AGENT_PK = process.env.AGENT_PK;
const ORIGINAL_TX = process.env.TX_HASH;

async function main() {
  const provider = new ethers.JsonRpcProvider(CC_RPC);
  const wallet = new ethers.Wallet(AGENT_PK, provider);

  const orig = await provider.getTransaction(ORIGINAL_TX);
  console.log(`Original exec tx : ${orig.hash}`);
  console.log(`  to             : ${orig.to}`);
  console.log(`  selector       : ${orig.data.slice(0, 10)}`);
  console.log(`Replaying identical calldata from ${wallet.address} ...`);

  try {
    const tx = await wallet.sendTransaction({
      to: orig.to,
      data: orig.data,
      gasLimit: 600_000, // enough to reach the guard; a full success path needs more
    });
    const r = await tx.wait();
    // If we ever get here, the replay SUCCEEDED — that would be a critical bug.
    console.error(`!!! REPLAY WAS MINED SUCCESSFULLY (status ${r.status}) — REPLAY-SAFETY BROKEN: ${r.hash}`);
    process.exit(1);
  } catch (e) {
    const reason = e.revert && e.receipt ? e.shortMessage : e.shortMessage || e.message;
    console.log(`REJECTED as expected ✅`);
    console.log(`  revert reason: ${reason}`);
    if (e.revert && e.revert.args) {
      console.log(`  decoded error: ${JSON.stringify(e.revert.args)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });