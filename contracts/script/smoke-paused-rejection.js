// Broadcasts one registered-agent proposal while the controlled treasury is paused.
// Expected invariant: PolicyPaused is journaled and no balance/execution state changes.
const fs = require("fs");
const path = require("path");
const ethers = require(path.join(__dirname, "..", "..", "agent", "node_modules", "ethers"));

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "deployments", "controlled-demo-schema-v1.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const artifact = JSON.parse(fs.readFileSync(path.join(root, "out", "FairWitnessTreasury.sol", "FairWitnessTreasury.json"), "utf8"));
const rpc = process.env.CC_RPC || process.env.CREDITCOIN_RPC_URL || "https://rpc.cc3-testnet.creditcoin.network";
const provider = new ethers.JsonRpcProvider(rpc, 102031, { staticNetwork: true });
const wallet = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY, provider);
const treasury = new ethers.Contract(manifest.destination.treasury, artifact.abi, wallet);
const erc20 = ["function balanceOf(address) view returns (uint256)"];

const zeroProof = {
  chainKey: 0,
  blockHeight: 0,
  transactionIndex: 0,
  encodedTransaction: "0x",
  merkleProof: { root: ethers.ZeroHash, siblings: [] },
  continuityProof: { lowerEndpointDigest: ethers.ZeroHash, roots: [] },
};

async function main() {
  if (wallet.address.toLowerCase() !== manifest.roles.agentSubmitter.toLowerCase()) throw new Error("agent signer mismatch");
  if (!await treasury.registeredAgents(wallet.address)) throw new Error("agent is not registered");
  if (Number(await treasury.automationMode()) !== 0) throw new Error("treasury is not paused");
  const stable = new ethers.Contract(manifest.destination.stable, erc20, provider);
  const wctc = new ethers.Contract(manifest.destination.wctc, erc20, provider);
  const before = { stable: await stable.balanceOf(treasury.target), wctc: await wctc.balanceOf(treasury.target), executions: await treasury.executionCount(), attempts: await treasury.attemptCount() };
  const proposal = {
    schemaVersion: 1, strategy: 0, action: 0,
    assetIn: manifest.destination.stable, assetOut: manifest.destination.wctc,
    venue: manifest.destination.adapter, amountIn: 1_000_000,
    maxSlippageBps: 300, deadline: Math.floor(Date.now() / 1000) + 600, nonce: 10_000,
    evidenceHash: ethers.id("controlled-demo-paused-evidence"),
    observationHash: ethers.id("controlled-demo-paused-observation"),
    decisionHash: ethers.id("controlled-demo-paused-decision"),
    policyHash: await treasury.currentPolicyHash(),
  };
  const preview = await treasury.submitProposal.staticCall(proposal, zeroProof, zeroProof);
  if (Number(preview[1]) !== 3) throw new Error(`expected PolicyPaused(3), received ${preview[1]}`);
  const tx = await treasury.submitProposal(proposal, zeroProof, zeroProof);
  const receipt = await tx.wait();
  const after = { stable: await stable.balanceOf(treasury.target), wctc: await wctc.balanceOf(treasury.target), executions: await treasury.executionCount(), attempts: await treasury.attemptCount() };
  if (after.stable !== before.stable || after.wctc !== before.wctc || after.executions !== before.executions || after.attempts !== before.attempts + 1n) throw new Error("paused rejection invariant failed");
  const attempt = await treasury.getAttempt(after.attempts);
  if (Number(attempt.result) !== 0 || Number(attempt.reason) !== 3) throw new Error("attempt was not journaled as PolicyPaused rejection");
  const result = { name: "PAUSED_POLICY_REJECTION", transactionHash: receipt.hash, blockNumber: receipt.blockNumber, attemptId: after.attempts.toString(), reason: "PolicyPaused", treasuryBalancesUnchanged: true, executionCountUnchanged: true };
  manifest.smokeTests = [...(manifest.smokeTests || []), result];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error.shortMessage || error.message || error); process.exitCode = 1; });
