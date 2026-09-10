# Fair Witness Persistent Implementation Instruction

Last updated: 2026-09-09

Architecture status: **LOCKED**

Current implementation phase: **Phase 13 — Live Demo Completion — COMPLETED**

Completed phases: **Phase 0, Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9, Phase 10, Phase 11, Phase 12, Phase 13**

Next implementation phase: **NONE — the locked migration and explicitly authorized live-demo follow-up are complete**

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

### Schema-v1 generation

The current working tree also has:

- `EthereumV3MarketObserver`: fixed V3 pool, caller-independent 300-second TWAP event.
- `VerifiedMarketFactValidator`: BlockProver + ChainInfo, absolute freshness, chain/gap/index binding, successful receipt and exact observer/pool/event semantic decoding.
- `PenguinV3Adapter`: fixed PenguinSwap router/factory/pool/pair/fee and exact-input swaps.
- `FairWitnessTreasury`/factory: schema-v1 three-strategy treasury with universal policy, deterministic arbitrage/rebalancing/risk branches, destination TWAP/spot gates, replay protection, atomic execution, and attempt journaling.

These components are locally tested and deployed additively for a controlled public-testnet demonstration. The frozen manifest is `contracts/deployments/controlled-demo-schema-v1.json`; deployment evidence is in `docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md`. Do not confuse controlled liquidity with an independent market or production economics.

### Agent

The TypeScript agent has a real `@gluwa/usc-sdk` proof-builder/BlockProver/ChainInfo client, observer watcher with RPC failover, strict AI decision parser, deterministic strategy coordinator and proposal builder, schema-v1 submitter, audit index/replay CLIs, controlled risk rehearsal, and retained legacy runner. `agent/src/index.ts` remains the legacy runtime entrypoint; schema-v1 demonstrations must use the controlled scripts and runbook until a later, separately authorized runtime cutover.

### Frontend

React/Vite retains legacy signup/dashboard surfaces and adds a presentation-only schema-v1 mandate planner, all-three-strategy status, security-boundary statement, typed policy reasons, six-stage audit timeline, and controlled `/demo` route. It does not authorize execution. Legacy surfaces remain labeled; schema-v1 controlled addresses and disclosures are pinned in `frontend/src/lib/controlledDemo.ts`.

### Supabase

Supabase is retained as a non-authoritative audit projection. Phase 7 adds normalized observation/evidence/decision/proposal/attempt/execution/portfolio/mandate/preference tables, removes anonymous identity writes, and permits browser reads but no audit-truth writes. The server-only REST adapter reads `SUPABASE_SERVICE_ROLE_KEY`; the frontend contains only publishable-key configuration. Reasoning remains locally compatible while the schema-v1 audit repository is available to new orchestration.

### Current implementation state through Phase 12

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

Phase 5 activates deterministic two-asset rebalancing. The treasury values WCTC from the confirmed verified E6 price, treats stable raw units as E6 value, floors portfolio allocation and target calculations, treats both tolerance boundaries as inside the band, derives direction toward target, caps required adjustment by rebalance and universal limits, converts sell value to WCTC with floor rounding, requires exact proposal input, and journals allocation/target/permitted value. The TypeScript `RebalancingStrategy` mirrors this arithmetic and verified-market eligibility.

Verified-market checks shared by arbitrage and rebalancing were factored into one internal routine without changing policy. Rebalancing and arbitrage execute through the same rollback-safe boundary; risk reduction remains fail closed.

Size after Phase 5: treasury runtime `20,073` bytes (4,503 margin); factory runtime `23,973` bytes (603 margin). Phase 6 must not begin adding bytecode blindly. Measure an implementation spike immediately; if the factory exceeds EIP-170, stop for explicit architecture authorization or a scope-neutral deployment-bytecode solution.

Phase 6 activates the locked exposure-only risk branch, fixed-day successful-use accounting, rollback-safe charging, journal metrics, and matching TypeScript candidate math. Risk reduction triggers only above the immutable WCTC exposure threshold, permits only WCTC-to-stable sales, and caps the exact deterministic value by excess exposure, per-action risk limit, remaining daily allowance, universal limit, and balance. Rejections and caught execution failures do not consume daily allowance.

The initial Phase 6 factory artifact exceeded EIP-170. The resolution preserved the same treasury/factory/custody architecture: shared portfolio valuation removed duplicate code; compiler optimizer runs are `1` with metadata hash omitted; factory creation emits the treasury's canonical policy hash; redundant owner-array enumeration was removed in favor of the already-locked `TreasuryCreated` event/indexer/Supabase discovery path. `isFactoryTreasury` remains authoritative provenance. Final runtime sizes are treasury `20,954` bytes (3,622 margin) and factory `24,521` bytes (55 margin). This margin is valid but extremely narrow: all later contract changes require an immediate size gate.

