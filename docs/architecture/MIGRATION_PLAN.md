# Migration Plan

## Rules for every implementation phase

- Read `master_instruction.md` and all `docs/architecture/*` before changing code.
- Do not change a locked decision without explicit authorization.
- Preserve unrelated user changes and never rewrite legacy deployment history.
- Run the phase's focused tests and the full baseline before handoff.
- Update `master_instruction.md` with current fact, not a progress diary.
- Create `docs/handoffs/PHASE_<N>_HANDOFF.md` with exactly these sections:

```text
CURRENT PHASE
STATUS
COMPLETED
FILES CHANGED
CONTRACTS CHANGED
DATABASE CHANGES
TESTS ADDED
TESTS PASSING
DEPLOYMENT IMPACT
SECURITY IMPACT
KNOWN LIMITATIONS
REMAINING WORK
NEXT PHASE
DO NOT CHANGE
```

Status may be `COMPLETE`, `IN PROGRESS`, or `BLOCKED`. Never call a phase complete while acceptance criteria or required tests are open.

## Phase 0 — Architecture Lock

Objective: audit the working tree and lock the migration architecture without feature implementation.

Affected: documentation only under `docs/architecture/` and root `master_instruction.md`.

Dependencies: current repository, user-supplied security/product/market constraints.

Acceptance:

- all 11 required documents exist;
- all 28 architectural questions are answered;
- current/local/integrated/deployed states are distinguished;
- decisions, alternatives, security and migration effects are recorded;
- no runtime behavior or deployment changed.

Tests: existing Foundry, agent tests, frontend build; file-existence and clean-scope verification.

Deployment impact: none.

Documentation: this document set is the output. Phase 0 intentionally does not create its own future-style handoff file.

## Phase 1 — Domain and Strategy Abstraction

Objective: introduce shared typed domain models and deterministic strategy interfaces without changing the live legacy runner behavior.

Likely affected:

- new `agent/src/domain/*` and `agent/src/strategies/*`;
- focused unit tests;
- no fund-moving contract changes.

Dependencies: Phase 0 lock.

Acceptance:

- closed strategy/action/decision enums exist;
- `VerifiedContext`, `MandateSnapshot`, and typed candidates exist;
- deterministic priority is risk -> rebalance -> arbitrage;
- AI response type contains only EXECUTE/WAIT and explanatory metadata;
- legacy runtime tests remain green.

Tests: type/schema validation, strategy dispatch, priority, snapshot invalidation model, malformed AI output.

Deployment impact: none.

Documentation: handoff plus updated master instruction and type/version table.

## Phase 2 — Canonical Proposal and Hash Parity

Objective: define schema-v1 Solidity proposal types, TypeScript mirror, canonical hashes, and deterministic ProposalBuilder.

Likely affected:

- new contract interface/type library;
- agent proposal builder/key encoder;
- ABI generation gates;
- golden-vector tests.

Dependencies: Phase 1 domain types.

Acceptance:

- exact locked fields and no opaque bytes/calldata;
- proposal ID, evidence hash input schema, policy hash, execution key, and nonce rules implemented;
- Solidity and TypeScript produce identical hashes for golden vectors;
- AI output is unable to populate execution terms.

Tests: boundary widths/casts, enum parity, changed-field hash sensitivity, instance/chain separation, strategy-scoped execution key.

Deployment impact: none; ABI draft only.

Documentation: publish schema version and golden vectors in handoff.

## Phase 3 — Generic Treasury and Universal Policy

Objective: migrate `FairWitnessTreasury` to one generic typed submission boundary with immutable universal mandate, replay/rate state, pause/resume, constrained owner exit, and rejection-attempt journal skeleton.

Likely affected:

- `contracts/src/FairWitnessTreasury.sol`;
- `FairWitnessTreasuryFactory.sol`;
- possibly a pure internal policy/type library;
- mocks and Foundry tests;
- ABI updater.

Dependencies: Phase 2 schema; existing validator/adapter APIs.

Acceptance:

- no arbitrary target/path/recipient/calldata;
- exact adapter/pair and registered-agent checks;
- universal limits and protocol construction ceilings;
- proposal/nonces/execution replay model;
- normal registered-agent policy rejections persist without movement;
- unauthorized caller and attempt-cap behavior explicit;
- pause/resume and owner exit constrained/journaled;
- failed execution preserves atomic state.

Tests: all universal malicious cases, rejection atomicity, storage-spam rate, replay variations, owner actions, constructor fuzzing.

