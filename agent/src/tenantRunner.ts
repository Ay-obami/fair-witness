import { ethers } from "ethers";
import { config } from "./config.js";
import type { SepoliaWatcher } from "./sepoliaWatcher.js";
import type { AttestcoinClient, AttestedProof } from "./attestcoinClient.js";
import type { DecisionEngine } from "./decisionEngine.js";
import type { ReasoningStore } from "./reasoningStore.js";
import { TreasurySubmitter } from "./submitter.js";
import { DexPriceReader, bpsGap, directionFor, edgeBps, TradeDirection } from "./dexPriceReader.js";
import { factKey, deterministicNonce, actionKey } from "./keys.js";
import { readTreasuryGuardrails, type TreasuryGuardrails } from "./treasuryGuardrails.js";
import type { TenantConfig } from "./tenants.js";

export type Logger = (msg: string) => void;

/** Everything shared across tenants in one agent process (fact-scoped, not tenant-scoped). */
export interface SharedDeps {
  watcher: SepoliaWatcher;
  attestcoin: AttestcoinClient;
  decisionEngine: DecisionEngine;
  reasoningStore: ReasoningStore;
}

/** Everything scoped to ONE tenant's instance. Never shared across tenants. */
export interface TenantRuntime {
  config: TenantConfig;
  guardrails: TreasuryGuardrails;
  dexReader: DexPriceReader;
  submitter: TreasurySubmitter;
}

/**
 * Builds one tenant's runtime by reading THAT instance's own immutables from chain —
 * guardrails AND the DEX/asset configuration. The agent can therefore never drift out of
 * sync with what a given instance actually trades, and two tenants on the same factory
 * automatically share the canonical chain config (it's identical on-chain), while a
 * hand-deployed instance with different config would still be read correctly.
 */
export async function createTenantRuntime(
  tenantConfig: TenantConfig,
  provider: ethers.JsonRpcProvider,
  signer: ethers.Wallet,
  log: Logger = console.log
): Promise<TenantRuntime> {
  const { treasuryAddress, label } = tenantConfig;
  const guardrails = await readTreasuryGuardrails(provider, treasuryAddress);

  const treasuryReadOnly = new ethers.Contract(
    treasuryAddress,
    [
      "function DEX_ROUTER() view returns (address)",
      "function BASE_ASSET() view returns (address)",
      "function QUOTE_ASSET() view returns (address)",
    ],
    provider
  );
  const [routerAddress, baseAsset, quoteAsset] = await Promise.all([
    treasuryReadOnly.DEX_ROUTER(),
    treasuryReadOnly.BASE_ASSET(),
    treasuryReadOnly.QUOTE_ASSET(),
  ]);

  const submitter = new TreasurySubmitter(signer);
  submitter.setTreasuryAddress(treasuryAddress);

  log(
    `[${label}] runtime ready: instance=${treasuryAddress} ` +
      `guardrails(maxTradeSize=${guardrails.maxTradeSize}, slippage=${guardrails.maxSlippageBps}bps, ` +
      `width=${guardrails.minArbWidthBps}bps, drift=${guardrails.maxDriftBps}bps, ` +
      `gap=${guardrails.maxConfirmGapBlocks} blocks, rate=${guardrails.maxActionsPerEpoch}/${guardrails.epochLength}s)`
  );

  return {
    config: tenantConfig,
    guardrails,
    dexReader: new DexPriceReader(routerAddress, baseAsset, quoteAsset, provider),
    submitter,
  };
}

/**
 * The fact-scoped part of a cycle, done ONCE regardless of tenant count: poll the source
 * chain, wait out the attestation windows, and build both proofs. Proof generation is the
 * expensive path (prover round trips + waiting for attestations) and a proof proves a
 * SOURCE-CHAIN fact — it is not tenant-specific, so it is built once and submitted against
 * each tenant's own instance (docs/ARCHITECTURE_V2.md §3: "submits proofs per user against
 * THAT user's contract only").
 *
 * `estimateReader`: any one tenant's DexPriceReader, used ONLY for the pre-flight gap
 * filter. Factory-deployed instances share the same canonical DEX config, so any one of
 * them gives the same estimate; a hand-deployed instance with different config would make
 * it approximate — acceptable, because the filter is a gas-saver, never the authority
 * (see submitter.ts's distinction between pre-flight and the on-chain guarantee).
 */
