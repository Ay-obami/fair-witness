# Fair Witness Persistent Implementation Instruction

Last updated: 2026-09-08

Architecture status: **LOCKED**

Current implementation phase: **Phase 4 — Arbitrage Migration — COMPLETE**

Completed phases: **Phase 0, Phase 1, Phase 2, Phase 3, Phase 4**

Next implementation phase: **Phase 5 — Rebalancing**

This file is persistent project memory for a fresh implementation agent. Read it completely before acting, then read every file in `docs/architecture/`. Code remains the primary truth for implementation state; this file defines the authorized target architecture and handoff protocol.

> **Implementation agents MUST NOT change locked architectural decisions without explicit authorization.**

## 1. What Fair Witness is

Fair Witness is a trust-minimized execution boundary for autonomous financial agents:

> Attestcoin provides verifiable cross-chain evidence. An AI agent interprets that evidence and recommends an action. Deterministic policy decides whether the typed action is permitted. An ASC treasury holds capital and performs only policy-approved execution. Decisions, rejections, and executions are journaled for audit and replay.

The product claim is: **Fair Witness allows autonomous financial agents to act without giving them custody or unrestricted execution authority.**

It supports exactly three strategies in this migration:

1. Arbitrage — reference strategy for a verified source/destination discrepancy.
2. Rebalancing — restore a two-asset portfolio toward a configured target outside a tolerance band.
3. Risk Reduction — sell bounded WCTC exposure when it exceeds an immutable maximum.

It is not a generic trading terminal, hedge fund, HFT/MEV system, bridge, order system, or unrestricted bot.

## 2. Non-negotiable security rule

**AI PROPOSES. DETERMINISTIC POLICY AUTHORIZES. TREASURY EXECUTES.**

Treat the AI, agent host, model provider, RPCs, frontend, Supabase, and submit key as untrusted for authorization. The AI must never:

- hold strategy funds or treasury/owner keys;
- directly call a DEX with treasury funds;
- modify policy, risk limits, targets, allowed strategies/assets/venues, freshness, slippage, replay, or rate limits;
- supply arbitrary target, selector, route, recipient, or executable calldata;
- substitute an ordinary API response or database flag for Attestcoin verification;
- calculate authoritative portfolio accounting or permitted trade size.

The AI returns only `EXECUTE` or `WAIT` for a deterministic candidate plus rationale/reason tags. The deterministic ProposalBuilder owns every execution field. The treasury recomputes every security-critical value.

## 3. Current repository truth

The working tree contains two generations.

### Legacy deployed generation

`ASCTreasuryJournal` and `ASCTreasuryFactory` implement per-tenant, arbitrage-only treasuries with immutable guardrails, registered agents, dual proofs, replay/rate/slippage/edge/direction checks and success-only journal commitments. The configured deployed path uses:

- Creditcoin testnet chain ID `102031`;
- Attestcoin BlockProver `0x0000000000000000000000000000000000000FD2`;
- factory `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2`;
- Tenant A `0x13CACe3989b295048De47C68F32Ff3d844AC2026` (6 historical journal entries);
- Tenant B `0xD66C607072df7dB98A75aEe81fCA4089462c60aB` (1 historical journal entry);
- `MockDexRouter`, mock tokens, and a legacy caller-supplied Sepolia `PriceObservation`.

These prove mechanics and historical Attestcoin-mediated execution, not a real-market or three-strategy product. Do not mutate or relabel them as the migrated system.

### New local, undeployed generation

The current working tree also has:

- `EthereumV3MarketObserver`: fixed V3 pool, caller-independent 300-second TWAP event.
- `VerifiedMarketFactValidator`: BlockProver + ChainInfo, absolute freshness, chain/gap/index binding, successful receipt and exact observer/pool/event semantic decoding.
- `PenguinV3Adapter`: fixed PenguinSwap router/factory/pool/pair/fee and exact-input swaps.
- `FairWitnessTreasury`/factory: stronger compositional arbitrage treasury with destination TWAP/spot gate and cost-aware edge.

These components are locally tested but are not wired into the current agent/frontend, have no repository deployment address, and remain arbitrage-only. Build the migration additively from them; do not confuse local implementation with integration or deployment.

### Agent