Deployment impact: new bytecode only; do not deploy.

Documentation: contract storage/ABI and rejection semantics in handoff.

## Phase 4 — Arbitrage Migration

Objective: express existing/new-path arbitrage behavior through the generic strategy/policy/proposal path.

Likely affected:

- treasury arbitrage branch;
- agent arbitrage strategy, candidate builder, AI prompt;
- submitter and replay projection;
- arbitrage tests.

Dependencies: Phase 3; validator and adapter baseline.

Acceptance:

- source/destination facts, direction, costs, net edge, liquidity and size are deterministic;
- current hardened validator/adapter protections remain;
- AI only executes/waits;
- legacy contracts remain readable and unchanged;
- valid and rejected arbitrage attempts are strategy-aware.

Tests: port every critical `FairWitnessTreasury` arbitrage test, gross/net boundaries, wrong direction, stale/invalid proof, source/destination manipulation, successful journal.

Deployment impact: none until all three branches and integration are ready.

Documentation: map old behavior to new reason codes and identify any deliberate semantic delta.

## Phase 5 — Rebalancing

Objective: implement two-asset deterministic portfolio accounting and rebalance policy/candidate.

Likely affected:

- treasury valuation and rebalance branch;
- agent deterministic portfolio/strategy module;
- test fixtures.

Dependencies: generic policy, verified reference price, exact decimals.

Acceptance:

- balances/value/allocation/deviation/required and permitted adjustment are deterministic;
- inclusive tolerance produces no execution;
- direction always moves toward target;
- ProposalBuilder supplies exact size;
- oversized or AI-altered amount rejects without movement.

Tests: empty/one-sided/zero-value portfolios, exact band boundaries, above/below target, rounding dust, cap intersections, wrong direction/amount, valid buy/sell.

Deployment impact: none.

Documentation: examples with raw units and rounding.

## Phase 6 — Risk Reduction

Objective: implement exposure-only risk policy with per-action and daily reduction bounds.

Likely affected:

- treasury risk branch and daily usage;
- agent risk strategy;
- test fixtures.

Dependencies: shared portfolio valuation; mandate relationship validation.

Acceptance:

- only WCTC exposure breach triggers;
- only sell WCTC is allowed;
- excess/per-action/daily/universal minimum determines cap;
- daily usage increments only on success;
- $7,000-equivalent proposal against $1,000 cap rejects and journals.

Tests: below/equal/above threshold, all cap intersections, reset boundary, rollback, buy rejection, excessive reduction and valid reduction.

Deployment impact: none.

Documentation: explicitly retain the no-volatility/no-prediction scope.

## Phase 7 — Journal, Supabase, Indexer, and Replay

Objective: make every AI decision queryable off-chain and every processable submitted policy result authoritative on-chain, with hash-linked reconstruction.

Likely affected:

- treasury attempt events/views;
- agent persistence replacing local-only reasoning as primary;
- Supabase migrations;
- new backend/indexer/reconciliation worker;
- replay CLI and schema tests.

Dependencies: final proposal/policy event shapes from Phases 3–6.

Acceptance:

- normalized tables from `DATA_FLOW.md` with constraints/RLS;
- service-role credentials only server-side;
- chain receipt alone can reconstruct compact attempt result;
- full observation/evidence/decision/proposal/policy/execution chain joins by hashes;
- invalid evidence never marked verified;
- WAIT, REJECTED, and EXECUTED are distinct;
- idempotent reindex and reorg-aware reconciliation.

Tests: migrations, RLS, duplicate ingestion, hash mismatch, missing artifacts, replay, invalid evidence status, legacy read compatibility.

Deployment impact: database migration and indexer configuration; still no contract broadcast.

Documentation: data dictionary, operations/reconciliation runbook, backup/retention.

## Phase 8 — Frontend and Mandate UX

Objective: present Fair Witness as a user-created mandate and make strategy-aware auditability understandable.

Likely affected:

- all frontend domain types/readers and most routes/components;
- signup, dashboard, treasury, verify/action detail, architecture/help/home;
- mock fixtures and config.

Dependencies: final ABI and Supabase API.

Acceptance:

- mandate form includes capital instructions, strategy enablement, target/tolerance, risk cap, assets/venue, universal size/slippage, automation;
- hard ceilings and immutable/redeploy implications are clear;
- prominent statement: “Your AI can recommend actions. It cannot change these rules or access your funds directly.”;
- portfolio and three-strategy status shown;
- observation -> evidence -> AI -> proposal -> policy -> execution/rejection timeline;
- legacy/demo/controlled-liquidity states labeled honestly;
- mobile/accessibility/error/loading states covered.

