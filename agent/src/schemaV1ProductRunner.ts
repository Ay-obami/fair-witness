import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { GoogleGenAI, Type } from "@google/genai";
import { proofProvider, blockProver as blockProverNs, chainInfo as chainInfoNs } from "@gluwa/usc-sdk";
import factoryAbi from "./abi/FairWitnessTreasuryFactory.json" with { type: "json" };
import treasuryAbi from "./abi/FairWitnessTreasury.json" with { type: "json" };
import observerAbi from "./abi/EthereumV3MarketObserver.json" with { type: "json" };
import { ArbitrageStrategy } from "./strategies/arbitrage.js";
import { RebalancingStrategy } from "./strategies/rebalancing.js";
import { RiskReductionStrategy } from "./strategies/riskReduction.js";
import { StrategyCoordinator, selectHighestPriorityCandidate } from "./strategies/coordinator.js";
import { buildProposal } from "./proposals/builder.js";
import { hashEvidence } from "./proposals/hashing.js";
import { PolicySubmitter } from "./policySubmitter.js";
import { parseAiDecision } from "./domain/aiDecision.js";
import { updateRuntimeHealth } from "./runtimeHealth.js";
import {
  AutomationMode,
  DecisionOutcome,
  type Address,
  type Candidate,
  type Hex32,
  type MandateSnapshot,
  type VerifiedContext,
  type VerifiedSourceObservation,
} from "./domain/types.js";
import type { AttestedProof } from "./attestcoinClient.js";

/**
 * Production-shaped schema-v1 service.
 *
 * Security properties:
 * - discovers user treasuries incrementally from permissionless factory events, not a database;
 * - rotates fairly through large treasury sets instead of permanently serving only the newest accounts;
 * - serializes submissions that mutate the same destination market;
 * - publishes pool-derived source observations (when the source reporter key is configured);
 * - builds and locally verifies genuine Attestcoin proofs;
 * - derives strategy candidates deterministically before asking the AI;
 * - re-reads mutable destination/portfolio state immediately before submission;
 * - AI returns only EXECUTE/WAIT + rationale and cannot choose execution fields;
 * - ProposalBuilder controls every execution field;
 * - static preflight must approve before a transaction is broadcast;
 * - FairWitnessTreasury re-verifies proof, market state, portfolio state and policy on-chain.
 */

const repo = resolve(process.cwd(), "..");
const manifest = JSON.parse(readFileSync(resolve(repo, "contracts/deployments/controlled-demo-schema-v1-lifecycle.json"), "utf8"));
const SOURCE_CHAIN_KEY = Number(process.env.SOURCE_CHAIN_KEY ?? manifest.source.attestcoinChainKey ?? "1");
const SOURCE_CHAIN_ID = Number(process.env.SOURCE_CHAIN_ID ?? manifest.source.chainId ?? "11155111");
const DEST_CHAIN_ID = Number(process.env.CREDITCOIN_CHAIN_ID ?? manifest.destination.chainId ?? manifest.chainId ?? "102031");
const SOURCE_RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEST_RPC = process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const FACTORY = process.env.FACTORY_ADDRESS ?? manifest.destination.factory;
const ADAPTER = process.env.DEX_ADAPTER_ADDRESS ?? manifest.destination.adapter;
const SOURCE_OBSERVER = process.env.MARKET_OBSERVER_ADDRESS ?? manifest.source.observer;
const SOURCE_POOL = process.env.SOURCE_POOL_ADDRESS ?? manifest.source.pool;
const PROOF_BUILDER_URL = process.env.CREDITCOIN_PROOF_BUILDER_URL;
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? "45000");
const CONFIRM_DELAY_MS = Number(process.env.CONFIRM_OBSERVATION_DELAY_MS ?? "15000");
const FACTORY_FROM_BLOCK = Number(process.env.FACTORY_DEPLOYMENT_BLOCK ?? manifest.destination.factoryDeploymentBlock ?? "0");
const MAX_TENANTS = Math.max(1, Number(process.env.MAX_TENANTS_PER_CYCLE ?? "50"));
const FACTORY_LOG_CHUNK = Math.max(1, Number(process.env.FACTORY_LOG_CHUNK_SIZE ?? "25000"));
const MAX_JIT_REBUILDS = 3;
const REASON_NONE = 0;
const REASON_AMOUNT_EXCEEDS_POLICY = 28;
const REASON_AMOUNT_MISMATCH = 29;

