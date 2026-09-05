import { describe, it, expect, vi } from "vitest";
import type { AttestcoinClient, AttestedProof } from "../src/attestcoinClient.js";
import type { SepoliaWatcher, PriceObservation } from "../src/sepoliaWatcher.js";
import type { DecisionInput, Decision } from "../src/decisionEngine.js";
import type { ReasoningPayload } from "../src/reasoningStore.js";
import { buildCycleProofs, runTenantCycle, type CycleProofs, type TenantRuntime } from "../src/tenantRunner.js";
import { factKey, deterministicNonce } from "../src/keys.js";
import { TradeDirection } from "../src/dexPriceReader.js";

// Deterministic coverage of the multi-tenant core loop (docs/ARCHITECTURE_V2 §3.1):
//   - fact-scoped proofs are built ONCE regardless of tenant count;
//   - each tenant gets its OWN fresh price read, decision (calibrated to THEIR
//     guardrails), reasoning payload, and submission against THAT instance.
// The real shared types are used throughout; only the expensive/network classes are
// mocked via `as unknown as` casts.

const AGENT = "0x2404Ed7251fAecb2981886BA1d2A88060D4ef3d2";
// A valid bytes32 fact for tests that construct CycleProofs by hand (actionKey
// encodes fact as bytes32, so "0xf" is rejected by ethers).
const FACT32 = "0x" + "ab".repeat(32);

function makeProof(tx: string, height: number, index: number): AttestedProof {
  return {
    chainKey: 1,
    blockHeight: height,
    transactionIndex: index,
    encodedTransaction: "0x" + tx.slice(2),
    merkleProof: {},
    continuityProof: {},
  };
}

function makeShared(state: {
  sourceObs?: PriceObservation | null;
  confirmObs?: PriceObservation | null;
  decisions?: Decision[];
  proofFor?: (tx: string) => AttestedProof | undefined;
} = {}) {
  const sourceObs =
    state.sourceObs === undefined
      ? ({ blockHeight: 1_000_000, transactionIndex: 0, transactionHash: "0xsource", price: 1_010_000n } as PriceObservation)
      : state.sourceObs;
  const confirmObs =
    state.confirmObs === undefined
      ? ({ blockHeight: 1_000_003, transactionIndex: 0, transactionHash: "0xconfirm", price: 1_011_000n } as PriceObservation)
      : state.confirmObs;
  const proofFor =
    state.proofFor === undefined
      ? ((tx: string) =>
          tx === "0xsource"
            ? makeProof(tx, sourceObs.blockHeight, sourceObs.transactionIndex)
            : tx === "0xconfirm"
              ? makeProof(tx, confirmObs.blockHeight, confirmObs.transactionIndex)
              : undefined)
      : state.proofFor;

  const watcher = {
    pollLatest: vi.fn(async () => sourceObs),
    pollAt: vi.fn(async () => confirmObs),
  } as unknown as SepoliaWatcher;

  const attestcoin = {
    waitUntilReady: vi.fn(async () => undefined),
    buildProof: vi.fn(async (tx: string) => {
      const p = proofFor(tx);
      if (!p) throw new Error(`no mock proof for ${tx}`);
      return p;
    }),
    submitterAddress: AGENT,
  } as unknown as AttestcoinClient;

  const decisions = state.decisions ?? [];
  const decisionEngine = {
    decide: vi.fn(async (input: DecisionInput): Promise<Decision> => decisions.shift() ?? { act: false, direction: null, rationale: "default" }),
  } as unknown as import("../src/decisionEngine.js").DecisionEngine;

  const reasoningStore = {
    put: vi.fn(async (p: ReasoningPayload) => `0xhash-${p.sourcePrice}`),
  } as unknown as import("../src/reasoningStore.js").ReasoningStore;

  return { watcher, attestcoin, decisionEngine, reasoningStore, mocks: { watcher, attestcoin, decisionEngine, reasoningStore } };
}