export interface CycleProofs {
  sourceObservationPrice: bigint;
  confirmObservationPrice: bigint;
  sourceProof: AttestedProof;
  confirmProof: AttestedProof;
  fact: string;
  nonce: bigint;
  /** Same for every tenant: the agent submit address is the platform key (arch §6). */
  agentAddress: string;
}

export async function buildCycleProofs(
  shared: SharedDeps,
  estimateReader?: DexPriceReader,
  log: Logger = console.log
): Promise<CycleProofs | null> {
  const observation = await shared.watcher.pollLatest();
  if (!observation) return null;

  // Local pre-filter only — saves the whole proof path on an obviously too-narrow gap.
  // When running multi-tenant, MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE should be set to the
  // LOOSEST tenant's floor: a gap Tenant B (120bps floor) would reject may still be
  // actionable for Tenant A (80bps floor), so the filter must never be tighter than the
  // loosest tenant. Per-tenant precision comes from each contract + the LLM, not here.
  if (estimateReader) {
    const destPrice = await estimateReader.currentPrice();
    const gap = bpsGap(observation.price, destPrice);
    if (gap < config.minArbWidthBpsLocalEstimate) {
      log(
        `Gap ${gap}bps < local estimate ${config.minArbWidthBpsLocalEstimate}bps — skipping before any proof work (pre-flight filter only; the contract's MIN_ARB_WIDTH_BPS is the real bound).`
      );
      return null;
    }
  }

  log(`Waiting for source block ${observation.blockHeight} to be attested...`);
  await shared.attestcoin.waitUntilReady(observation.blockHeight);

  const sourceProof = await shared.attestcoin.buildProof(observation.transactionHash);
  const fact = factKey(sourceProof.chainKey, sourceProof.blockHeight, sourceProof.transactionIndex);

  const targetConfirmHeight = observation.blockHeight + config.confirmGapTargetBlocks;
  log(`Waiting for block ${targetConfirmHeight} to be attested for the confirmation proof...`);
  await shared.attestcoin.waitUntilReady(targetConfirmHeight);

  const confirmObservation = await shared.watcher.pollAt(targetConfirmHeight);
  if (!confirmObservation) {
    log("No new observation at the confirmation height — skipping this cycle.");
    return null;
  }
  // pollAt() scans [target, target+5] and returns the FIRST event, which can sit up to 5
  // blocks ABOVE the target. The prover can only serve a tx proof once ITS OWN block is
  // attested — waiting only for the target height then asking for a tx in a higher,
  // not-yet-attested block deterministically fails with a 422 (observed live 2026-09-02,
  // confirmation event at source+7 while only source+3 was attested). So wait for the
  // height we will actually prove; it is >= target, so the contract's confirm-gap bound
  // still holds, and when the event sits exactly at the target this call is a no-op.
  if (confirmObservation.blockHeight !== targetConfirmHeight) {
    log(
      `Confirmation event found at block ${confirmObservation.blockHeight} (target was ${targetConfirmHeight}) — waiting for that block's attestation before proof generation...`
    );
    await shared.attestcoin.waitUntilReady(confirmObservation.blockHeight);
  }
  const confirmProof = await shared.attestcoin.buildProof(confirmObservation.transactionHash);

  const nonce = deterministicNonce(fact, observation.price, confirmObservation.price);

  return {
    sourceObservationPrice: observation.price,
    confirmObservationPrice: confirmObservation.price,
    sourceProof,
    confirmProof,
    fact,
    nonce,
    agentAddress: shared.attestcoin.submitterAddress,
  };
}