if (!process.env.AGENT_SUBMIT_PRIVATE_KEY) throw new Error("AGENT_SUBMIT_PRIVATE_KEY is required");
if (!PROOF_BUILDER_URL) throw new Error("CREDITCOIN_PROOF_BUILDER_URL is required");
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");

const sourceProvider = new ethers.JsonRpcProvider(SOURCE_RPC, SOURCE_CHAIN_ID, { staticNetwork: true });
const destinationProvider = new ethers.JsonRpcProvider(DEST_RPC, DEST_CHAIN_ID, { staticNetwork: true });
const agent = new ethers.Wallet(process.env.AGENT_SUBMIT_PRIVATE_KEY, destinationProvider);
const reporter = process.env.SEPOLIA_OBSERVER_PRIVATE_KEY
  ? new ethers.Wallet(process.env.SEPOLIA_OBSERVER_PRIVATE_KEY, sourceProvider)
  : null;
const factory = new ethers.Contract(FACTORY, factoryAbi, destinationProvider);
const adapter = new ethers.Contract(ADAPTER, [
  "function marketState() view returns(uint256 twapPriceE6,int24 arithmeticMeanTick,uint256 spotPriceE6,uint128 liquidity)",
  "function POOL_FEE() view returns(uint24)",
], destinationProvider);
const observer = new ethers.Contract(SOURCE_OBSERVER, observerAbi, reporter ?? sourceProvider);
const erc20 = ["function balanceOf(address) view returns(uint256)"];
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const proofBuilder = new proofProvider.service.ProofBuilder(
  SOURCE_CHAIN_KEY,
  PROOF_BUILDER_URL,
  Number(process.env.PROOF_BUILDER_TIMEOUT_MS ?? "120000"),
);
const chainInfo = new chainInfoNs.PrecompileChainInfoProvider(destinationProvider as never);
const blockProver = new blockProverNs.PrecompileBlockProver(destinationProvider as never);

const treasuryIndex: Address[] = [];
const indexedTreasuries = new Set<string>();
let nextFactoryBlock = FACTORY_FROM_BLOCK;
let tenantCursor = 0;

const log = (message: string, extra?: unknown) => {
  const prefix = `[schema-v1 ${new Date().toISOString()}] ${message}`;
  console.log(extra === undefined ? prefix : `${prefix} ${JSON.stringify(extra, bigintJson)}`);
};
const bigintJson = (_key: string, value: unknown) => typeof value === "bigint" ? value.toString() : value;
const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const asAddress = (value: string) => ethers.getAddress(value) as Address;
const asHex32 = (value: string) => value as Hex32;

interface Observation {
  blockHeight: bigint;
  priceE6: bigint;
  meanTick: bigint;
  spotSqrtPriceX96: bigint;
  liquidity: bigint;
  reporter: Address;
  transactionHash: string;
}

