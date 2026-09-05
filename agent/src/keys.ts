import { ethers } from "ethers";

/**
 * Mirrors ASCTreasuryJournal.ActionType enum ordering exactly. The contract's enum is
 * now ARBITRAGE-only: rejections revert and are intentionally not journaled, so the
 * never-constructed REJECTED_STALE / REJECTED_NARROW values were removed on-chain
 * (IMPLEMENTATION_PLAN.md Task D).
 */
export enum ActionType {
  ARBITRAGE = 0,
}

/**
 * Mirrors ASCTreasuryJournal._factKey(proof) exactly:
 *   keccak256(abi.encode(chainKey, blockHeight, transactionIndex))
 */
export function factKey(chainKey: number, blockHeight: number, transactionIndex: number): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint64", "uint64", "uint32"],
      [chainKey, blockHeight, transactionIndex]
    )
  );
}

/**
 * Deterministic nonce derivation — per PRD section 7 and DEVLOG's "Design decision:
 * dual-proof staleness handling". MUST be a pure function of the fact + observed
 * condition, never of wall-clock time or any other non-reproducible input, so that a
 * crashed-and-restarted agent run re-derives the exact same value from the same fact
 * (see contracts/test/ASCTreasuryJournal.t.sol's
 * test_RevertOnDeterministicNonceRetryAfterSimulatedCrash for the on-chain half of this
 * guarantee).
 */
export function deterministicNonce(fact: string, srcPrice: bigint, destPrice: bigint): bigint {
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint8", "uint256", "uint256"],
      [fact, ActionType.ARBITRAGE, srcPrice, destPrice]
    )
  );
  return BigInt(hash);
}

/**
 * Mirrors the contract's actionKey derivation exactly:
 *   keccak256(abi.encode(address(this), factKey, actionType))
 *
 * Task 3.1: the key binds ONLY the instance, the fact, and the action type — the
 * caller and its nonce no longer participate in on-chain identity, so two registered
 * agents (or one agent varying the nonce) collide on-chain instead of each minting a
 * fresh key for the same fact. Used off-chain for the pre-flight "have I already done
 * this" check before spending gas on a resubmission. MUST stay in lock-step with
 * ASCTreasuryJournal.executeArbitrage or the pre-flight silently diverges from the
 * contract's own computation.
 */
export function actionKey(treasuryAddress: string, fact: string): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32", "uint8"],
      [treasuryAddress, fact, ActionType.ARBITRAGE]
    )
  );
}
