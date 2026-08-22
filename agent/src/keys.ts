import { ethers } from "ethers";

/** Mirrors ASCTreasuryJournal.ActionType enum ordering exactly. */
export enum ActionType {
  ARBITRAGE = 0,
  REJECTED_STALE = 1,
  REJECTED_NARROW = 2,
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
 *   keccak256(abi.encode(factKey, actionType, agent, decisionNonce))
 * Used off-chain for the pre-flight "have I already done this" check before spending
 * gas on a resubmission.
 */
export function actionKey(fact: string, agentAddress: string, nonce: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint8", "address", "uint256"],
      [fact, ActionType.ARBITRAGE, agentAddress, nonce]
    )
  );
}