async function publishObservation(): Promise<Observation> {
  if (!reporter) throw new Error("SEPOLIA_OBSERVER_PRIVATE_KEY is required for continuous source heartbeat");
  const tx = await observer.observe();
  const receipt = await tx.wait();
  const event = receipt.logs.map((entry: ethers.Log) => {
    try { return observer.interface.parseLog(entry); } catch { return null; }
  }).find((entry: ethers.LogDescription | null) => entry?.name === "MarketPriceObserved");
  if (!event) throw new Error("MarketPriceObserved event missing from source observation receipt");
  const observation = {
    blockHeight: BigInt(receipt.blockNumber),
    priceE6: BigInt(event.args.priceE6),
    meanTick: BigInt(event.args.arithmeticMeanTick),
    spotSqrtPriceX96: BigInt(event.args.spotSqrtPriceX96),
    liquidity: BigInt(event.args.liquidity),
    reporter: asAddress(event.args.reporter),
    transactionHash: receipt.hash,
  };
  updateRuntimeHealth({
    lastSourceObservationAt: new Date().toISOString(),
    lastSourceObservationBlock: observation.blockHeight.toString(),
  });
  return observation;
}

async function proofFor(observation: Observation): Promise<AttestedProof> {
  await proofBuilder.waitUntilHeightAttested(SOURCE_CHAIN_KEY, Number(observation.blockHeight));
  await chainInfo.waitUntilHeightAttested(SOURCE_CHAIN_KEY, Number(observation.blockHeight));
  const result = await proofBuilder.getProof(observation.transactionHash);
  if (!result.success || !result.data) throw new Error(`Attestcoin proof generation failed for ${observation.transactionHash}`);
  const data = result.data;
  const proof: AttestedProof = {
    chainKey: data.chainKey,
    blockHeight: data.headerNumber,
    transactionIndex: data.txIndex,
    encodedTransaction: data.txBytes,
    merkleProof: data.merkleProof,
    continuityProof: data.continuityProof,
  };
  const valid = await blockProver.verifySingle(
    proof.chainKey, proof.blockHeight, proof.encodedTransaction,
    proof.merkleProof as never, proof.continuityProof as never,
  );
  if (!valid) throw new Error(`Attestcoin local proof verification failed for ${observation.transactionHash}`);
  updateRuntimeHealth({ lastProofBuiltAt: new Date().toISOString() });
  return proof;
}

async function refreshTreasuryIndex(): Promise<void> {
  const latest = await destinationProvider.getBlockNumber();
  if (nextFactoryBlock > latest) {
    updateRuntimeHealth({
      lastFactoryScanAt: new Date().toISOString(),
      indexedTreasuryCount: treasuryIndex.length,
    });
    return;
  }

  for (let from = nextFactoryBlock; from <= latest; from += FACTORY_LOG_CHUNK) {
    const to = Math.min(latest, from + FACTORY_LOG_CHUNK - 1);
    const events = await factory.queryFilter(factory.filters.TreasuryCreated(), from, to);
    for (const entry of events) {
      const event = entry as ethers.EventLog;
      const address = asAddress(event.args.treasury);
      const key = address.toLowerCase();
      if (indexedTreasuries.has(key)) continue;
      if (!(await factory.isFactoryTreasury(address))) continue;
      indexedTreasuries.add(key);
      treasuryIndex.push(address);
    }
    nextFactoryBlock = to + 1;
  }
  updateRuntimeHealth({
    lastFactoryScanAt: new Date().toISOString(),
    indexedTreasuryCount: treasuryIndex.length,
  });
}

async function discoverTreasuryBatch(): Promise<Address[]> {
  await refreshTreasuryIndex();
  if (treasuryIndex.length === 0) return [];

  const count = Math.min(MAX_TENANTS, treasuryIndex.length);
  const batch = Array.from({ length: count }, (_, i) => treasuryIndex[(tenantCursor + i) % treasuryIndex.length]);
  tenantCursor = (tenantCursor + count) % treasuryIndex.length;
  return batch;
}

