import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import { proofProvider, blockProver as blockProverNs, chainInfo as chainInfoNs } from "@gluwa/usc-sdk";
import { ethers } from "ethers";
import { parseAiDecision } from "./domain/aiDecision.js";
import { DecisionOutcome, StrategyType } from "./domain/types.js";
import { hashEvidence } from "./proposals/hashing.js";

const repo = resolve(process.cwd(), "..");
const manifest = JSON.parse(readFileSync(resolve(repo, "contracts/deployments/controlled-demo-schema-v1.json"), "utf8"));
const treasuryAbi = JSON.parse(readFileSync(resolve(repo, "contracts/out/FairWitnessTreasury.sol/FairWitnessTreasury.json"), "utf8")).abi;
const observerAbi = JSON.parse(readFileSync(resolve(repo, "contracts/out/EthereumV3MarketObserver.sol/EthereumV3MarketObserver.json"), "utf8")).abi;
const WCTC_UNIT = 10n ** 18n;
const BPS = 10_000n;

function rpcUrls(primary: string | undefined, fallbacks: string[]): string[] {
  return [primary, ...fallbacks].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

function failoverProvider(urls: string[], chainId: number): ethers.FallbackProvider {
  return new ethers.FallbackProvider(urls.map((url, index) => ({
    provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
    priority: index + 1, stallTimeout: 2_000, weight: 1,
  })), chainId, { quorum: 1 });
}

const sourceProvider = failoverProvider(rpcUrls(process.env.SEPOLIA_RPC_URL, [
  "https://ethereum-sepolia-rpc.publicnode.com", "https://gateway.tenderly.co/public/sepolia",
]), 11155111);
const destinationProvider = failoverProvider(rpcUrls(process.env.CREDITCOIN_RPC_URL, [
  "https://rpc.cc3-testnet.creditcoin.network",
]), 102031);
const agent = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY!, destinationProvider);
const reporter = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY!, sourceProvider);
const owner = new ethers.Wallet(process.env.TREASURY_OWNER_PRIVATE_KEY!, destinationProvider);
const treasury = new ethers.Contract(manifest.destination.treasury, treasuryAbi, agent);
const ownerTreasury = treasury.connect(owner) as ethers.Contract;
const observer = new ethers.Contract(manifest.source.observer, observerAbi, reporter);
const tokenAbi = ["function transfer(address,uint256) returns(bool)", "function balanceOf(address) view returns(uint256)"];
const wctc = new ethers.Contract(manifest.destination.wctc, tokenAbi, agent);
const stable = new ethers.Contract(manifest.destination.stable, tokenAbi, agent);
const adapter = new ethers.Contract(manifest.destination.adapter, [
  "function marketState() view returns(uint256 twapPriceE6,int24 arithmeticMeanTick,uint256 spotPriceE6,uint128 liquidity)",
  "function POOL_FEE() view returns(uint24)",
], destinationProvider);

type Observation = { blockHeight: bigint; transactionIndex: bigint; priceE6: bigint; meanTick: bigint; liquidity: bigint; transactionHash: string };
async function publishObservation(): Promise<Observation> {
  const receipt = await (await observer.observe()).wait();
  const event = receipt.logs.map((log: ethers.Log) => { try { return observer.interface.parseLog(log); } catch { return null; } })
    .find((value: ethers.LogDescription | null) => value?.name === "MarketPriceObserved");
  if (!event) throw new Error("MarketPriceObserved event missing");
  return { blockHeight: BigInt(receipt.blockNumber), transactionIndex: BigInt(receipt.index), priceE6: event.args.priceE6,
    meanTick: event.args.arithmeticMeanTick, liquidity: event.args.liquidity, transactionHash: receipt.hash };
}

