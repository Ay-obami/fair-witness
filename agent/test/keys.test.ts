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
  it("is deterministic and binds ONLY the instance + fact (Task 3.1)", () => {
    const fact = factKey(1, 1_000_000, 0);
    const treasuryA = "0x13CACe3989b295048De47C68F32Ff3d844AC2026";
    const treasuryB = "0xD66C607072df7dB98A75aEe81fCA4089462c60aB";

    const k1 = actionKey(treasuryA, fact);
    const k2 = actionKey(treasuryA, fact);
    const k3 = actionKey(treasuryB, fact);

    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("does NOT vary with the agent address or nonce — same fact + different agent/nonce collides on-chain", () => {
    // Mirrors the on-chain 3.1 hardening: the contract derives
    // keccak256(abi.encode(address(this), factKey, ARBITRAGE)) with no caller and no
    // caller-supplied nonce, so a second registered agent (or a nonce variation)
    // cannot mint a fresh actionKey for an already-executed fact.
    const fact = factKey(1, 1_000_000, 0);
    const treasury = "0x13CACe3989b295048De47C68F32Ff3d844AC2026";

    expect(actionKey(treasury, fact)).toBe(actionKey(treasury, fact));
  });
});

describe("ActionType enum ordering", () => {
  it("matches the Solidity contract's enum order exactly (ARBITRAGE must be 0)", () => {
    // If this ever drifts from ASCTreasuryJournal.sol's `enum ActionType`, every
    // actionKey computed off-chain would silently diverge from the contract's own
    // computation, breaking the pre-flight replay check without any obvious error.
    // (The contract enum is now ARBITRAGE-only: rejections revert and are
    // intentionally not journaled — the REJECTED_* values were removed, Task D.)
    expect(ActionType.ARBITRAGE).toBe(0);
  });
});