The TypeScript agent has a real `@gluwa/usc-sdk` proof-builder/BlockProver/ChainInfo client, observer watcher with RPC failover, Gemini structured decisions, multi-tenant runner, typed legacy submitter, deterministic keys, local JSON reasoning store, and replay CLI. It is still coupled to the legacy `ASCTreasuryJournal` ABI and arbitrage. `probe_e2e.ts` is stale because it imports deleted `sepoliaWatcher.ts` and is not part of `src` build.

### Frontend

React/Vite provides signup via Thirdweb embedded wallet, treasury deployment/agent registration, user-instance dashboard, treasury guardrails, journal replay, reasoning hash verification, and explicit live/demo modes. All important product types and screens still assume arbitrage and successful-only legacy journal entries.

### Supabase

Supabase must be kept. Current implementation has only `user_instances` and permissive PoC browser policies. Reasoning currently uses `.reasoning-store`, not Supabase. There is no backend indexer or audit schema yet.

### Current implementation state after Phase 4

Phase 1 added a side-by-side domain layer under `agent/src/domain/` and strategy layer under `agent/src/strategies/`. The live legacy arbitrage runner does not import them yet, by design.

Implemented:

- numeric closed enums with future ABI order: `ARBITRAGE=0`, `REBALANCE=1`, `RISK_REDUCTION=2`, and `SWAP_EXACT_IN=0`;
- typed `VerifiedContext`, `MandateSnapshot`, policy snapshots, portfolio/destination/source observations, discriminated strategy metrics and candidates;
- strict `parseAiDecision` runtime boundary accepting only strategy, `EXECUTE|WAIT`, rationale, and bounded reason tags; all extra execution-shaped fields are rejected;
- generic `Strategy.evaluate(context, mandate) -> candidate | null` interface;
- closed strategy registry and deterministic dispatch of enabled strategies;
- locked priority `RISK_REDUCTION -> REBALANCE -> ARBITRAGE` independent of module registration order;
- candidate binding to the same evidence, observation, policy and treasury snapshot;
- `StrategyEvaluationCycle`, which yields at most one candidate and invalidates the snapshot after execution.

Phase 2 added the schema-v1 proposal boundary side-by-side under `contracts/src/interfaces/`, `contracts/src/libraries/`, and `agent/src/proposals/`. It did not connect this boundary to either existing treasury generation.

Implemented:

- the exact locked `Proposal` layout and matching policy/evidence input structs in Solidity and TypeScript;
- schema domains `keccak256("FAIR_WITNESS_EVIDENCE_V1")` and `keccak256("FAIR_WITNESS_POLICY_V1")`;
- canonical `abi.encode` proposal ID, execution key, evidence hash, and policy hash functions;
- policy hash ordering: schema, chain, treasury, WCTC, stable, venue, universal policy, arbitrage policy, rebalance policy, risk policy, automation mode, policy epoch;
- deterministic proposal construction that derives pair/venue from the mandate and direction, requires a matching policy snapshot, bounds ABI widths, and permits a trusted caller only to tighten slippage;
- a durable per-agent `uint64` nonce input contract for later orchestration; Phase 3 must enforce used nonces on-chain;
- cross-language golden vectors and hash domain/field-sensitivity tests.

No concrete arbitrage, rebalance, or risk arithmetic was implemented in Phases 1–2; those remain Phases 4–6. Phase 3 adds the universal authorization and replay skeleton described below, while runtime agent/frontend migration, database work, deployment configuration, addresses, and chain state remain unchanged.

Phase 3 migrated the local undeployed `FairWitnessTreasury` and its factory to the schema-v1 generic boundary. It now stores an immutable-by-interface mandate, starts paused, hashes mode and epoch into policy identity, accepts typed proposals, applies universal schema/pair/venue/deadline/slippage/policy/replay checks, bounds journal attempts, and durably records normal rejections. First-use structurally valid proposals consume their per-agent nonce and proposal ID even when the strategy branch rejects. Unauthorized callers and attempt-cap overflow revert.

The owner can register agents, pause/resume with epoch invalidation, and withdraw only WCTC/stable to the owner. Strategy evaluation deliberately fails closed until Phases 4–6. An `onlySelf` execution subcall establishes atomic replay/counter/approval rollback; a test-only derived harness proves caught adapter failure leaves no execution residue while recording `EXECUTION_FAILED`. The factory deploys the exact generic mandate. New client ABIs are generated, but no agent/frontend runtime imports them yet.