async function normalizePortfolio(mode: "arbitrage" | "rebalance", referencePriceE6: bigint): Promise<string | null> {
  const [wctcBalance, stableBalance] = await Promise.all([wctc.balanceOf(treasury.target), stable.balanceOf(treasury.target)]);
  if (mode === "arbitrage") {
    const wctcValueE6 = wctcBalance * referencePriceE6 / WCTC_UNIT;
    const desiredStable = wctcValueE6 * 6_000n / 4_000n; // 40% WCTC: risk does not pre-empt arbitrage.
    if (stableBalance < desiredStable) return (await (await stable.transfer(treasury.target, desiredStable - stableBalance)).wait()).hash;
    return null;
  }
  const desiredWctcValueE6 = stableBalance * 5_500n / 4_500n; // 55%: outside rebalance tolerance, below risk ceiling.
  const desiredWctc = desiredWctcValueE6 * WCTC_UNIT / referencePriceE6;
  if (wctcBalance < desiredWctc) return (await (await wctc.transfer(treasury.target, desiredWctc - wctcBalance)).wait()).hash;
  return null;
}

async function aiDecision(strategy: StrategyType, candidate: Record<string, string | number>) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for a claimed AI decision");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
        contents: `Controlled public-testnet demonstration for ${strategy === StrategyType.ARBITRAGE ? "ARBITRAGE" : "REBALANCING"}. Deterministic code produced this policy-bounded candidate:\n${JSON.stringify(candidate)}\nRecommend EXECUTE only if the verified conditions support exactly that named strategy. Do not describe another strategy. You cannot choose amount, assets, venue, slippage, deadline, route, recipient, or calldata.`,
        config: {
          systemInstruction: "You are an untrusted conservative financial decision proposer. Return only EXECUTE or WAIT plus rationale and short reason tags. Deterministic on-chain policy is the sole authorization boundary.",
          temperature: 0, seed: 42, responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: {
            decision: { type: Type.STRING }, strategy: { type: Type.INTEGER }, rationale: { type: Type.STRING },
            reasonTags: { type: Type.ARRAY, items: { type: Type.STRING } },
          }, required: ["decision", "strategy", "rationale", "reasonTags"] },
        },
      });
      if (!response.text) throw new Error("Gemini returned no decision");
      const decision = parseAiDecision(JSON.parse(response.text));
      if (decision.strategy !== strategy) throw new Error("AI returned the wrong strategy");
      return decision;
    } catch (error) {
      lastError = error;
      const transient = /(?:408|409|429|500|502|503|504|timeout|temporar)/i.test(String(error));
      if (!transient || attempt === 4) throw error;
      console.log(`[controlled-demo] Gemini transient failure ${attempt}/4; retrying`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
    }
  }
  throw lastError;
}