Phase 7 adds the off-chain audit projection without changing contracts. `0002_audit_journal.sql` defines the normalized schema, integrity constraints, chain/log idempotency, canonical/orphan reconciliation states, evidence verification guard, owner-scoped UI preferences, public read policies, and no browser write policies for audit truth. The agent adds a server-only Supabase REST repository, complete typed attempt normalization from `getAttempt`, event indexing, block-hash reconciliation, deterministic canonical decision hashing, WAIT/missing/mismatch replay states, and schema-v1 index/replay CLIs. Legacy replay remains separate. Live database migration and RPC/Supabase indexing were not run because credentials/services were not supplied; static migration tests and in-memory reconciliation tests cover the local contract.

Phase 8 adds `/mandate`, a presentation-only schema-v1 mandate planner covering capital instructions, strategy enablement, target/tolerance, WCTC risk cap, exact assets/venue, universal size/slippage, and automation. It validates protocol-facing UI bounds, explains constructor immutability/redeployment, shows all three strategy states, and presents the observation-to-outcome audit sequence. Shared reason/strategy mappings match Solidity enum ordinals and have frontend unit tests. Home, architecture, help, footer, and signup copy now distinguish schema-v1 rejected-attempt journaling from the legacy success-only deployment. No chain deployment, Supabase mutation, or security-authoritative browser behavior was added.

Phase 9 closes mandatory adversarial assertion gaps without changing production contracts. Schema-v1 tests now prove unauthorized assets, expired proposals, invalid/stale evidence, and changed-nonce evidence replay do not reach capital; rebalance tolerance/wrong-direction and risk oversizing assert balances, allowances, counters and usage. A 256-run risk oversize fuzz test establishes the principal malicious-AI scenario. Agent integration proves model-supplied amount/venue fields are rejected and valid proposal execution terms come only from the deterministic candidate/mandate. `docs/ADVERSARIAL_TEST_MATRIX.md` maps every mandatory case to concrete local evidence and clearly records live-stack limitations.

Phase 10 preparation ran a read-only live audit on 2026-09-09 and deliberately did not broadcast. Creditcoin chain ID/pool provenance/liquidity, Attestcoin latest Sepolia attestation behavior, BlockProver behavior, WCTC NTT peer identity and artifacts were observable. Deployment is blocked because Sepolia WCTC supply is zero, its NTT manager is not the minter, no supported-fee Sepolia USDC/WCTC pool exists, and destination observation cardinality is 1 versus the locked minimum 16. Owner/agent identities and numeric mandate are also unreviewed. The candidate manifest is structurally valid but contains 14 unresolved fields and is explicitly `BLOCKED_NOT_APPROVED_FOR_BROADCAST`. Do not proceed to Phase 11 or introduce a broadcast path until the same audit reports ready and the manifest gate reports broadcast-ready.

The owner then explicitly authorized a controlled-demo amendment: deploy distinct demo-token pairs and new controlled V3 pools on public Sepolia and Creditcoin testnets while retaining genuine Attestcoin verification of the Sepolia observer transactions. The paired tokens have declared demo equivalence only—no bridge, redemption, economic peg, natural-arbitrage or profitability claim. Prices must move through pool swaps, not caller-supplied observations. This supersedes the external NTT token-activation requirement for the controlled demo only; it does not authorize weakening evidence, policy, custody, fixed-route, cardinality/history or labeling requirements. See `docs/architecture/CONTROLLED_DEMO_AMENDMENT.md`.

Phase 10 completed the authorized additive controlled deployment. Fixed-supply `fwUSD`/`fwWCTC` tokens and 0.3% full-range V3 pools now exist independently on Sepolia and Creditcoin testnet with required opposite token ordering, cardinality 16, aged 300-second history, and no mint/bridge/redemption claim. Schema-v1 addresses are frozen in `contracts/deployments/controlled-demo-schema-v1.json`: Sepolia observer `0x9bAF94da27d5C71c42b40D25b43070083DE7296E`; Creditcoin adapter `0x9bAF94da27d5C71c42b40D25b43070083DE7296E`, validator `0x13Dd030815550080Ef80Ff3499fAE8d971A119f5`, factory `0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd`, treasury `0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3`. Treasury owner is `0xF40003d36567478489BcCF1a1fEd094f87EeC9a5`; registered agent/deployer is `0xB1D19F71d68c4e7065749e8593D338E9A30D654f`; automation is paused. A paused rejection preserved balances, and a genuine two-proof Attestcoin risk-reduction smoke executed the exact deterministic amount before the owner returned the treasury to paused. Exact receipts and limitations are in `docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md` and `docs/handoffs/PHASE_10_HANDOFF.md`.