function policyTuple(result: any) {
  return {
    universal: {
      enabledStrategies: Number(result.enabledStrategies), maxActionValueE6: BigInt(result.maxActionValueE6),
      maxSlippageBps: Number(result.maxSlippageBps), maxSourceDriftBps: Number(result.maxSourceDriftBps),
      maxSpotTwapDeviationBps: Number(result.maxSpotTwapDeviationBps), minSourceLiquidity: BigInt(result.minSourceLiquidity),
      minDestinationLiquidity: BigInt(result.minDestinationLiquidity), maxExecutionsPerEpoch: Number(result.maxExecutionsPerEpoch),
      epochLength: Number(result.epochLength), maxAttemptsPerEpoch: Number(result.maxAttemptsPerEpoch),
    },
  };
}

async function readMandate(treasuryAddress: Address): Promise<MandateSnapshot | null> {
  const treasury = new ethers.Contract(treasuryAddress, treasuryAbi, destinationProvider);
  const [registered, mode, policyHash, policyEpoch, wctc, stable, venue, u, a, r, risk] = await Promise.all([
    treasury.registeredAgents(agent.address), treasury.automationMode(), treasury.currentPolicyHash(), treasury.policyEpoch(),
    treasury.WCTC(), treasury.STABLE(), treasury.VENUE(), treasury.universalPolicy(), treasury.arbitragePolicy(), treasury.rebalancePolicy(), treasury.riskPolicy(),
  ]);
  if (!registered || Number(mode) !== AutomationMode.AUTONOMOUS) return null;
  const universal = policyTuple(u).universal;
  return {
    treasuryAddress,
    wctc: asAddress(wctc), stable: asAddress(stable), venue: asAddress(venue),
    policyHash: asHex32(policyHash), policyEpoch: BigInt(policyEpoch), automationMode: Number(mode), universal,
    arbitrage: { minNetEdgeBps: Number(a.minNetEdgeBps), maxArbitrageValueE6: BigInt(a.maxArbitrageValueE6) },
    rebalance: { targetWctcBps: Number(r.targetWctcBps), toleranceBps: Number(r.toleranceBps), maxRebalanceValueE6: BigInt(r.maxRebalanceValueE6) },
    risk: { maxWctcExposureBps: Number(risk.maxWctcExposureBps), maxRiskReductionValueE6: BigInt(risk.maxRiskReductionValueE6), dailyRiskReductionValueE6: BigInt(risk.dailyRiskReductionValueE6) },
  };
}

