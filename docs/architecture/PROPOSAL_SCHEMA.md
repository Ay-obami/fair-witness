# Canonical Proposal Schema

## Security objective

A proposal expresses one bounded intent; it is not a transaction program. Its only execution primitive is an exact-input swap through the treasury's immutable adapter, between the supported two assets, with output returned to the treasury.

The deployed schema is `schemaVersion = 1`.

## Solidity shape

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

## Field rules

| Field | Meaning | Authorization rule |
|---|---|---|
| `schemaVersion` | ABI semantic version | Exact supported version only. |
| `strategy` | Closed policy branch | Must be enabled by the immutable mandate. |
| `action` | Execution primitive | Must be the supported exact-input swap action. |
| `assetIn/out` | Direction | Must be the immutable supported pair in the strategy-required order. |
| `venue` | Constrained executor | Must equal the treasury's immutable adapter. |
| `amountIn` | Exact token input | Nonzero and must satisfy/reconcile with deterministic policy sizing. |
| `maxSlippageBps` | Proposal-level ceiling | Cannot exceed the mandate; policy derives minimum output. |
| `deadline` | Execution deadline | Must be current/future and within the protocol horizon. |
| `nonce` | Per-agent uniqueness | First-use semantics prevent nonce replay. |
| `evidenceHash` | Verified source-fact commitment | Must equal the hash derived from validated evidence. |
| `observationHash` | Snapshot shown to reasoning | Audit commitment; never substitutes for chain reads. |
| `decisionHash` | Reasoning-decision commitment | Commits the canonical off-chain decision envelope. |
| `policyHash` | Active mandate/mode commitment | Must equal the treasury's current value. |

Numeric bounds are validated before narrowing casts. Token amounts remain in token-native units while common policy caps use stable-value E6 accounting. A testnet stable-value denomination is not a claim of a real-world dollar peg.

## Canonical identities

Security identities use Solidity ABI encoding rather than packed encoding. Conceptually:

```text
proposalId = keccak256(abi.encode(
  chainId,
  treasuryAddress,
  proposal
))

executionKey = keccak256(abi.encode(
  treasuryAddress,
  strategy,
  action,
  evidenceHash
))
```

`evidenceHash` commits the validated source/confirmation positions, expected observer/pool and decoded market fields. `policyHash` commits the chain, treasury, immutable mandate, current automation mode and monotonic policy epoch.

`observationHash` and `decisionHash` commit versioned off-chain envelopes. Their exact construction is mirrored by Solidity/TypeScript golden-vector tests so field ordering and numeric widths cannot silently drift.

## Replay state

The treasury combines several replay identities because a single nonce is not enough:

- a monotonic attempt sequence gives every admitted attempt its own identity;
- per-agent nonce state prevents nonce reuse;
- processed proposal state detects exact proposal replay;
- the strategy/evidence execution identity prevents changing agent/nonce/amount to execute the same economic fact twice for one strategy;
- policy epoch changes invalidate proposals built before pause/resume transitions.

A normal rejection does not consume an execution identity. Once a strategy has successfully executed against the relevant evidence, later variants cannot execute it again.

## Why the schema is narrow

The proposal deliberately has no arbitrary target, selector, calldata, route or recipient field. Those would turn the proposal into a programmable transaction and move authority back into the untrusted submitter/reasoning path.

Strategy-specific opaque bytes are also avoided in the security path because they make decoding and review harder. Database-generated IDs are not authoritative, and nonce-only replay protection does not protect against economic replay through modified proposers/terms.

## Compatibility

Historical arbitrage-only contracts and receipts remain in the repository as provenance/evidence but are not the schema for new treasuries. Current product surfaces use schema-v1 treasury attempts (`getAttempt`) and the Activity → Decision Detail ← Verify flow.
