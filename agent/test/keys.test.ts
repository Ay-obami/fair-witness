import { describe, it, expect } from "vitest";
import { factKey, deterministicNonce, actionKey, ActionType } from "../src/keys.js";

describe("factKey", () => {
  it("matches the ground truth computed via `cast keccak(abi-encode(...))` — confirms exact parity with ASCTreasuryJournal._factKey", () => {
    // Ground truth: `cast keccak "$(cast abi-encode 'f(uint64,uint64,uint32)' 1 1000000 0)"`
    const expected = "0xff19e9ab7685bf0c8875f27f9fd89f94a7175b87f7c7f98d4a2aa1e3aca54521".slice(0, 66);
    const result = factKey(1, 1_000_000, 0);
    expect(result).toBe(expected);
  });

  it("is deterministic — same inputs always produce the same key", () => {
    const a = factKey(1, 42, 0);
    const b = factKey(1, 42, 0);
    expect(a).toBe(b);
  });

  it("differs when any input differs (chainKey, blockHeight, txIndex)", () => {
    const base = factKey(1, 42, 0);
    expect(factKey(2, 42, 0)).not.toBe(base);
    expect(factKey(1, 43, 0)).not.toBe(base);
    expect(factKey(1, 42, 1)).not.toBe(base);
  });
});

describe("deterministicNonce", () => {
  const fact = factKey(1, 1_000_000, 0);

  it("matches the ground truth computed via cast — confirms parity with the PRD's nonce formula", () => {
    // Ground truth: `cast keccak "$(cast abi-encode 'f(bytes32,uint8,uint256,uint256)' <fact> 0 1005000 1010000)"`
    const expected = "0x579d92fdb02c658f3b9dc010bfb9e9bda424bc052c07c9164987a9ba73740ea3".slice(0, 66);
    const nonce = deterministicNonce(fact, 1_005_000n, 1_010_000n);
    expect("0x" + nonce.toString(16)).toBe(expected);
  });

  it("reproduces the identical nonce on a simulated crash-and-retry (same fact, same prices)", () => {
    // This is the actual safety property the whole replay-safety design depends on: an
    // agent that crashes after submitting and restarts must re-derive the SAME nonce
    // from the same fact, not a fresh/random one, or the on-chain replay guard can't
    // catch the duplicate. See contracts/test/ASCTreasuryJournal.t.sol's
    // test_RevertOnDeterministicNonceRetryAfterSimulatedCrash for the on-chain half.
    const run1 = deterministicNonce(fact, 1_005_000n, 1_010_000n);
    const run2 = deterministicNonce(fact, 1_005_000n, 1_010_000n); // simulates independent re-derivation
    expect(run1).toBe(run2);
  });

  it("produces a different nonce if the observed prices differ even slightly", () => {
    const a = deterministicNonce(fact, 1_005_000n, 1_010_000n);
    const b = deterministicNonce(fact, 1_005_001n, 1_010_000n);
    expect(a).not.toBe(b);
  });
});

describe("actionKey", () => {
  it("is deterministic and varies with agent address and nonce", () => {
    const fact = factKey(1, 1_000_000, 0);
    const agentA = "0xDB9406adBebe07c3D6A8B310f3De1f330769Bb94";
    const agentB = "0x831b83deA6C70A2B52AEdD07C28F4f87a3EfC0cD";

    const k1 = actionKey(fact, agentA, 42n);
    const k2 = actionKey(fact, agentA, 42n);
    const k3 = actionKey(fact, agentB, 42n);
    const k4 = actionKey(fact, agentA, 43n);

    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);
  });
});

describe("ActionType enum ordering", () => {
  it("matches the Solidity contract's enum order exactly (ARBITRAGE must be 0)", () => {
    // If this ever drifts from ASCTreasuryJournal.sol's `enum ActionType`, every
    // actionKey computed off-chain would silently diverge from the contract's own
    // computation, breaking the pre-flight replay check without any obvious error.
    expect(ActionType.ARBITRAGE).toBe(0);
    expect(ActionType.REJECTED_STALE).toBe(1);
    expect(ActionType.REJECTED_NARROW).toBe(2);
  });
});