async function makeContext(
  mandate: MandateSnapshot,
  source: Observation,
  confirmation: Observation,
  sourceProof: AttestedProof,
  confirmationProof: AttestedProof,
): Promise<VerifiedContext> {
  const treasury = new ethers.Contract(mandate.treasuryAddress, treasuryAbi, destinationProvider);
  const wctc = new ethers.Contract(mandate.wctc, erc20, destinationProvider);
  const stable = new ethers.Contract(mandate.stable, erc20, destinationProvider);
  const destinationBlock = await destinationProvider.getBlockNumber();
  const [market, fee, wctcBalance, stableBalance, dailyUsed] = await Promise.all([
    adapter.marketState({ blockTag: destinationBlock }), adapter.POOL_FEE(),
    wctc.balanceOf(mandate.treasuryAddress, { blockTag: destinationBlock }),
    stable.balanceOf(mandate.treasuryAddress, { blockTag: destinationBlock }),
    treasury.riskReductionUsedByDay(BigInt(Math.floor(Date.now() / 86_400_000)), { blockTag: destinationBlock }),
  ]);
  const evidenceHash = hashEvidence({
    sourceChainKey: BigInt(SOURCE_CHAIN_KEY), sourceBlockHeight: source.blockHeight, sourceTxIndex: BigInt(sourceProof.transactionIndex),
    confirmBlockHeight: confirmation.blockHeight, confirmTxIndex: BigInt(confirmationProof.transactionIndex), immutableObserver: SOURCE_OBSERVER,
    immutableSourcePool: SOURCE_POOL, sourcePriceE6: source.priceE6, confirmPriceE6: confirmation.priceE6,
    sourceMeanTick: source.meanTick, confirmMeanTick: confirmation.meanTick, sourceLiquidity: source.liquidity, confirmLiquidity: confirmation.liquidity,
  });
  const sourceDomain: VerifiedSourceObservation = {
    chainKey: BigInt(SOURCE_CHAIN_KEY), blockHeight: source.blockHeight, transactionIndex: BigInt(sourceProof.transactionIndex), transactionHash: source.transactionHash,
    reporter: source.reporter, arithmeticMeanTick: source.meanTick, spotSqrtPriceX96: source.spotSqrtPriceX96, liquidity: source.liquidity, priceE6: source.priceE6,
  };
  const confirmationDomain: VerifiedSourceObservation = {
    chainKey: BigInt(SOURCE_CHAIN_KEY), blockHeight: confirmation.blockHeight, transactionIndex: BigInt(confirmationProof.transactionIndex), transactionHash: confirmation.transactionHash,
    reporter: confirmation.reporter, arithmeticMeanTick: confirmation.meanTick, spotSqrtPriceX96: confirmation.spotSqrtPriceX96, liquidity: confirmation.liquidity, priceE6: confirmation.priceE6,
  };
  const observationHash = asHex32(ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
    treasury: mandate.treasuryAddress, source: sourceDomain, confirmation: confirmationDomain,
    destination: { block: destinationBlock, twap: market.twapPriceE6, spot: market.spotPriceE6, liquidity: market.liquidity },
    portfolio: { wctcBalance, stableBalance, dailyUsed },
  }, bigintJson))));
  return {
    treasuryAddress: mandate.treasuryAddress,
    observationHash,
    evidence: { evidenceHash: asHex32(evidenceHash), source: sourceDomain, confirmation: confirmationDomain },
    destination: {
      readBlockNumber: BigInt(destinationBlock), twapPriceE6: BigInt(market.twapPriceE6), spotPriceE6: BigInt(market.spotPriceE6),
      arithmeticMeanTick: BigInt(market.arithmeticMeanTick), liquidity: BigInt(market.liquidity), poolFee: Number(fee),
    },
    portfolio: { readBlockNumber: BigInt(destinationBlock), wctcBalance: BigInt(wctcBalance), stableBalance: BigInt(stableBalance), dailyRiskReductionUsedE6: BigInt(dailyUsed) },
  };
}

function deriveCandidate(context: VerifiedContext, mandate: MandateSnapshot): Candidate | null {
  const coordinator = new StrategyCoordinator([
    new RiskReductionStrategy(), new RebalancingStrategy(), new ArbitrageStrategy(mandate.universal.maxSlippageBps),
  ]);
  return selectHighestPriorityCandidate(coordinator.evaluate(context, mandate));
}

async function decide(candidate: Candidate, strategy: number) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    contents: `A deterministic Fair Witness strategy engine produced this policy-bounded candidate from Attestcoin-verified cross-chain evidence:\n${JSON.stringify(candidate, bigintJson)}\nReturn EXECUTE only if acting now is sensible. You cannot change strategy, amount, direction, asset, venue, slippage, route, deadline or recipient.`,
    config: {
      systemInstruction: "You are an untrusted conservative financial decision proposer inside Fair Witness. Return only EXECUTE or WAIT plus rationale and short reason tags. Deterministic on-chain policy is the sole authority.",
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: { type: Type.OBJECT, properties: {
        decision: { type: Type.STRING }, strategy: { type: Type.INTEGER }, rationale: { type: Type.STRING }, reasonTags: { type: Type.ARRAY, items: { type: Type.STRING } },
      }, required: ["decision", "strategy", "rationale", "reasonTags"] },
    },
  });
  if (!response.text) throw new Error("AI returned no response");
  const parsed = parseAiDecision(JSON.parse(response.text));
  if (parsed.strategy !== strategy) throw new Error("AI attempted to change the deterministic strategy");
  return parsed;
}