Phase 4 activates only the arbitrage branch. `submitProposal` now accepts typed source/confirmation proofs, invokes the immutable validator through a catchable self-call, derives the locked evidence hash from verified facts, classifies stale/invalid evidence, reads the immutable adapter market, enforces source/destination liquidity and drift/deviation, derives direction, fee/slippage/reserve/net edge, calculates an edge-scaled balance/universal/strategy-capped exact input, and computes minimum output. Only an exact matching proposal can reach the atomic execution subcall. Attempt records contain claimed proof positions, verified status, permitted value, net edge, and evaluated-state hash.

The TypeScript side now has a deterministic `ArbitrageStrategy`, canonical closed-response prompt builder, and schema-v1 `PolicySubmitter`. These are side-by-side with the configured legacy runner: no existing deployed legacy address is silently repointed. Rebalancing and risk reduction still fail closed pending Phases 5 and 6.

No contracts were deployed and no chain state changed.

Phase 1 files added:

- `agent/src/domain/types.ts`
- `agent/src/domain/aiDecision.ts`
- `agent/src/domain/index.ts`
- `agent/src/strategies/strategy.ts`
- `agent/src/strategies/coordinator.ts`
- `agent/src/strategies/index.ts`
- `agent/test/domain.test.ts`
- `agent/test/strategyCoordinator.test.ts`
- `docs/handoffs/PHASE_1_HANDOFF.md`

Phase 2 files added:

- `contracts/src/interfaces/IFairWitnessTypes.sol`
- `contracts/src/libraries/FairWitnessHashing.sol`
- `contracts/test/FairWitnessHashing.t.sol`
- `agent/src/proposals/types.ts`
- `agent/src/proposals/hashing.ts`
- `agent/src/proposals/builder.ts`
- `agent/src/proposals/index.ts`
- `agent/test/proposalSchema.test.ts`
- `docs/handoffs/PHASE_2_HANDOFF.md`

Phase 2 also exports the proposal package from `agent/src/domain/index.ts`.

### Current test state

- `forge test`: 105 passed, 0 failed.
- agent focused Phase 2 proposal tests: 8 passed, 0 failed.
- agent full Vitest: 78 passed, 0 failed.
- agent TypeScript build: passed.
- frontend lint: passed.
- frontend production build: passed with the pre-existing large-chunk warning.

Preserve these regressions. They cover important custody, replay, proof identity, verifier semantics, market/route bounds, tenant isolation, reasoning-hash invariants, domain closure, AI-output confinement, strategy priority and snapshot invalidation.

The worktree was already heavily dirty before Phase 0. Preserve existing changes. Phase 0 added this file and `docs/architecture/*`; Phase 1 added only the domain/strategy/test/handoff files listed above and updated this persistent state.

## 4. Current market and Attestcoin reality

- Genuine Sepolia transaction/proof verification through Attestcoin is possible.
- Creditcoin testnet treasury execution is possible.
- PenguinSwap is a real deployed DEX with testnet liquidity.
- The relevant PenguinSwap WCTC representation/source-market situation on Sepolia is not currently dependable for an independent comparable market.
- There is no dependable independent Sepolia WCTC market supporting a claim of naturally occurring profitable cross-chain arbitrage.
- Controlled demonstration liquidity may demonstrate mechanics only and must be labeled controlled.
- Testnet tokens do not prove production economic profitability.
- The local newer watcher/config currently includes Ethereum-mainnet assumptions that conflict with the desired Sepolia-only final demo; do not silently deploy that as the final path.

Attestcoin proves a source transaction and continuity/inclusion. The semantic decoder binds that proof to a market observation. It does not prove token equivalence across chains, bridge viability, profitability, future price, or production safety.

## 5. Locked target architecture

```text
source observation -> Attestcoin proof bundle -> on-chain fact validator
 -> deterministic context/strategy candidate -> AI EXECUTE|WAIT
 -> deterministic typed proposal -> per-tenant treasury policy
 -> fixed adapter execution or durable rejection -> journal/indexer/Supabase/UI
```

### One security boundary

`FairWitnessTreasury` becomes the one generic per-tenant policy/custody/execution/journal contract. Policy is an internal logical layer, not a separately upgradeable/delegatecall contract. It uses immutable `VerifiedMarketFactValidator` and immutable `PenguinV3Adapter` dependencies.

