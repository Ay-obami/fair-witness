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
   Chain receipts remain authoritative; optional indexers/databases attach off-chain
   artifacts and make the strategy-aware UI easier to query
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

| Data | Authority | Projection treatment |
|---|---|---|
| Treasury balances | Creditcoin token contracts at evaluated block | Cache only with block reference. |
| Mandate/allowlists/mode | Treasury contract | Read-only projection; never used to authorize. |
| Source market fact | Successful validator/Attestcoin verification plus decoder | Store proof/result and anchor references; never set verified from API alone. |
| Destination market state | Immutable adapter/pool read during policy | Cache evaluated metrics and block reference. |
| AI reasoning | Off-chain model response | Store canonical envelope if available; integrity checked by commitment. |
| Policy result | Treasury attempt/state | Indexed projection reconciled to receipt. |
| Execution | Treasury/adapter event and token state | Indexed receipt and decoded amounts. |
| UI preferences | Application storage | Application authority only; no contract effect. |

## Optional Supabase audit schema

The current public `user_instances` table is only a wallet ↔ treasury convenience projection and contains no email. Richer audit tables can be enabled by applying the audit migration and running the indexer.

Logical records include:

- `observations`: observation hash, source/destination block references, balances, prices, liquidity and canonical payload;
- `evidence_bundles`: evidence hash, source/confirm positions, proof locator/digest and on-chain validation state;
- `ai_decisions`: decision hash, linked commitments, strategy, candidate, model metadata and EXECUTE/WAIT result;
- `proposals`: proposal ID and exact typed schema-v1 fields;
- `policy_attempts`: on-chain attempt ID, result/reason, evaluated-state hash and transaction identity;
- `executions`: successful movement linked one-to-one to an executed attempt;
- `portfolio_snapshots`: block-bound accounting snapshots;
- `mandate_projections`: chain-derived mandate/mode cache.

Database labels such as `VERIFIED_ONCHAIN` or `EXECUTED` are projections of chain truth, never authorization inputs.

## AI WAIT path

A WAIT decision is not submitted and therefore has no on-chain proposal/attempt/execution. If richer off-chain audit indexing is enabled it may retain the observation/candidate/decision artifacts, but the product must never label a WAIT as a policy rejection.

## Rejection path

A registered agent submits a structurally decodable proposal. The treasury creates an attempt, evaluates it, and writes a stable reason code defined by the schema-v1 policy/attempt model summarized in [`../ARCHITECTURE.md`](../ARCHITECTURE.md). `amountInActual` and `amountOutActual` remain zero for a rejected attempt. Evidence locations on invalid evidence are caller-claimed until verification succeeds.

If an unauthorized caller is rejected before journal admission or attempt capacity is exhausted, only the failed transaction receipt exists. The UI must not invent a treasury journal entry.

## Execution ordering and crash recovery

- Build proof once per source fact; evaluate per treasury with fresh balances/destination state.
- Submission is idempotent by proposal ID/nonce/execution key.
- Immediately before submission, refresh destination/treasury state and re-run deterministic preflight.
- On state drift, rebuild within the bounded retry policy rather than broadcasting stale terms.
- On process crash, query chain by proposal ID/nonce and transaction receipt before resubmitting.
- After any execution, invalidate candidates derived from the prior mutable destination snapshot.
- Indexers use event `(chainId, txHash, logIndex)` uniqueness and can replay from deployment block.

## Data retention

Retain canonical proposal/decision envelopes where available, proof artifacts or durable locators, receipts, and journal projections for the life of the corresponding treasury. Analytics can be rebuilt. Secrets, raw private keys, OTPs and service credentials never belong in audit records.