function sameExecutionIntent(a: Candidate, b: Candidate): boolean {
  return a.strategy === b.strategy && a.direction === b.direction;
}

function makeProposal(candidate: Candidate, mandate: MandateSnapshot, decisionHash: Hex32, nonceOffset = 0n) {
  return buildProposal(candidate, mandate, {
    maxSlippageBps: candidate.strategy === 0 ? candidate.metrics.effectiveSlippageBps : mandate.universal.maxSlippageBps,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    nonce: BigInt(Date.now()) + nonceOffset,
    decisionHash,
  });
}

async function runTenant(
  mandate: MandateSnapshot,
  source: Observation,
  confirmation: Observation,
  sourceProof: AttestedProof,
  confirmationProof: AttestedProof,
) {
  const initialContext = await makeContext(mandate, source, confirmation, sourceProof, confirmationProof);
  const initialCandidate = deriveCandidate(initialContext, mandate);
  if (!initialCandidate) {
    log("WAIT no deterministic candidate", { treasury: mandate.treasuryAddress, evidenceHash: initialContext.evidence.evidenceHash });
    return;
  }

  const decision = await decide(initialCandidate, initialCandidate.strategy);
  if (decision.decision !== DecisionOutcome.EXECUTE) {
    const decisionHash = asHex32(ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ candidate: initialCandidate, decision }, bigintJson))));
    log("AI WAIT", { treasury: mandate.treasuryAddress, strategy: initialCandidate.strategy, rationale: decision.rationale, decisionHash });
    return;
  }

  const submitter = new PolicySubmitter(mandate.treasuryAddress, agent);
  let executionCandidate = initialCandidate;
  let executionContext = initialContext;

  for (let rebuild = 0; rebuild < MAX_JIT_REBUILDS; rebuild++) {
    executionContext = await makeContext(mandate, source, confirmation, sourceProof, confirmationProof);
    const refreshed = deriveCandidate(executionContext, mandate);
    if (!refreshed) {
      log("WAIT candidate disappeared before submission", {
        treasury: mandate.treasuryAddress,
        originalStrategy: initialCandidate.strategy,
        destinationBlock: executionContext.destination.readBlockNumber,
      });
      return;
    }
    if (!sameExecutionIntent(initialCandidate, refreshed)) {
      log("WAIT execution intent changed before submission", {
        treasury: mandate.treasuryAddress,
        originalStrategy: initialCandidate.strategy,
        refreshedStrategy: refreshed.strategy,
        originalDirection: initialCandidate.direction,
        refreshedDirection: refreshed.direction,
      });
      return;
    }
    executionCandidate = refreshed;

    const decisionHash = asHex32(ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
      initialCandidate,
      executionCandidate,
      decision,
      destinationBlock: executionContext.destination.readBlockNumber,
    }, bigintJson))));
    const proposal = makeProposal(executionCandidate, mandate, decisionHash, BigInt(rebuild));
    const preview = await submitter.preview(proposal, sourceProof, confirmationProof);

    if (preview.reason === REASON_AMOUNT_EXCEEDS_POLICY || preview.reason === REASON_AMOUNT_MISMATCH) {
      log("JIT state changed; rebuilding proposal", {
        treasury: mandate.treasuryAddress,
        strategy: executionCandidate.strategy,
        previewReason: preview.reason,
        rebuild: rebuild + 1,
        destinationBlock: executionContext.destination.readBlockNumber,
      });
      continue;
    }

    if (preview.reason !== REASON_NONE) {
      log("WAIT on-chain preflight rejected proposal", {
        treasury: mandate.treasuryAddress,
        strategy: executionCandidate.strategy,
        previewReason: preview.reason,
        destinationBlock: executionContext.destination.readBlockNumber,
      });
      return;
    }

    const result = await submitter.submit(proposal, sourceProof, confirmationProof);
    updateRuntimeHealth({ lastProposalResolvedAt: new Date().toISOString() });
    log("proposal resolved", {
      treasury: mandate.treasuryAddress,
      strategy: executionCandidate.strategy,
      decision: decision.decision,
      rationale: decision.rationale,
      preflightReason: preview.reason,
      destinationBlock: executionContext.destination.readBlockNumber,
      ...result,
    });
    return;
  }

  log("WAIT JIT rebuild limit reached; refusing stale broadcast", {
    treasury: mandate.treasuryAddress,
    strategy: executionCandidate.strategy,
    decision: decision.decision,
    rationale: decision.rationale,
    destinationBlock: executionContext.destination.readBlockNumber,
    jitRebuilds: MAX_JIT_REBUILDS,
  });
}