Tests: component/unit tests for mapping/reasons/hash states, production build, lint, targeted E2E UI flows.

Deployment impact: frontend config/schema update only; no chain deployment.

Documentation: screenshots/flow and environment variables in handoff.

## Phase 9 — Adversarial and Integration Testing

Objective: establish the security thesis against malicious AI outputs and subsystem failures.

Likely affected: Foundry invariant/fuzz tests, agent integration tests, indexer tests, local E2E harness.

Dependencies: Phases 3–8 complete.

Acceptance:

- mandatory theorem is demonstrated: malicious, incorrect, oversized, stale, replayed, or unauthorized proposals cannot move funds outside deterministic policy;
- all mandatory cases in `TEST_STRATEGY.md` pass;
- accepted/rejected journal and Supabase projection reconcile;
- no test relies on production-profit claims.

Tests: full local stack with mocks for deterministic coverage and separately labeled live testnet smoke preparation.

Deployment impact: none.

Documentation: adversarial matrix with transaction/state deltas.

## Phase 10 — Deployment Preparation and Deployment

Objective: deploy the new generation additively only when all readiness gates pass.

Likely affected:

- new non-interactive scripts for observer/validator/adapter/factory;
- ABI/address manifests, env examples, indexer start blocks;
- deployment smoke tests.

Dependencies: Phase 9 green; market prerequisites externally satisfied.

Acceptance before broadcast:

- read-only preflight verifies exact chains, assets, market identity, Attestcoin key/precompiles, pool provenance/liquidity/cardinality/history, signer roles/balances, constructor args and expected hashes;
- user reviews broadcast targets/values;
- no unresolved source-market or asset-identity blocker is hidden.

Acceptance after broadcast:

- receipts saved; bytecode and every immutable re-read;
- owner/agent roles and policy hash verified;
- small funded treasury created; no agent token balance;
- invalid proposal smoke rejection and valid bounded execution smoke pass;
- address manifest explicitly separates legacy and current.

Tests: deployment dry run/fork where possible, chain smoke, explorer verification.

Deployment impact: new contracts and database/indexer start configuration. Never mutate legacy instances.

Documentation: exact tx hashes, blocks, addresses, constructor values, verification status, and limitations.

Blocker rule: if a dependable Sepolia WCTC source market is still unavailable, do not claim independent cross-chain arbitrage. A controlled market demo may proceed only under explicit controlled-liquidity labeling and after security readiness.

## Phase 11 — Demo Hardening

Objective: produce repeatable, honest demonstrations for arbitrage, rebalancing, and valid/invalid risk reduction.

Likely affected: seeded testnet state, demo coordinator, UI fixtures/fallback, runbook.

Dependencies: deployed stack or an explicitly labeled local/controlled environment.

Acceptance:

- all scenarios in `DEMO_SCENARIOS.md` can be reset and replayed;
- evidence and transaction links are real where claimed;
- oversized risk proposal visibly rejects with unchanged treasury balances;
- model/network failure has a safe WAIT/fallback presentation;
- no “profitable,” “natural,” or “production-grade” claim from testnet mechanics.

Tests: rehearsal, fresh-browser run, network degradation, duplicate run/replay.

Deployment impact: controlled test data/liquidity only as disclosed.

Documentation: operator script and judge-facing evidence checklist.

## Phase 12 — Final Documentation and Release Audit

Objective: reconcile all repository docs and produce an evidence-backed final release statement.

Likely affected: README, product/design/deployment/help/current-reality docs, master instruction, final handoff.

Dependencies: actual final code/deployments.

Acceptance:

- code, ABIs, env examples, addresses, UI copy, tests, and docs agree;
- stale mainnet/mock/profit claims are bannered or removed without deleting history;
- all locked invariants have test references;
- deployment and market limitations are explicit;
- secrets scan and repository status reviewed;
- implementation handoffs form a complete chain.

Tests: full CI, build/lint, deployment smoke, link/address verification, documentation file checks.

Deployment impact: documentation/frontend release only unless a separately approved fix is required.

## Smallest safe path and deferrals

The critical path is Phases 1–6 on top of the existing validator/adapter, followed by Phase 7 journal persistence, Phase 8 UX, Phase 9 adversarial proof, and a gated additive deployment. Do not block the critical path on more assets, more venues, mutable mandates, decentralized storage, advanced risk metrics, generalized routing, or optimization. Those remain deferred.