Phase 11 adds no contracts and does not redeploy the security boundary. `control-demo-market.js` uses the two already-deployed factory-bound routers to move either controlled pool toward a bounded 0.50–2.00 target through real swaps, defaults to preview, clears approval, and records broadcasts. `controlledDemoValidSmoke.ts` now has fresh-nonce valid/oversized risk modes, explicit progress, genuine proofs and fail-safe re-pausing. `/demo` pins real Phase 10 evidence and distinguishes it from rehearsal-ready scenarios; `/mandate` displays deployed immutable defaults and the mandatory controlled-market label. `docs/CONTROLLED_DEMO_RUNBOOK.md` defines reset, all three scenarios, WAIT/network failure and replay procedures. A live oversized-risk rehearsal on 2026-09-09 funded controlled exposure but stopped while paused after the Attestcoin SDK exceeded readiness retries; it is not claimed as an on-chain rejection. Local contract/fuzz tests remain the deterministic fallback.

Phase 12 reconciles release-facing documentation and CI without changing contracts or deployment state. `README.md`, Help, historical document banners, `docs/ADVERSARIAL_TEST_MATRIX.md`, and `docs/RELEASE_AUDIT.md` now distinguish verified local behavior, captured public-testnet evidence, rehearsal-ready scenarios, legacy surfaces, and remaining operational limitations. CI now runs contract size reporting, agent build, frontend tests/lint/build, checks the Phase 1–12 handoff chain, and rejects tracked private environment files. Release classification is **controlled-demo ready with disclosed limitations**, not production-ready.

Phase 13 is an explicitly authorized post-migration live-demo completion, not an architectural extension. It fixed the Sepolia SwapRouter02 tuple and added RPC failover plus a closed Gemini-gated Arbitrage/Rebalancing runner. The verified runtime model is `gemini-3.1-flash-lite`; the sample and code defaults match it. Genuine Attestcoin evidence backs public receipts for controlled Arbitrage, Rebalancing, valid Risk Reduction, and oversized Risk Reduction rejection. Post-phase submission hardening deployed the canonical Vercel site, added a public non-authoritative demo-request queue with a service-role operator CLI, removed legacy flows from judge-facing navigation, and verified the observer, adapter, validator, factory, and treasury source on Blockscout. Public request `0302054a-aa7e-466d-bc59-77733440a75d` completed as Arbitrage attempt 6; treasury final state is paused with 6 attempts and 4 executions, and the source market was reset to 1.00. Gemini used profitability language for valueless controlled tokens in attempt 6; this is untrusted rationale, not an economic claim, and did not influence deterministic authorization.

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

- `forge test`: 121 passed, 0 failed across 14 suites.
- agent proposal-schema tests: 8 passed, 0 failed.
- agent full Vitest: 113 passed, 0 failed across 17 files.
- agent TypeScript build: passed.
- frontend Vitest: 9 passed, 0 failed across 3 files.
- frontend lint: passed.
- frontend production build: passed with the pre-existing large-chunk warning.

Preserve these regressions. They cover important custody, replay, proof identity, verifier semantics, market/route bounds, tenant isolation, reasoning-hash invariants, domain closure, AI-output confinement, strategy priority and snapshot invalidation.

The latest supervised rehearsal re-confirmed the destination owner, registered agent, paused mode, attempt count 6, and execution count 4. The current policy hash has advanced from the creation-time manifest hash because supervised mode changes increment the immutable policy epoch by design.

The migration was completed in a heavily dirty worktree across multiple phase sessions. Preserve the full uncommitted phase set unless the user explicitly directs a reviewed commit operation.

## 4. Current market and Attestcoin reality

- Genuine Sepolia transaction/proof verification through Attestcoin is possible.
- Creditcoin testnet treasury execution is possible.
- PenguinSwap is a real deployed DEX with testnet liquidity.
- The relevant PenguinSwap WCTC representation/source-market situation on Sepolia is not currently dependable for an independent comparable market.
- There is no dependable independent Sepolia WCTC market supporting a claim of naturally occurring profitable cross-chain arbitrage.
- Controlled demonstration liquidity may demonstrate mechanics only and must be labeled controlled.
- Testnet tokens do not prove production economic profitability.
- The retained legacy runner/config must not be presented as the schema-v1 controlled-demo runtime; use the controlled runbook and scripts.

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
