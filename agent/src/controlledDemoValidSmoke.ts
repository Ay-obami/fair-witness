import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { proofProvider, blockProver as blockProverNs, chainInfo as chainInfoNs } from "@gluwa/usc-sdk";
import { hashEvidence } from "./proposals/hashing.js";

const repo = resolve(process.cwd(), "..");
const manifestPath = resolve(repo, "contracts/deployments/controlled-demo-schema-v1.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const treasuryAbi = JSON.parse(readFileSync(resolve(repo, "contracts/out/FairWitnessTreasury.sol/FairWitnessTreasury.json"), "utf8")).abi;
const observerAbi = JSON.parse(readFileSync(resolve(repo, "contracts/out/EthereumV3MarketObserver.sol/EthereumV3MarketObserver.json"), "utf8")).abi;

function rpcUrls(primary: string | undefined, fallbacks: string[]): string[] {
  return [primary, ...fallbacks].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

function failoverProvider(urls: string[], chainId: number): ethers.FallbackProvider {
  return new ethers.FallbackProvider(
    urls.map((url, index) => ({
      provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
      priority: index + 1,
      stallTimeout: 2_000,
      weight: 1,
    })),
    chainId,
    { quorum: 1 },
  );
}

const sourceProvider = failoverProvider(rpcUrls(process.env.SEPOLIA_RPC_URL, [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://gateway.tenderly.co/public/sepolia",
]), 11155111);
const destinationProvider = failoverProvider(rpcUrls(process.env.CREDITCOIN_RPC_URL, [
  "https://rpc.cc3-testnet.creditcoin.network",
]), 102031);
const agent = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY!, destinationProvider);
const sourceReporter = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY!, sourceProvider);
const owner = new ethers.Wallet(process.env.TREASURY_OWNER_PRIVATE_KEY!, destinationProvider);
const treasury = new ethers.Contract(manifest.destination.treasury, treasuryAbi, agent);
const ownerTreasury = treasury.connect(owner) as ethers.Contract;
const observer = new ethers.Contract(manifest.source.observer, observerAbi, sourceReporter);
const tokenAbi = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const wctc = new ethers.Contract(manifest.destination.wctc, tokenAbi, agent);
const stable = new ethers.Contract(manifest.destination.stable, tokenAbi, destinationProvider);

type Observation = { blockHeight: bigint; transactionIndex: bigint; priceE6: bigint; meanTick: bigint; liquidity: bigint; transactionHash: string };
async function publishObservation(): Promise<Observation> {
  const receipt = await (await observer.observe()).wait();
  const event = receipt.logs.map((log: ethers.Log) => { try { return observer.interface.parseLog(log); } catch { return null; } }).find((value: ethers.LogDescription | null) => value?.name === "MarketPriceObserved");
  if (!event) throw new Error("MarketPriceObserved event missing");
  return { blockHeight: BigInt(receipt.blockNumber), transactionIndex: BigInt(receipt.index), priceE6: event.args.priceE6, meanTick: event.args.arithmeticMeanTick, liquidity: event.args.liquidity, transactionHash: receipt.hash };
}

