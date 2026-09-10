# Data Flow and Record Linkage

## Canonical lifecycle

```text
1. OBSERVATION
   Source observer derives pool TWAP -> emits MarketPriceObserved
   Destination/portfolio reads form an AI-visible snapshot

2. EVIDENCE
   Attestcoin proof builder returns source + confirmation proofs
   Creditcoin validator later verifies both and semantically decodes events

3. DETERMINISTIC CANDIDATE
   Agent portfolio/strategy code computes eligibility, direction, amount cap,
   exact candidate amount, and metrics from the snapshot + mandate

4. AI DECISION
   AI receives hashes + typed facts + candidate; returns EXECUTE or WAIT + rationale

5. PROPOSAL
   Deterministic builder creates schema-v1 proposal from candidate and mandate

6. POLICY
   Treasury re-verifies proofs and rereads balances/destination market;
   derives evidenceHash/evaluatedStateHash and repeats all policy math

7a. REJECTION
   Treasury stores/emits reason-coded attempt; no approval or movement

7b. EXECUTION
   Treasury approves exact input -> immutable adapter -> frozen PenguinSwap pool;
   output returns to treasury; journal finalized

8. PROJECTION AND REPLAY
   Indexer ingests events/receipts into Supabase, attaches full off-chain artifacts,
   reconciles hashes, and serves the strategy-aware UI
```

## Identity chain

| Record | Primary identity | Links |
|---|---|---|
| Source observation | `(chainKey, blockHeight, txIndex, observer, pool)` | transaction hash, event log index, raw receipt |
| Evidence bundle | `evidenceHash` derived after validation | source/confirm positions, proof object locator, validator/Attestcoin references |
| AI-visible observation | `observationHash` | evidence hash, destination read block, balances, market state, mandate hash |
| AI decision | `decisionHash` | observation/evidence/policy hashes, strategy, candidate, model/prompt metadata, EXECUTE/WAIT |
| Proposal | `proposalId` | decision/evidence/observation/policy hashes, typed action terms |
| Attempt | monotonic `attemptId` | proposal ID, agent, typed result/reason/evidence status, evaluated-state hash, transaction |
| Execution | attempt ID + execution transaction | input/output, adapter/pool, execution key, receipt/log |

No link is inferred from timestamps alone. Source/confirmation moments are chain positions. Destination submission/execution uses Creditcoin block/transaction/log positions supplied by the receipt/indexer.

## Authoritative versus advisory data

| Data | Authority | Supabase treatment |
|---|---|---|
| Treasury balances | Creditcoin token contracts at evaluated block | Cached snapshot with block number/hash. |
| Mandate/allowlists/mode | Treasury contract | Read-only projection; never used to authorize. |
| Source market fact | Successful validator/Attestcoin verification plus decoder | Store proof/result and anchor references; never set verified from API alone. |
| Destination market state | Immutable adapter/pool read during policy | Cache evaluated metrics and block reference. |
| AI reasoning | Off-chain model response | Full canonical envelope; integrity checked by decision hash. |
| Policy result | Treasury event/state | Indexed projection reconciled to receipt. |
| Execution | Treasury/adapter event and token state | Indexed receipt and decoded amounts. |
| User UI settings | Supabase | Application authority only; no contract effect. |

## Supabase logical schema

Names may be adjusted to project conventions, but relationships and authority labels are locked.

### Identity and UX

- `user_instances`: authenticated user/wallet to public treasury association; retain on-chain owner verification.
- `ui_preferences`: selected treasury, display preferences, notification settings.
- `mandate_projections`: treasury address, policy hash, decoded immutable fields, mode, source block, sync status.

### Evidence and reasoning

- `observations`: observation hash, treasury, source/destination block references, balances, prices, liquidity, canonical payload.
- `evidence_bundles`: evidence hash, source/confirm chain positions, observer/pool, proof object locator, proof builder response digest, on-chain validation status/transaction. A status is `UNVERIFIED`, `VERIFIED_ONCHAIN`, or `INVALID`; only receipt reconciliation may set `VERIFIED_ONCHAIN`.
- `ai_decisions`: decision hash, observation/evidence/policy hashes, strategy, candidate envelope, prompt-template version, provider/model, temperature/seed, output, outcome, rationale, created time.

### Proposal, policy, and execution

- `proposals`: proposal ID, exact typed fields, canonical encoded bytes/hash, submitting agent, lifecycle status.
- `policy_attempts`: on-chain attempt ID, proposal ID, strategy/action, result/reason enum, evaluated-state hash, permitted and observed metrics, transaction/block/log, reconciliation status.
- `executions`: attempt ID, execution key, asset amounts, adapter/pool, receipt, success and post-state.
- `portfolio_snapshots`: treasury, evaluated block, balances, values, allocation/exposure bps, evidence and observation hashes.

Use foreign keys where identifiers are database rows, and unique constraints for hashes plus chain positions. Chain reorg handling must key projections by block hash and mark/reconcile orphaned rows.

## AI WAIT path

A WAIT decision has evidence, observation, policy, candidate, and decision records but no on-chain proposal/attempt/execution. It remains visible in the unified UI as `WAIT — NOT SUBMITTED`. It must never be labeled policy-rejected. Periodic hash-root anchoring is a future option, not Phase 0/initial migration scope.

## Rejection path

A registered agent submits a structurally decodable proposal. The treasury creates an attempt, evaluates it, and writes a stable reason code from the locked enum in `ARCHITECTURE_LOCK.md`. The indexer attaches the failed policy stage and all available verified/evaluated context. `amountInActual` and `amountOutActual` remain zero. Evidence locations on an invalid attempt are labeled caller-claimed, never verified. Token balances and approvals are asserted unchanged in tests.

If an unauthorized caller is rejected before journal admission or attempt capacity is exhausted, only the failed transaction receipt exists. The UI may index it as an external transaction anomaly, but must not invent a treasury journal entry.

## Execution ordering and crash recovery

- Build proof once per source fact; evaluate per treasury with fresh balances/destination state.
- Persist observation and AI decision before submission.
- Submission is idempotent by proposal ID/nonce/execution key.
- On process crash, query chain by proposal ID/nonce and transaction receipt before resubmitting.
- After any execution, invalidate all candidates from the prior snapshot.
- Indexer uses event `(chainId, txHash, logIndex)` uniqueness and can replay from deployment block.

## Data retention

Retain canonical proposal/decision envelopes, proof artifacts or durable locators, receipts, and journal projections for the life of the corresponding treasury. Analytics can be rebuilt. Secrets, raw private keys, OTPs, and service credentials never enter records.