### One pair and venue

Only WCTC/stable and one exact PenguinSwap adapter are allowed in this migration. The adapter freezes router, factory, pool, fee, tokens and recipient behavior. More assets/venues and generalized routing are deferred.

### Immutable mandate

Factory construction includes enabled-strategy bitmap, universal policy, arbitrage policy, rebalance policy, risk policy and owner. Limits/targets/assets/venue are immutable; changing them means creating a new treasury. Owner may register/deregister agents, pause/resume, and withdraw only an allowed asset to self through a journaled constrained owner exit. Each mode transition increments a monotonic policy epoch and therefore invalidates pre-transition proposals. AI cannot call owner functions.

### Strategy abstraction

Off-chain typed modules implement `evaluate(VerifiedContext, MandateSnapshot) -> Candidate | null`. On-chain strategy is a closed enum and explicit policy branch. If multiple candidates trigger, priority is Risk Reduction, then Rebalancing, then Arbitrage; submit at most one per treasury/cycle and recompute after execution.

### Canonical proposal v1

Exact fields:

```text
uint8 schemaVersion
StrategyType strategy
ActionType action              // SWAP_EXACT_IN only
address assetIn
address assetOut
address venue
uint128 amountIn
uint16 maxSlippageBps
uint64 deadline
uint64 nonce
bytes32 evidenceHash
bytes32 observationHash
bytes32 decisionHash
bytes32 policyHash
```

No opaque strategy bytes, JSON, calldata, target, selector, route, recipient, or caller-chosen `amountOutMinimum`.

`proposalId = keccak256(abi.encode(block.chainid, treasury, proposal))`.

`executionKey = keccak256(abi.encode(treasury, strategy, action, evidenceHash))`.

Use per-agent used nonces, processed proposal IDs, and strategy-scoped evidence execution keys. Evidence may be independently evaluated across strategies, but one strategy/evidence pair executes at most once per treasury. For all strategies the proposal input must equal the treasury's recomputed deterministic input after caps and conservative rounding; the AI never chooses a smaller or larger trade.

### Evidence

Proof bodies use a separate typed `EvidenceBundle`. The treasury calls the immutable validator, receives typed verified facts, derives the evidence hash from those facts, and compares it to the proposal. `observationHash` binds what the AI saw but is not authorization. Treasury records a separate evaluated-state hash from on-chain data used at submission.

### Universal policy

Enforce registered proposer, bounded attempts, schema/commitments, active mode, enabled strategy, action/pair/venue, deadline/horizon, slippage, policy hash, proposal/nonce/execution replay, Attestcoin semantic verification and freshness, source drift/liquidity, destination liquidity/spot-TWAP deviation, strategy math/caps/direction, balance, execution rate, policy-derived minimum output and exact adapter execution.

Universal immutable fields include maximum action value E6, slippage, source drift, spot/TWAP deviation, source/destination liquidity, execution rate/epoch, attempt rate, and enabled strategies. Protocol constants constrain constructor values.

### Arbitrage policy

Derive signed direction from confirmed verified source price versus destination TWAP. Gross edge must cover pool fee + effective slippage + fixed reserve + minimum net edge. Amount is deterministic edge-scaled and capped by arbitrage/universal/balance limits. Preserve simple auditable math; do not optimize.

### Rebalancing policy

Portfolio is exactly WCTC and stable. Stable is one stable-value unit; WCTC uses confirmed verified price subject to market checks.

```text
wctcValueE6 = wctcBalance * referencePriceE6 / 1e18
portfolioValueE6 = stableBalance + wctcValueE6
currentWctcBps = wctcValueE6 * 10000 / portfolioValueE6
targetValueE6 = portfolioValueE6 * targetWctcBps / 10000
requiredAdjustmentE6 = abs(wctcValueE6 - targetValueE6)
permitted = min(required, maxRebalanceValueE6, maxActionValueE6)
```

Inclusive tolerance means no rebalance. Direction must reduce deviation. ProposalBuilder supplies deterministic amount; policy rejects anything above its recomputed cap.

### Minimum risk policy

Exposure-only. Breach occurs strictly above immutable maximum WCTC exposure. Only sell WCTC. Permitted reduction is minimum of excess exposure, per-action risk maximum, remaining fixed-day reduction limit, and universal action maximum. Daily use increments only after success. If both strategies enabled, risk threshold must be above rebalance target plus tolerance.