async function main() {
  const mode = process.env.CONTROLLED_DEMO_RISK_MODE || "valid";
  if (mode !== "valid" && mode !== "oversized") throw new Error("CONTROLLED_DEMO_RISK_MODE must be valid or oversized");
  if (agent.address.toLowerCase() !== manifest.roles.agentSubmitter.toLowerCase()) throw new Error("agent mismatch");
  if (owner.address.toLowerCase() !== manifest.roles.treasuryOwner.toLowerCase()) throw new Error("owner mismatch");
  if (Number(await treasury.automationMode()) !== 0) throw new Error("treasury must start paused");
  if (!await treasury.registeredAgents(agent.address)) throw new Error("agent not registered");

  const desiredWctcBalance = (mode === "oversized" ? 1_500n : 1_000n) * 10n ** 18n;
  const existingWctcBalance = await wctc.balanceOf(treasury.target);
  const exposureFunding = existingWctcBalance < desiredWctcBalance ? desiredWctcBalance - existingWctcBalance : 0n;
  const fundingReceipt = exposureFunding > 0n ? await (await wctc.transfer(treasury.target, exposureFunding)).wait() : null;
  console.log(`[controlled-demo] exposure ready; publishing ${mode} source observations`);
  const source = await publishObservation();
  const confirmation = await publishObservation();
  if (confirmation.blockHeight <= source.blockHeight || confirmation.blockHeight - source.blockHeight > 12n) throw new Error("observation gap outside policy");

  const builder = new proofProvider.service.ProofBuilder(1, process.env.CREDITCOIN_PROOF_BUILDER_URL!, Number(process.env.PROOF_BUILDER_TIMEOUT_MS || "120000"));
  const chainInfo = new chainInfoNs.PrecompileChainInfoProvider(destinationProvider as never);
  const prover = new blockProverNs.PrecompileBlockProver(destinationProvider as never);
  console.log(`[controlled-demo] waiting for Attestcoin through Sepolia block ${confirmation.blockHeight}`);
  await builder.waitUntilHeightAttested(1, Number(confirmation.blockHeight));
  await chainInfo.waitUntilHeightAttested(1, Number(confirmation.blockHeight));
  const sourceResult = await builder.getProof(source.transactionHash);
  const confirmationResult = await builder.getProof(confirmation.transactionHash);
  if (!sourceResult.success || !sourceResult.data || !confirmationResult.success || !confirmationResult.data) throw new Error("Attestcoin proof generation failed");
  const sourceProof = sourceResult.data;
  const confirmationProof = confirmationResult.data;
  if (!await prover.verifySingle(sourceProof.chainKey, sourceProof.headerNumber, sourceProof.txBytes, sourceProof.merkleProof, sourceProof.continuityProof)) throw new Error("source proof failed local verification");
  if (!await prover.verifySingle(confirmationProof.chainKey, confirmationProof.headerNumber, confirmationProof.txBytes, confirmationProof.merkleProof, confirmationProof.continuityProof)) throw new Error("confirmation proof failed local verification");
  console.log("[controlled-demo] both proofs verified locally; preparing policy preflight");

  const evidenceHash = hashEvidence({ sourceChainKey: 1n, sourceBlockHeight: source.blockHeight, sourceTxIndex: BigInt(sourceProof.txIndex), confirmBlockHeight: confirmation.blockHeight, confirmTxIndex: BigInt(confirmationProof.txIndex), immutableObserver: manifest.source.observer, immutableSourcePool: manifest.source.pool, sourcePriceE6: source.priceE6, confirmPriceE6: confirmation.priceE6, sourceMeanTick: source.meanTick, confirmMeanTick: confirmation.meanTick, sourceLiquidity: source.liquidity, confirmLiquidity: confirmation.liquidity });
  const stableBefore = await stable.balanceOf(treasury.target);
  const wctcBefore = await wctc.balanceOf(treasury.target);
  const wctcValue = wctcBefore * confirmation.priceE6 / 10n ** 18n;
  const totalValue = wctcValue + stableBefore;
  const excess = wctcValue - totalValue * 6000n / 10_000n;
  const permitted = [excess, 50n * 10n ** 6n, 100n * 10n ** 6n].reduce((a, b) => a < b ? a : b);
  const permittedAmountIn = permitted * 10n ** 18n / confirmation.priceE6;
  const amountIn = mode === "oversized" ? 7_000n * 10n ** 18n : permittedAmountIn;
  const proof = (value: typeof sourceProof) => ({ chainKey: value.chainKey, blockHeight: value.headerNumber, transactionIndex: value.txIndex, encodedTransaction: value.txBytes, merkleProof: value.merkleProof, continuityProof: value.continuityProof });
  let enabled = false;
  try {
    const enableReceipt = await (await ownerTreasury.setAutomationMode(1)).wait();
    enabled = true;
    console.log(`[controlled-demo] automation enabled in ${enableReceipt.hash}; running ${mode} preflight`);
    const activePolicyHash = await treasury.currentPolicyHash({ blockTag: enableReceipt.blockNumber });
    const nonce = 20_000n + await treasury.attemptCount();
    const proposal = { schemaVersion: 1, strategy: 2, action: 0, assetIn: manifest.destination.wctc, assetOut: manifest.destination.stable, venue: manifest.destination.adapter, amountIn, maxSlippageBps: 300, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), nonce, evidenceHash, observationHash: ethers.id(`controlled-demo-${mode}-risk-observation`), decisionHash: ethers.id(`controlled-demo-${mode}-risk-decision`), policyHash: activePolicyHash };
    const preview = await treasury.submitProposal.staticCall(proposal, proof(sourceProof), proof(confirmationProof));
    const expectedReason = mode === "oversized" ? 28 : 0;
    if (Number(preview[1]) !== expectedReason) throw new Error(`${mode} smoke preview returned reason ${preview[1]}, expected ${expectedReason}`);
    const executionCountBefore = await treasury.executionCount();
    const dailyUsageBefore = await treasury.riskReductionUsedByDay(BigInt(Math.floor(Date.now() / 86_400_000)));
    const submissionReceipt = await (await treasury.submitProposal(proposal, proof(sourceProof), proof(confirmationProof))).wait();
    const attemptId = await treasury.attemptCount();
    const attempt = await treasury.getAttempt(attemptId);
    if (mode === "valid" && (Number(attempt.result) !== 1 || Number(attempt.reason) !== 0)) throw new Error("valid execution was not journaled");
    if (mode === "oversized") {
      const day = BigInt(Math.floor(Date.now() / 86_400_000));
      if (Number(attempt.result) !== 0 || Number(attempt.reason) !== 28) throw new Error("oversized rejection was not journaled");
      if (await treasury.executionCount() !== executionCountBefore || await treasury.riskReductionUsedByDay(day) !== dailyUsageBefore || await stable.balanceOf(treasury.target) !== stableBefore || await wctc.balanceOf(treasury.target) !== wctcBefore) throw new Error("oversized rejection changed protected state");
    }
    const result = { name: mode === "valid" ? "VALID_ATTESTCOIN_RISK_REDUCTION" : "OVERSIZED_ATTESTCOIN_RISK_REJECTION", sourceObservation: source.transactionHash, confirmationObservation: confirmation.transactionHash, sourceBlock: source.blockHeight.toString(), confirmationBlock: confirmation.blockHeight.toString(), fundingTransaction: fundingReceipt?.hash || "already-funded", enableTransaction: enableReceipt.hash, submissionTransaction: submissionReceipt.hash, attemptId: attemptId.toString(), proposedAmountIn: amountIn.toString(), permittedAmountIn: permittedAmountIn.toString(), amountOut: attempt.amountOutActual.toString(), reason: Number(attempt.reason), protectedStateUnchanged: mode === "oversized", genuineAttestcoinProofsLocallyVerified: true };
    manifest.smokeTests = [...(manifest.smokeTests || []), result];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (enabled && Number(await treasury.automationMode()) !== 0) {
      const pauseReceipt = await (await ownerTreasury.setAutomationMode(0)).wait();
      console.log(JSON.stringify({ returnedToPaused: true, pauseTransaction: pauseReceipt.hash }));
    }
  }
}

main().catch((error) => { console.error(error.shortMessage || error.message || error); process.exitCode = 1; });