/**
 * Per-tenant half of a cycle: fresh destination price read (a prior tenant's execution
 * MOVES the shared pool's price, so each tenant's decision must see the post-trade
 * state, not a stale cycle-wide quote), per-instance replay pre-flight, per-tenant LLM
 * decision calibrated to THAT tenant's immutable guardrails, per-tenant reasoning payload,
 * submission to THAT instance only.
 */
export async function runTenantCycle(
  runtime: TenantRuntime,
  shared: SharedDeps,
  proofs: CycleProofs,
  log: Logger = console.log
): Promise<void> {
  const { label, treasuryAddress } = runtime.config;
  // Task 3.1 mirror: key = f(instance, fact, actionType) — no agent address, no
  // nonce (see keys.ts; must match ASCTreasuryJournal.executeArbitrage exactly).
  const key = actionKey(treasuryAddress, proofs.fact);

  const destPriceNow = await runtime.dexReader.currentPrice();
  // Task 3.5 mirror: direction + edge derive from the SAME price-sign rule the
  // contract enforces (dexPriceReader.directionFor/edgeBps mirror it exactly), so the
  // agent's pre-flight estimate can never drift from the on-chain computation.
  const direction = directionFor(proofs.confirmObservationPrice, destPriceNow);
  const finalGap = direction !== null ? edgeBps(proofs.confirmObservationPrice, destPriceNow, direction) : 0;

  // Pre-flight replay check is PER INSTANCE — executedActions lives in each instance's
  // own storage, so the same actionKey can legitimately be executed on every tenant.
  if (await runtime.submitter.alreadyExecuted(key)) {
    log(`[${label}] action ${key} already executed on this instance — skipping.`);
    return;
  }

  const decision = await shared.decisionEngine.decide({
    srcPrice: proofs.sourceObservationPrice,
    confPrice: proofs.confirmObservationPrice,
    destPrice: destPriceNow,
    gapBps: finalGap,
    guardrails: runtime.guardrails,
  });

  log(`[${label}] LLM decision: act=${decision.act} — "${decision.rationale}"`);

  const decisionHash = await shared.reasoningStore.put({
    observedGapBps: finalGap,
    sourcePrice: proofs.sourceObservationPrice.toString(),
    confirmPrice: proofs.confirmObservationPrice.toString(),
    destPrice: destPriceNow.toString(),
    rule: "R-ARB-1",
    llmRationale: decision.rationale,
    // Task 3.3: the committed decision context now includes the proposed direction
    // (the human-readable enum name; undefined on a zero gap, which the serializer
    // omits so pre-direction payloads still hash-verify identically).
    direction: direction !== null ? TradeDirection[direction] : undefined,
    timestamp: new Date().toISOString(),
  });

  if (!decision.act) {
    log(`[${label}] LLM recommended not acting — no submission made. (The contract's bounds are a floor, not a target; the LLM may decline even when the contract would technically allow it.)`);
    return;
  }

  // Task 3.3: a decision to act MUST carry a direction. A zero gap leaves none the
  // evidence could support — decline defensively rather than submit something the
  // contract would revert (WrongTradeDirection / ArbitrageWindowTooNarrow).
  if (direction === null) {
    log(`[${label}] Zero gap — no trade direction the evidence supports; not submitting.`);
    return;
  }

  try {
    const result = await runtime.submitter.submit(
      proofs.sourceProof,
      proofs.confirmProof,
      proofs.nonce,
      decisionHash,
      direction
    );
    log(`[${label}] Executed (${TradeDirection[direction]}) actionKey=${result.actionKey} tx=${result.txHash}`);
  } catch (err) {
    // Expected reverts (stale, too-narrow, rate-limited, replay, unregistered) are the
    // rigid business logic working as designed, not agent failures — see DEVLOG.md.
    log(`[${label}] Rejected by contract (expected if stale/narrow/rate-limited/replayed): ${err}`);
  }
}