Do not add volatility, drawdown, VaR, prediction, leverage or liquidation.

## 6. Journal model

Normal processable policy failures from registered agents must not revert. They return a reason and create a durable attempt with no token approval/movement. Invalid verifier/market reads must be caught and classified. Unauthorized callers, malformed ABI, attempt-cap exhaustion, out-of-gas and catastrophic invariant failures may revert and exist only as failed receipts.

Each on-chain attempt has a monotonic attempt ID and the exact typed `AttemptRecord`, `AttemptResult`, `EvidenceStatus`, and `ReasonCode` schema locked in `docs/architecture/ARCHITECTURE_LOCK.md`. It records proposal/execution IDs, claimed proof locations, strategy/action, agent, evidence/observation/decision/policy/evaluated-state hashes, timestamps, terms, permitted/observed metrics and actual in/out. Invalid proof locations remain explicitly caller-claimed; only validator success sets evidence status verified. Attempts and executions have separate counters. Rejections never increment execution or daily risk usage.

AI WAIT is stored off-chain as `WAIT — NOT SUBMITTED`, never called a policy rejection. Full prompts/proofs/snapshots live off-chain; hashes and compact policy/execution truth live on-chain.

Approved execution uses an `onlySelf` external treasury subcall under the outer reentrancy guard. Execution replay/rate/risk state, exact approval and adapter call occur inside it. Success commits them; a caught revert rolls the subcall back and lets the parent journal `EXECUTION_FAILED` with no approval, balance, replay, counter or usage residue. This pattern is locked and must receive direct-call, reentrancy and rollback tests.

## 7. Supabase authority and schema

Supabase is an off-chain application/audit store and chain projection. It must contain:

- authenticated user-instance association and UI preferences;
- mandate projections from chain;
- observations and portfolio snapshots with block references;
- proof artifacts/object locators and on-chain validation status;
- canonical AI prompts/decisions/model metadata/reasoning;
- proposals;
- policy attempts/reasons/evaluated metrics;
- executions/receipts and replay analytics.

Only a reconciled chain receipt may mark evidence `VERIFIED_ONCHAIN` or an execution successful. Never store private keys. Service-role credentials remain server-side. Harden the current permissive PoC RLS before treating user identity mappings as protected. Supabase compromise/outage must have zero ability to loosen policy or move funds.

## 8. UX model

The user gives an autonomous agent a mandate, not individual raw transactions. Onboarding configures capital instructions, enabled strategies, target allocation/tolerance, risk exposure and caps, exact allowed pair/venue, maximum value/slippage/rate and automation mode.

Required visible statement:

> Your AI can recommend actions. It cannot change these rules or access your funds directly.

Show immutable/redeploy consequences, owner/agent separation, portfolio status, strategy triggers, and observation -> evidence -> AI -> proposal -> policy -> execution/rejection replay. Clearly distinguish live, legacy, illustrative mock, and controlled-liquidity data.

## 9. Files/components to preserve or migrate

Preserve unless a narrow required security/compatibility fix is proven:

- `VerifiedMarketFactValidator`, `EthereumV3MarketObserver`, `PenguinV3Adapter` semantics;
- native verifier/chain-info interfaces;
- Attested event decoder and price/tick math;
- legacy contracts/deployments and their historical tests;
- Attestcoin client and watcher failover concepts;
- per-tenant isolation, reasoning commitments, Thirdweb onboarding, replay UX and Supabase presence.

Migrate:

- `FairWitnessTreasury` and factory to generic mandate/proposal/policy/journal;
- agent domain, strategies, decision prompts, ProposalBuilder, runner, submitter, persistence and replay;
- ABI generation;
- Supabase schema/backend indexer;
- frontend types, readers, onboarding, treasury/dashboard, replay and explanatory pages;
- deploy/readiness/smoke scripts and manifests.

Do not implement the new architecture in legacy deployed `ASCTreasuryJournal` in place.

## 10. Required migration sequence

0. Architecture Lock — complete.
1. Domain and Strategy Abstraction.
2. Canonical Proposal and Hash Parity.
3. Generic Treasury and Universal Policy.
4. Arbitrage Migration.
5. Rebalancing.
6. Risk Reduction.
7. Journal, Supabase, Indexer and Replay.
8. Frontend and Mandate UX.
9. Adversarial and Integration Testing.
10. Deployment Preparation and Deployment.
11. Demo Hardening.
12. Final Documentation and Release Audit.