async function runMarketQueue(
  mandates: MandateSnapshot[],
  source: Observation,
  confirmation: Observation,
  sourceProof: AttestedProof,
  confirmationProof: AttestedProof,
) {
  for (const mandate of mandates) {
    try {
      await runTenant(mandate, source, confirmation, sourceProof, confirmationProof);
    } catch (error) {
      log("tenant cycle failed; continuing", { treasury: mandate.treasuryAddress, error: String(error) });
    }
  }
}

async function cycle() {
  updateRuntimeHealth({ lastCycleStartedAt: new Date().toISOString(), lastError: null });
  const sourceNetwork = await sourceProvider.getNetwork();
  const destNetwork = await destinationProvider.getNetwork();
  if (Number(sourceNetwork.chainId) !== SOURCE_CHAIN_ID || Number(destNetwork.chainId) !== DEST_CHAIN_ID) throw new Error("RPC chain id mismatch");
  const supported = await chainInfo.getSupportedChainByKey(SOURCE_CHAIN_KEY);
  if (!supported) throw new Error(`Attestcoin source chain key ${SOURCE_CHAIN_KEY} is not supported`);

  const treasuries = await discoverTreasuryBatch();
  const mandates = (await Promise.all(treasuries.map(async (address) => {
    try { return await readMandate(address); }
    catch (error) { log("treasury read failed", { address, error: String(error) }); return null; }
  }))).filter((value): value is MandateSnapshot => value !== null);
  log("eligible autonomous treasuries", {
    discovered: treasuryIndex.length,
    scheduled: treasuries.length,
    eligible: mandates.length,
    nextCursor: tenantCursor,
  });
  if (mandates.length === 0) {
    updateRuntimeHealth({ lastSuccessfulCycleAt: new Date().toISOString() });
    return;
  }

  const source = await publishObservation();
  await sleep(CONFIRM_DELAY_MS);
  const confirmation = await publishObservation();
  if (confirmation.blockHeight <= source.blockHeight) throw new Error("confirmation observation did not advance the source chain");
  const [sourceProof, confirmationProof] = await Promise.all([proofFor(source), proofFor(confirmation)]);

  // One queue per mutable destination market. This deployment has one configured adapter/pool,
  // so writes are intentionally serialized: each treasury observes the state left by the prior one.
  await runMarketQueue(mandates, source, confirmation, sourceProof, confirmationProof);
  updateRuntimeHealth({ lastSuccessfulCycleAt: new Date().toISOString() });
}

async function main() {
  log("starting schema-v1 product runner", {
    agent: agent.address,
    factory: FACTORY,
    observer: SOURCE_OBSERVER,
    sourceChainKey: SOURCE_CHAIN_KEY,
    maxTenantsPerCycle: MAX_TENANTS,
  });
  while (true) {
    try {
      await cycle();
    } catch (error) {
      const message = String(error);
      updateRuntimeHealth({ lastError: message });
      log("cycle failed; will retry", { error: message });
    }
    await sleep(POLL_MS);
  }
}

void main().catch((error) => {
  updateRuntimeHealth({ lastError: String(error) });
  console.error("Fatal schema-v1 runner error", error);
  process.exit(1);
});