function makeRuntime(overrides: Partial<TenantRuntime> = {}): TenantRuntime {
  return {
    config: { label: "tenant-a", treasuryAddress: "0x13CACe3989b295048De47C68F32Ff3d844AC2026" },
    guardrails: {
      owner: "0xd1D4020279C86e41FE688A1D7F31f7F8436A1C77",
      maxTradeSize: 5_000_000n,
      maxSlippageBps: 150n,
      minArbWidthBps: 80n,
      maxDriftBps: 100n,
      maxConfirmGapBlocks: 20n,
      maxActionsPerEpoch: 6n,
      epochLength: 86_400n,
    },
    dexReader: {
      currentPrice: vi.fn(async () => 996_000n),
    } as unknown as TenantRuntime["dexReader"],
    submitter: {
      alreadyExecuted: vi.fn(async () => false),
      submit: vi.fn(async () => ({ actionKey: "0xaction", txHash: "0xtx" })),
    } as unknown as TenantRuntime["submitter"],
    ...overrides,
  };
}
describe("buildCycleProofs", () => {
  it("returns null when there is no fresh observation (each tenant waits for the next)", async () => {
    const shared = makeShared({ sourceObs: null });
    expect(await buildCycleProofs(shared, undefined, () => undefined)).toBeNull();
    expect(shared.mocks.attestcoin.waitUntilReady).not.toHaveBeenCalled();
  });

  it("applies the local pre-filter BEFORE any proof work", async () => {
    const shared = makeShared({
      sourceObs: { blockHeight: 1, transactionIndex: 0, transactionHash: "0xnarrow", price: 998_000n },
    });
    const estimateReader = {
      currentPrice: vi.fn(async () => 997_000n), // ~10bps below source — pre-filter rejects
    } as unknown as TenantRuntime["dexReader"];
    const result = await buildCycleProofs(shared, estimateReader, () => undefined);
    // 998000 vs 997000 is ~10bps < MIN_ARB_WIDTH_BPS_LOCAL_ESTIMATE (80) -> skipped
    expect(result).toBeNull();
    expect(shared.mocks.attestcoin.waitUntilReady).not.toHaveBeenCalled();
    expect(shared.mocks.attestcoin.buildProof).not.toHaveBeenCalled();
  });

  it("builds BOTH proofs once and derives fact/nonce/agentAddress", async () => {
    const shared = makeShared();
    const result = (await buildCycleProofs(shared, undefined, () => undefined)) as CycleProofs;

    expect(result).not.toBeNull();
    // Guardrails of the factory shape: fact = keccak(chainKey, block, txIndex) as on-chain.
    const expectedFact = factKey(1, 1_000_000, 0);
    expect(result.fact).toBe(expectedFact);
    const expectedNonce = deterministicNonce(expectedFact, 1_010_000n, 1_011_000n);
    expect(result.nonce).toBe(expectedNonce);
    expect(result.agentAddress).toBe(AGENT);
    expect(shared.mocks.attestcoin.buildProof).toHaveBeenCalledTimes(2);
    expect(shared.mocks.attestcoin.buildProof).toHaveBeenCalledWith("0xsource");
    expect(shared.mocks.attestcoin.buildProof).toHaveBeenCalledWith("0xconfirm");
    // attestation waited on BOTH the source height and the confirm height
    expect(shared.mocks.attestcoin.waitUntilReady).toHaveBeenCalledWith(1_000_000);
    expect(shared.mocks.attestcoin.waitUntilReady).toHaveBeenCalledWith(1_000_003);
  });

  it("skips when there is no observation at the confirmation height", async () => {
    const shared = makeShared({ confirmObs: null });
    expect(await buildCycleProofs(shared, undefined, () => undefined)).toBeNull();
  });

  it("waits for the attestation of the confirmation event's OWN height, not just the target (422 race regression)", async () => {
    // pollAt() scans [target, target+5]; when the first event sits ABOVE the target
    // (here source+7 while the target is source+3), the prover cannot serve a proof
    // for it until ITS block is attested — the live run 422'd exactly here.
    const shared = makeShared({
      confirmObs: {
        blockHeight: 1_000_007,
        transactionIndex: 2,
        transactionHash: "0xconfirm",
        price: 1_011_000n,
      } as PriceObservation,
    });
    const result = (await buildCycleProofs(shared, undefined, () => undefined)) as CycleProofs;

    expect(result).not.toBeNull();
    expect(result?.confirmProof.blockHeight).toBe(1_000_007);
    expect(shared.mocks.attestcoin.waitUntilReady).toHaveBeenCalledWith(1_000_000); // source
    expect(shared.mocks.attestcoin.waitUntilReady).toHaveBeenCalledWith(1_000_003); // target (block must exist to be polled)
    expect(shared.mocks.attestcoin.waitUntilReady).toHaveBeenCalledWith(1_000_007); // the height actually proven
  });
});