`docs/architecture/MIGRATION_PLAN.md` gives exact objectives, dependencies, acceptance, tests, deployment and documentation obligations for each phase.

## 11. Mandatory security tests

Prove that malicious AI instructions cannot move capital outside deterministic constraints. At minimum test oversized action, unauthorized asset, unauthorized venue, stale evidence, exact and modified replay, expired proposal, invalid evidence, rebalancing inside tolerance/wrong direction, risk below threshold, risk reduction above per-action/daily limit, and valid execution for all strategies.

For every rejection assert unchanged treasury balances, adapter allowances, execution count, execution key and risk usage, plus correct durable rejection record when the caller/attempt is journal-admissible.

Also preserve existing custody, proof-index, semantic receipt, absolute freshness, drift, direction, edge, destination manipulation, slippage, route/output, rollback, tenant isolation, reasoning-hash and key-parity tests.

## 12. Demo obligations

- Arbitrage: verified opportunity -> AI execute -> policy approval -> fixed venue execution -> journal, with controlled-market caveat where applicable.
- Rebalancing: portfolio drift -> deterministic adjustment -> AI execute -> approval/execution -> journal.
- Risk: exposure breach -> valid reduction -> execution; then malicious excessive reduction -> reason-coded rejection -> unchanged treasury -> rejection journal.

The risk rejection is the principal security demonstration.

## 13. Deployment discipline

Deploy additively without proxies. Before broadcast, a read-only preflight must verify exact chain IDs, source/destination asset identity, observer/pool/router/factory/token bytecode and getters, Attestcoin supported key/precompiles/freshness, V3 cardinality/history/liquidity, decimals, constructor bounds/hash, signer roles/balances, values and post-state. Save receipts and re-read every immutable.

If source-market/asset identity remains unresolved, do not claim independent cross-chain arbitrage. No implementation phase may bypass a blocker by swapping WETH for WCTC, using an arbitrary mock while calling it real, or presenting controlled liquidity as natural.

## 14. Prohibited scope

Do not add:

- limit orders or order books;
- leverage, derivatives, liquidation or lending;
- generalized routing, bridges or token universes;
- arbitrary user-written/on-chain strategies;
- price prediction, sophisticated quantitative risk, advanced portfolio optimization;
- HFT, MEV, advanced backtesting;
- a generalized trading terminal;
- claims of production-grade/profitable arbitrage from testnet.

## 15. Implementation-agent operating protocol

At the start of a phase:

1. Read this file and all architecture docs.
2. Read the previous phase handoff.
3. Inspect current code/status because prior handoffs may be stale.
4. State exact phase scope and acceptance criteria.
5. Do not begin a later phase opportunistically.

At the end of every implementation phase:

1. Run focused and full required tests.
2. Update this file to reflect current repository truth, next phase, new addresses/limitations, and any explicitly authorized architecture amendment.
3. Create `docs/handoffs/PHASE_<N>_HANDOFF.md` with these exact headings:

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

4. List exact test commands/results and distinguish local mocks, controlled testnet, and live independent evidence.
5. Stop at the phase boundary.

If blocked, document the exact blocker, evidence, safe work completed, and externally required resolution. Never mark a phase complete because time or context is ending.

## 16. Architecture change control

To request a change to a locked decision, first document:

- exact decision and files affected;
- rationale and alternatives;
- threat-model/security delta;
- ABI/storage/data migration;
- test/deployment/documentation impact;
- backward compatibility and rollback;
- explicit authorization required.

Do not implement the deviation until authorized. Convenience, code elegance, model preference, or a stale historical document is not authorization.

## 17. Authoritative documentation order

For target architecture:

1. `docs/architecture/ARCHITECTURE_LOCK.md`
2. this `master_instruction.md`
3. the remaining `docs/architecture/*` specialized documents
4. latest `docs/handoffs/PHASE_<N>_HANDOFF.md`

For current implementation truth, inspect code/tests/deployed bytecode first. Older `docs/agent-handoff/*`, `CURRENT_REALITY.md`, PRD/design/devlog and legacy deployment docs are historical evidence and may contradict newer checkpoints. Preserve useful history but do not let it override the Phase 0 lock.