async function main() {
  const mode = process.env.CONTROLLED_DEMO_STRATEGY;
  if (mode !== "arbitrage" && mode !== "rebalance") throw new Error("CONTROLLED_DEMO_STRATEGY must be arbitrage or rebalance");
  const strategy = mode === "arbitrage" ? StrategyType.ARBITRAGE : StrategyType.REBALANCE;
  if (agent.address.toLowerCase() !== manifest.roles.agentSubmitter.toLowerCase() || owner.address.toLowerCase() !== manifest.roles.treasuryOwner.toLowerCase()) throw new Error("role mismatch");
  if (Number(await treasury.automationMode()) !== 0 || !await treasury.registeredAgents(agent.address)) throw new Error("treasury must start paused with registered agent");

  console.log(`[controlled-demo] publishing ${mode} observations`);
  const source = await publishObservation();
  const confirmation = await publishObservation();
  if (confirmation.blockHeight <= source.blockHeight || confirmation.blockHeight - source.blockHeight > 12n) throw new Error("observation gap outside policy");
  const fundingTransaction = await normalizePortfolio(mode, confirmation.priceE6);

  const builder = new proofProvider.service.ProofBuilder(1, process.env.CREDITCOIN_PROOF_BUILDER_URL!, Number(process.env.PROOF_BUILDER_TIMEOUT_MS || "120000"));
  const chainInfo = new chainInfoNs.PrecompileChainInfoProvider(destinationProvider as never);
  const prover = new blockProverNs.PrecompileBlockProver(destinationProvider as never);
  console.log(`[controlled-demo] waiting for Attestcoin through Sepolia block ${confirmation.blockHeight}`);
  await builder.waitUntilHeightAttested(1, Number(confirmation.blockHeight));
  await chainInfo.waitUntilHeightAttested(1, Number(confirmation.blockHeight));
  const [sourceResult, confirmationResult] = await Promise.all([builder.getProof(source.transactionHash), builder.getProof(confirmation.transactionHash)]);
  if (!sourceResult.success || !sourceResult.data || !confirmationResult.success || !confirmationResult.data) throw new Error("Attestcoin proof generation failed");
  const sourceProof = sourceResult.data, confirmationProof = confirmationResult.data;
  if (!await prover.verifySingle(sourceProof.chainKey, sourceProof.headerNumber, sourceProof.txBytes, sourceProof.merkleProof, sourceProof.continuityProof)
    || !await prover.verifySingle(confirmationProof.chainKey, confirmationProof.headerNumber, confirmationProof.txBytes, confirmationProof.merkleProof, confirmationProof.continuityProof)) throw new Error("proof failed local verification");

  const evidenceHash = hashEvidence({ sourceChainKey: 1n, sourceBlockHeight: source.blockHeight, sourceTxIndex: BigInt(sourceProof.txIndex),
    confirmBlockHeight: confirmation.blockHeight, confirmTxIndex: BigInt(confirmationProof.txIndex), immutableObserver: manifest.source.observer,
    immutableSourcePool: manifest.source.pool, sourcePriceE6: source.priceE6, confirmPriceE6: confirmation.priceE6,
    sourceMeanTick: source.meanTick, confirmMeanTick: confirmation.meanTick, sourceLiquidity: source.liquidity, confirmLiquidity: confirmation.liquidity });
  const [market, poolFee, wctcBalance, stableBalance] = await Promise.all([adapter.marketState(), adapter.POOL_FEE(), wctc.balanceOf(treasury.target), stable.balanceOf(treasury.target)]);
  const twap = BigInt(market.twapPriceE6), spot = BigInt(market.spotPriceE6);
  let amountIn: bigint, assetIn: string, assetOut: string;
  const candidate: Record<string, string | number> = { strategy, sourcePriceE6: confirmation.priceE6.toString(), destinationTwapPriceE6: twap.toString(), destinationSpotPriceE6: spot.toString() };
  if (mode === "arbitrage") {
    const sell = twap > confirmation.priceE6;
    const gross = sell ? (twap - confirmation.priceE6) * BPS / confirmation.priceE6 : (confirmation.priceE6 - twap) * BPS / twap;
    const costs = (BigInt(poolFee) + 99n) / 100n + 300n + 20n;
    if (gross < costs + 100n) throw new Error("controlled arbitrage edge is below policy");
    const net = gross - costs;
    const valueCap = sell ? [100_000_000n, wctcBalance * twap / WCTC_UNIT].reduce((a,b)=>a<b?a:b) : [100_000_000n, stableBalance].reduce((a,b)=>a<b?a:b);
    const scaled = [valueCap, valueCap * net / 400n].reduce((a,b)=>a<b?a:b);
    amountIn = sell ? scaled * WCTC_UNIT / twap : scaled;
    assetIn = sell ? manifest.destination.wctc : manifest.destination.stable;
    assetOut = sell ? manifest.destination.stable : manifest.destination.wctc;
    Object.assign(candidate, { grossEdgeBps: Number(gross), netEdgeBps: Number(net), deterministicAmountIn: amountIn.toString() });
  } else {
    const wctcValue = wctcBalance * confirmation.priceE6 / WCTC_UNIT;
    const total = wctcValue + stableBalance;
    const currentBps = wctcValue * BPS / total;
    if (currentBps <= 4_500n || currentBps > 6_000n) throw new Error(`rebalance setup exposure ${currentBps}bps is not 45-60%`);
    const targetValue = total * 4_000n / BPS;
    const required = wctcValue - targetValue;
    const permitted = required < 100_000_000n ? required : 100_000_000n;
    amountIn = permitted * WCTC_UNIT / confirmation.priceE6;
    assetIn = manifest.destination.wctc; assetOut = manifest.destination.stable;
    Object.assign(candidate, { currentWctcBps: Number(currentBps), targetWctcBps: 4_000, deterministicAmountIn: amountIn.toString() });
  }

  const decision = await aiDecision(strategy, candidate);
  console.log(JSON.stringify({ aiDecision: decision.decision, rationale: decision.rationale, reasonTags: decision.reasonTags }));
  if (decision.decision !== DecisionOutcome.EXECUTE) throw new Error("AI returned WAIT; no proposal submitted");
  const decisionEnvelope = { schemaVersion: 1, evidenceHash, strategy, candidate, decision };
  const observationHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ source, confirmation, market: { twap: twap.toString(), spot: spot.toString(), liquidity: market.liquidity.toString() }, portfolio: { wctcBalance: wctcBalance.toString(), stableBalance: stableBalance.toString() } }, (_, value) => typeof value === "bigint" ? value.toString() : value)));
  const decisionHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(decisionEnvelope, (_, value) => typeof value === "bigint" ? value.toString() : value)));
  const proof = (value: typeof sourceProof) => ({ chainKey: value.chainKey, blockHeight: value.headerNumber, transactionIndex: value.txIndex, encodedTransaction: value.txBytes, merkleProof: value.merkleProof, continuityProof: value.continuityProof });
  let enabled = false;
  try {
    const enableReceipt = await (await ownerTreasury.setAutomationMode(1)).wait(); enabled = true;
    const proposal = { schemaVersion: 1, strategy, action: 0, assetIn, assetOut, venue: manifest.destination.adapter, amountIn,
      maxSlippageBps: 300, deadline: BigInt(Math.floor(Date.now()/1000)+600), nonce: 30_000n + await treasury.attemptCount(), evidenceHash,
      observationHash, decisionHash, policyHash: await treasury.currentPolicyHash({ blockTag: enableReceipt.blockNumber }) };
    const preview = await treasury.submitProposal.staticCall(proposal, proof(sourceProof), proof(confirmationProof));
    if (Number(preview[1]) !== 0) throw new Error(`${mode} preflight returned reason ${preview[1]}`);
    const receipt = await (await treasury.submitProposal(proposal, proof(sourceProof), proof(confirmationProof))).wait();
    const attemptId = await treasury.attemptCount(), attempt = await treasury.getAttempt(attemptId);
    if (Number(attempt.result) !== 1 || Number(attempt.reason) !== 0) throw new Error(`${mode} was not journaled as executed`);
    console.log(JSON.stringify({ name: mode === "arbitrage" ? "CONTROLLED_ATTESTCOIN_ARBITRAGE" : "CONTROLLED_ATTESTCOIN_REBALANCE",
      sourceObservation: source.transactionHash, confirmationObservation: confirmation.transactionHash, fundingTransaction: fundingTransaction || "not-required",
      enableTransaction: enableReceipt.hash, submissionTransaction: receipt.hash, attemptId: attemptId.toString(), amountIn: amountIn.toString(), amountOut: attempt.amountOutActual.toString(),
      aiDecision: decision, genuineAttestcoinProofsLocallyVerified: true }, null, 2));
  } finally {
    if (enabled && Number(await treasury.automationMode()) !== 0) console.log(JSON.stringify({ returnedToPaused: true, pauseTransaction: (await (await ownerTreasury.setAutomationMode(0)).wait()).hash }));
  }
}

main().catch((error) => { console.error(error.shortMessage || error.message || error); process.exitCode = 1; });
