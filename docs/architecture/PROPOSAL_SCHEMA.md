# Canonical Proposal Schema

## Security objective

The proposal expresses one bounded intent; it is not a transaction program. Its only action is an exact-input swap through the treasury's immutable adapter, between the adapter's immutable two assets, with output returned to the treasury.

## Solidity schema

```solidity
enum StrategyType { ARBITRAGE, REBALANCE, RISK_REDUCTION }
enum ActionType { SWAP_EXACT_IN }

struct Proposal {
    uint8 schemaVersion;
    StrategyType strategy;
    ActionType action;
    address assetIn;
    address assetOut;
    address venue;
    uint128 amountIn;
    uint16 maxSlippageBps;
    uint64 deadline;
    uint64 nonce;
    bytes32 evidenceHash;
    bytes32 observationHash;
    bytes32 decisionHash;
    bytes32 policyHash;
}
```

Locked version for initial migration: `schemaVersion = 1`.

## Field rules

| Field | Meaning | Validation |
|---|---|---|
| `schemaVersion` | ABI semantic version | Exact match; no tolerant security-path decoding. |
| `strategy` | Closed policy branch | Enabled in immutable strategy bitmap. |
| `action` | Execution primitive | Must be `SWAP_EXACT_IN`. |
| `assetIn/out` | Human/audit-visible direction | Must be the immutable WCTC/stable pair in the strategy-required order. |
| `venue` | Constrained executor | Must equal immutable `PenguinV3Adapter`. |
| `amountIn` | Exact token input units | Nonzero and exactly equal to policy's deterministic amount after all caps and conservative rounding. |
| `maxSlippageBps` | Proposal-level ceiling | Nonzero and no greater than mandate ceiling; policy derives `amountOutMinimum`. |
| `deadline` | Destination execution deadline | Must be current/future and no farther than a small protocol maximum horizon. |
| `nonce` | Per-agent proposal uniqueness | One use per registered agent, including rejected processable submissions. |
| `evidenceHash` | Verified source fact commitment | Must equal hash derived after validator success. |
| `observationHash` | Snapshot shown to AI | Nonzero; audit linkage only, never substitutes for on-chain reads. |
| `decisionHash` | AI decision/prompt/rationale commitment | Nonzero; recomputable from canonical off-chain decision envelope. |
| `policyHash` | Exact active mandate commitment | Must equal treasury's current hash, preventing stale-policy proposals. |

All numeric bounds are checked before narrowing casts. Amounts use token-native units; policy also computes stable-value E6 for common caps. The stable token's testnet unit is a valuation denomination, not proof of a dollar peg.

## Canonical hashes

Use Solidity ABI encoding, not packed encoding:

```text
proposalId = keccak256(abi.encode(block.chainid, treasuryAddress, proposal))

executionKey = keccak256(abi.encode(
  treasuryAddress,
  proposal.strategy,
  proposal.action,
  proposal.evidenceHash
))

evidenceHash = keccak256(abi.encode(
  EVIDENCE_SCHEMA_V1,
  sourceChainKey,
  sourceBlockHeight,
  sourceTxIndex,
  confirmBlockHeight,
  confirmTxIndex,
  immutableObserver,
  immutableSourcePool,
  sourcePriceE6,
  confirmPriceE6,
  sourceMeanTick,
  confirmMeanTick,
  sourceLiquidity,
  confirmLiquidity
))

policyHash = keccak256(abi.encode(
  POLICY_SCHEMA_V1,
  block.chainid,
  treasuryAddress,
  immutable mandate fields,
  current automation mode,
  monotonic policyEpoch
))
```

`observationHash` is defined by a versioned canonical JSON or ABI envelope stored off-chain. The chosen canonicalizer must have golden vectors in Solidity/TypeScript where applicable. `decisionHash` commits to a versioned envelope containing observation/evidence/policy hashes, strategy, candidate metrics, exact `EXECUTE|WAIT` outcome, model and prompt-template identifiers, and rationale.

## Replay state

- `attemptSequence`: monotonic treasury counter; creates a unique attempt ID even for a replay rejection.
- `usedNonce[agent][nonce]`: consumed for every processable first submission after basic structural validation.
- `processedProposal[proposalId]`: marks a first submission; an exact replay gets a new attempt record with `REPLAY_PROPOSAL` but cannot execute.
- `executedStrategyEvidence[executionKey]`: marked immediately before external execution; transaction rollback restores it if execution reverts.

Normal rejections do not mark `executionKey`. A corrected proposal may be submitted with a fresh nonce, but once a strategy has executed against evidence, no proposer/nonce/amount variation can execute it again. Pause/resume increments `policyEpoch`, so proposals created before either transition fail their policy-hash check.

## Rejected alternatives

- Arbitrary `bytes calldata`, target, selector, or route: directly violates the treasury boundary.
- Strategy-specific opaque bytes: decoder complexity and schema ambiguity.
- EIP-712 signature as primary authorization: agent registration plus on-chain caller identity is sufficient for the hackathon; signatures do not make an untrusted proposal safe.
- Database-generated IDs: not deterministic or authoritative.
- A nonce-only replay scheme: permits other agents or changed nonces to replay one economic fact.
- One global evidence burn: prevents valid independent strategy evaluations.

## Compatibility

Legacy arbitrage entries retain their legacy decoder and are displayed as legacy. Version 1 is not shoehorned into `ASCTreasuryJournal.actionPayload`. New deployments and ABIs are explicit; no proxy/storage upgrade is attempted.