describe("runTenantCycle", () => {
  const shared = makeShared({ decisions: [{ act: true, direction: TradeDirection.BuyBaseForQuote, rationale: "go" }] });
  const runtime = makeRuntime();

  it("re-reads the destination price fresh (no stale cycle-wide quote) and calibrates to the tenant's guardrails", async () => {
    const stateDecisions = [{ act: true, direction: TradeDirection.BuyBaseForQuote, rationale: "go" }];
    const s = makeShared({ decisions: stateDecisions });
    const r = makeRuntime({ dexReader: {
      currentPrice: vi.fn(async () => 1_000_000n),
    } as unknown as TenantRuntime["dexReader"] });

    await runTenantCycle(r, s, {
      sourceObservationPrice: 1_010_000n,
      confirmObservationPrice: 1_011_000n,
      sourceProof: makeProof("0xsource", 1_000_000, 0),
      confirmProof: makeProof("0xconfirm", 1_000_003, 0),
      fact: FACT32,
      nonce: 42n,
      agentAddress: AGENT,
    }, () => undefined);

    // gap = 1.1% vs confirm price -> ~110bps, and the decision must carry THIS tenant's guardrails
    const input = s.mocks.decisionEngine.decide.mock.calls[0][0] as unknown as Parameters<import("../src/decisionEngine.js").DecisionEngine["decide"]>[0];
    expect(input.guardrails.maxTradeSize).toBe(5_000_000n);
    expect(input.guardrails.minArbWidthBps).toBe(80n);
    // Task 3.4: gapBps is the gross window NET of the 25bps platform reserve
    // (edgeBps mirrors ASCTreasuryJournal.MIN_NET_EDGE_BPS), so the old gross
    // range [100, 130] shifts down by 25.
    expect(input.gapBps).toBeGreaterThanOrEqual(75);
    expect(input.gapBps).toBeLessThanOrEqual(105);
    // fresh dest price, NOT a cycle-wide constant shared with other tenants
    expect(s.mocks.decisionEngine.decide).toHaveBeenCalledTimes(1);
  });

  it("skips without calling the LLM when the action was already executed on THIS instance", async () => {
    const s = makeShared();
    const r = makeRuntime({
      submitter: {
        alreadyExecuted: vi.fn(async () => true),
        submit: vi.fn(async () => ({ actionKey: "0xaction", txHash: "0xtx" })),
      } as unknown as TenantRuntime["submitter"],
    });
    await runTenantCycle(r, s, {
      sourceObservationPrice: 1_010_000n,
      confirmObservationPrice: 1_011_000n,
      sourceProof: makeProof("0xsource", 1_000_000, 0),
      confirmProof: makeProof("0xconfirm", 1_000_003, 0),
      fact: FACT32,
      nonce: 42n,
      agentAddress: AGENT,
    }, () => undefined);
    expect(s.mocks.decisionEngine.decide).not.toHaveBeenCalled();
    expect(s.mocks.reasoningStore.put).not.toHaveBeenCalled();
  });

  it("stores a per-tenant reasoning payload and submits when the LLM says act", async () => {
    const s = makeShared({ decisions: [{ act: true, direction: TradeDirection.BuyBaseForQuote, rationale: "positive arb" }] });
    const submit = vi.fn(async () => ({ actionKey: "0xactionkey", txHash: "0xtxhash" }));
    const r = makeRuntime({ submitter: {
      alreadyExecuted: vi.fn(async () => false),
      submit,
    } as unknown as TenantRuntime["submitter"] });
    const log = vi.fn();

    await runTenantCycle(r, s, {
      sourceObservationPrice: 1_010_000n,
      confirmObservationPrice: 1_011_000n,
      sourceProof: makeProof("0xsource", 1_000_000, 0),
      confirmProof: makeProof("0xconfirm", 1_000_003, 0),
      fact: FACT32,
      nonce: 42n,
      agentAddress: AGENT,
    }, log);

    expect(s.mocks.reasoningStore.put).toHaveBeenCalledTimes(1);
    const payload = s.mocks.reasoningStore.put.mock.calls[0][0] as ReasoningPayload;
    expect(payload.sourcePrice).toBe("1010000");
    expect(payload.confirmPrice).toBe("1011000");
    expect(payload.llmRationale).toBe("positive arb");
    // Task 3.3: the reasoning payload commits to the proposed direction too, and the
    // submission carries the direction the contract will validate against the prices.
    expect(payload.direction).toBe("BuyBaseForQuote");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].chainKey).toBe(1);
    expect(submit.mock.calls[0][2]).toBe(42n);
    expect(submit.mock.calls[0][4]).toBe(TradeDirection.BuyBaseForQuote);
    expect(s.mocks.decisionEngine.decide.mock.calls[0][0].guardrails.owner).toBe(r.guardrails.owner);
  });

  it("does NOT submit when the LLM declines (contract bounds are a floor, not a target)", async () => {
    const s = makeShared({ decisions: [{ act: false, direction: null, rationale: "too marginal" }] });
    const submit = vi.fn(async () => ({ actionKey: "0xaction", txHash: "0xtx" }));
    const r = makeRuntime({ submitter: {
      alreadyExecuted: vi.fn(async () => false),
      submit,
    } as unknown as TenantRuntime["submitter"] });

    await runTenantCycle(r, s, {
      sourceObservationPrice: 1_010_000n,
      confirmObservationPrice: 1_011_000n,
      sourceProof: makeProof("0xsource", 1_000_000, 0),
      confirmProof: makeProof("0xconfirm", 1_000_003, 0),
      fact: FACT32,
      nonce: 42n,
      agentAddress: AGENT,
    }, () => undefined);

    expect(submit).not.toHaveBeenCalled();
    // the reasoning is still stored, even for a rejection (journaled off-chain)
    expect(s.mocks.reasoningStore.put).toHaveBeenCalledTimes(1);
  });

  it("a contract-side rejection is logged, not thrown (one tenant's revert must not stop the others)", async () => {
    const s = makeShared({ decisions: [{ act: true, direction: TradeDirection.BuyBaseForQuote, rationale: "go" }] });
    const log = vi.fn();
    const r = makeRuntime({ submitter: {
      alreadyExecuted: vi.fn(async () => false),
      submit: vi.fn(async () => { throw new Error("NotRegisteredAgent"); }),
    } as unknown as TenantRuntime["submitter"] });

    await expect(
      runTenantCycle(r, s, {
        sourceObservationPrice: 1_010_000n,
        confirmObservationPrice: 1_011_000n,
        sourceProof: makeProof("0xsource", 1_000_000, 0),
        confirmProof: makeProof("0xconfirm", 1_000_003, 0),
        fact: FACT32,
        nonce: 42n,
        agentAddress: AGENT,
      }, log)
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Rejected by contract"));
  });
});

// vim: et ts=2 sw=2
