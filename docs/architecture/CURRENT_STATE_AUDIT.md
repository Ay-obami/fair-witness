# Current State Audit

Audit date: 2026-09-08

Scope: the complete current working tree, including uncommitted and untracked files

Method: code is primary; documentation and deployment records are corroborating evidence

## Executive finding

The repository already demonstrates the core separation of an advisory AI from a constrained per-tenant treasury and contains a genuine Attestcoin proof client and on-chain verifier integration. The deployed system, however, is an older arbitrage-only mock-market generation. The working tree contains a materially stronger but unintegrated and undeployed real-market generation (`EthereumV3MarketObserver`, `VerifiedMarketFactValidator`, `PenguinV3Adapter`, `FairWitnessTreasury`). Neither generation supports rebalancing, risk reduction, generic proposals, policy-rejection journaling, or Supabase-backed audit records.

The migration must build from the newer compositional contracts while preserving the proven invariants of the legacy contracts. It must not treat locally tested code as integrated or deployed.

## Audit confidence labels

- **WORKING**: exercised locally in this audit or directly evident in code and tests.
- **IMPLEMENTED, NOT INTEGRATED**: source and tests exist, but the running agent/frontend/deployment path does not use it.
- **DEPLOYED LEGACY**: deployment manifest and repository configuration identify a live older component; no fresh network mutation was performed in this phase.
- **PARTIAL**: some behavior exists, but the new requirement is not met.
- **ABSENT**: no implementation found.

## Repository inventory

| Area | Current contents | Finding |
|---|---|---|
| Contracts | Legacy ASC treasury/factory; source observation; mocks; newer observer, validator, V3 adapter, treasury/factory; native verifier interfaces and price/event libraries | Two architectural generations coexist. |
| Agent | Ethereum observer watcher, Attestcoin SDK client, Gemini decision engine, per-tenant runner, submitter, file reasoning store, replay CLI | Operational shape is still coupled to legacy `ASCTreasuryJournal` ABI and arbitrage. |
| Frontend | React/Vite dashboard, signup, treasury, verify/replay, architecture/help pages; Thirdweb embedded wallet; mock/live data providers | Builds, but models only arbitrage and successful legacy journal entries. |
| Supabase | One `user_instances` migration and optional browser client | Retained only for wallet/instance convenience; reasoning is not stored there. |
| Scripts | Legacy factory deploy/register/index/ABI scripts; observation firer; replay demo; newer read-only market audit | Deployment tooling targets legacy contracts; newer path has readiness audit but no deploy script. |
| Tests | Foundry and Vitest suites; frontend build in CI | Strong legacy/new-arbitrage contract coverage, no three-strategy coverage. |
| CI | Foundry tests, agent Vitest, frontend build on push/PR | No agent TypeScript build, frontend lint, integration network smoke, schema checks, or deployment smoke. |
| Documentation | Extensive historical docs and handoffs with superseding checkpoints | Useful evidence but internally contradictory as the market thesis changed. |

## Contract audit

### `ASCTreasuryJournal.sol` — DEPLOYED LEGACY, WORKING LOCALLY

What works:

- Per-instance immutable arbitrage guardrails.
- Owner-controlled registered-agent allowlist; ownership renunciation disabled.
- Only `executeArbitrage` moves treasury assets; no arbitrary target/calldata.
- Dual Attestcoin proof calls through `verifyAndEmit`.
- Source/confirmation ordering, max block gap, same-chain check, Merkle index binding, successful source receipt, fixed source contract and selector checks.
- Deterministic trade direction, net-edge floor, bounded sizing, slippage, balance, epoch rate limit, reentrancy protection.
- Replay key excludes caller-controlled nonce and caller, preventing nonce/agent variation from replaying one fact.
- Successful executions store a decision hash and evidence locations.

What is arbitrage-specific:

- `ActionType` contains only `ARBITRAGE`.
- Entry point, guardrails, price comparison, sizing curve, payload, fact consumption, and journal schema assume arbitrage.
- `BASE_ASSET`/`QUOTE_ASSET`, six-decimal base-unit assumption, and router quote shape are fixed to the old pair.
- Only successful executions journal; policy reverts leave no structured rejection record.
- Absolute proof freshness against current Attestcoin height is absent in this legacy contract; it only limits source-to-confirmation gap.
- A nonzero `decisionHash` is not required.

### `ASCTreasuryFactory.sol` — DEPLOYED LEGACY, WORKING LOCALLY

- Permissionlessly creates independent tenant treasuries with canonical dependencies and per-instance immutable guardrails.
- Emits deployment metadata.
- It is bound to the legacy verifier/router/assets/source contract and legacy constructor schema.
- It does not provide an on-chain owner-to-instance registry; repository index scripts/events fill that role.

### `PriceObservation.sol` — LEGACY SOURCE / LOCALLY HARDENED

- Current working-tree code has an owner-managed observer ACL and tests.
- The deployed Sepolia address documented in the repository predates that hardening and was permissionless; local ACL code does not change deployed bytecode.
- Even an ACL-controlled caller-supplied price is not a genuine market observation. It is unsuitable as final verified market evidence.

### `EthereumV3MarketObserver.sol` — IMPLEMENTED, NOT INTEGRATED

- Freezes factory, pool, tokens, and fee at construction.
- Derives a 300-second TWAP from the pool; caller supplies no price.
- Checks unlocked pool, nonzero liquidity, minimum observation cardinality, correct negative-tick rounding, and emits sufficient typed market state.
- Tests cover provenance and market preconditions.
- Current source-side deployment assumptions conflict with the selected Sepolia-only final path because no dependable Sepolia WCTC market is currently available.

### `VerifiedMarketFactValidator.sol` — IMPLEMENTED, NOT INTEGRATED

- Best current Attestcoin boundary.
- Freezes BlockProver, ChainInfo, source chain key, observer, source pool, absolute proof-age limit, and confirmation-gap limit.
- Calls both Attestcoin proofs, binds claimed transaction indices to Merkle positions at full `uint64`, and uses `AttestedMarketEventDecoder` to require the exact successful observer event and recompute price.
- Tests cover stale/above-head/missing attestations, wrong chain/gap/index, cryptographic failure, and uint32 truncation regression.
- Returns typed observations but no canonical `evidenceHash`; the migrated treasury must derive it.
- Reverts on invalid evidence; the generic treasury must catch and journal normal invalid-evidence policy outcomes.

### `PenguinV3Adapter.sol` — IMPLEMENTED, NOT INTEGRATED

- Freezes router, factory, pool, WCTC, stable, and fee; validates all provenance.
- Enforces WCTC 18 decimals and stable 6 decimals.
- Supports only exact-input buy/sell on that pair and returns output to caller.
- Requires live pool/TWAP conditions and verifies exact transfer and router output behavior.
- This narrowness is reusable and desirable. It should not become a generalized router.

### `FairWitnessTreasury.sol` — IMPLEMENTED ARBITRAGE V2, NOT INTEGRATED

- Composes the validator and adapter; requires nonzero decision hash.
- Adds absolute source freshness through the validator, destination TWAP/spot manipulation gate, pool-fee-aware edge requirement, protocol ceilings, balance checks, rollback tests, and typed journal fields.
- Still exposes only `executeArbitrage`, chooses sizing from arbitrage width, has no canonical proposal, no strategy abstraction, and journals only successful executions.
- Its replay key is still one arbitrage fact per treasury.
- Its immutable mandate is only arbitrage guardrails.

### `FairWitnessTreasuryFactory.sol` — IMPLEMENTED, NOT INTEGRATED

- Provides owner enumeration and validates validator/adapter are contracts.
- Still deploys the arbitrage-only treasury and has no three-strategy mandate schema.

### Interfaces, libraries, and mocks — WORKING SUPPORT CODE

- `INativeQueryVerifier`, `INativeChainInfo`, event decoder, source/destination price math, and tick math are reusable security-critical primitives.
- `IDexRouter`, `MockDexRouter`, and legacy mock tokens support the historical path only.
- Mock verifier/pool/ERC20 assets are appropriate for deterministic tests, never for economic claims.

## Agent audit

### Working pieces

- `AttestcoinClient` uses `@gluwa/usc-sdk` proof builder, BlockProver precompile client, and ChainInfo precompile client. It separately waits for proof-builder ingestion and on-chain attestation, builds typed proof fields, and supports an off-chain precheck.
- `EthereumMarketWatcher` reads only the immutable observer event and validates Ethereum mainnet chain ID, with multi-endpoint failover and scan-state regression tests.
- `DecisionEngine` uses a fixed Gemini prompt, structured JSON, temperature zero and seed; it returns act/decline reasoning. Direction is deliberately arithmetic, not model-selected.
- `tenantRunner` shares source proofs across tenants, refreshes destination price per tenant, reads each tenant's on-chain guardrails, performs preflight replay checks, persists reasoning, and isolates tenant failures.
- `keys.ts` mirrors Solidity fact/action identities with golden tests.
- `TreasurySubmitter` sends only the legacy typed `executeArbitrage` call.

### Gaps and drift

- All domain types, prompts, keys, runner flow, and submission are arbitrage-specific.
- The agent imports `ASCTreasuryJournal` ABI and old router accessors, not `FairWitnessTreasury`/validator/adapter ABIs.
- `config.ts` currently freezes Ethereum mainnet/source key 3, while the final requested demo constraint and market reality are Sepolia/source key 1. This path is not final-deployment-ready.
- `probe_e2e.ts` imports the deleted `sepoliaWatcher.ts` and is a stale manual probe outside `src`; it should not be treated as a working smoke test.
- The local prefilter and AI cache are optimizations, not security. The model cache is memory-only and its key omits several material fields.
- `ReasoningStore` is a local JSON directory, despite stale handoff prose claiming Supabase fallback. It is tamper-evident only when its hash is compared to chain; availability is not assured.
- AI declines are stored locally but not in a durable unified journal. Contract rejections are only logs to stdout/failed transactions.
- The agent submit key signs Creditcoin transactions and therefore needs gas. It must remain token-free and is a proposal submitter, not a treasury key.

## Frontend and UX audit

What works:

- Live versus explicitly illustrative demo data is separated by configuration.
- Treasury pages read owner and immutable bounds from chain.
- Replay fetches current and legacy journal tuple shapes and verifies the reasoning hash when a reasoning HTTP endpoint is configured.
- Tenant discovery, address switching, Thirdweb email wallet creation, factory deployment, agent registration, and owner verification before saving a mapping are implemented.
- The production build passes.

Required changes:

- Product language, navigation, signup, guardrail forms, treasury view, architecture/help, dashboard, action detail, replay card, causal explorer, types, mock data, and contract readers all assume arbitrage.
- The journal UI explicitly says rejected attempts are not journaled; this must change.
- No mandate builder exists for enabled strategies, target allocation, risk exposure, per-strategy caps, or automation status.
- No portfolio snapshot/allocation/risk panel exists.
- No strategy-aware observation/proposal/policy-result/rejection timeline exists.
- The legacy journal-length probe loops until array access reverts even though both treasury generations expose `journalLength()`; this is a known inefficiency to replace during UI migration.
- The main production bundle triggers a size warning. This is non-blocking and can be deferred.

## Supabase audit

Current schema has only `user_instances(id,email,wallet_address,instance_address,created_at)`.

- Select and insert are open to any holder of the public project key; there is no Supabase-authenticated user ownership. On-chain owner checking in the UI improves honest-client behavior but is not database authorization.
- Updates/deletes are absent, making rows effectively append-only to browser clients.
- Supabase is optional and correctly not consulted by contracts.
- No observations, reasoning, evidence, decisions, proposals, policy evaluations, portfolio snapshots, journal projections, or analytics tables exist.
- No backend/indexer service exists to write authoritative chain projections with a service role.

## Deployment and market audit

### Legacy deployed path

Repository deployment records identify:

- Creditcoin testnet chain ID `102031`.
- Attestcoin BlockProver precompile `0x0000000000000000000000000000000000000FD2`.
- Legacy factory `0x97c81D68BbCDb1A673b61176d60F071963Abe7f2`.
- Tenant A `0x13CACe3989b295048De47C68F32Ff3d844AC2026`, journal length 6.
- Tenant B `0xD66C607072df7dB98A75aEe81fCA4089462c60aB`, journal length 1.
- Legacy destination `MockDexRouter` and two `MockERC20` assets.
- Legacy Sepolia `PriceObservation` at `0x23433fcA0f35CC5e801b6888293B2B11017900c7`.

These deployments prove earlier mechanics, not the final market or three-strategy architecture. They must be labeled legacy in the UI and docs.

### New-path external dependencies recorded in the tree

- PenguinSwap V3 router: `0x3f65634837F914F18dBc4Db3E9d8Aa8F547f3229`.
- PenguinSwap factory: `0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9`.
- PenguinSwap WCTC/USD-TCoin pool: `0x04a3227587a1D2b79f8AFE6F0e361fAbD6EEB6E9`.
- PenguinSwap WCTC: `0x56072113e08015e1c40A3F3f656b1C1Fa78E329E`.
- USD-TCoin: `0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8`.
- Attestcoin ChainInfo precompile: `0x0000000000000000000000000000000000000FD3`.

No observer, validator, adapter, new treasury, or new factory address is configured or documented as deployed. The repository's read-only readiness audit fails closed when source market, token identity, cardinality/history, or deployment prerequisites fail.

### Honest market limitation

Attestcoin can verify genuine Sepolia transactions/proofs and Creditcoin testnet can execute a treasury action. PenguinSwap is real and has testnet liquidity. The corresponding PenguinSwap WCTC representation/source market on Sepolia is not currently dependable for an independent market demonstration. Controlled liquidity may demonstrate execution mechanics, but it is not naturally occurring profitable cross-chain arbitrage, and testnet tokens prove no economic profitability.

## Tests and CI observed in this audit

Commands executed without network mutation:

| Command | Result |
|---|---|
| `cd contracts && forge test` | **103 passed, 0 failed** across 9 suites |
| `cd agent && npm test -- --run` | **42 passed, 0 failed** across 6 files |
| `cd frontend && npm run build` | **PASS**, with a >500 kB chunk warning |

Existing tests strongly protect:

- agent never holds traded assets;
- no unguarded treasury fund-moving method in legacy/new tests;
- unauthorized proposer rejection;
- exact and changed-agent/nonce replay rejection;
- proof transaction-index identity and no narrowing truncation;
- dual-proof verification, chain/gap/absolute freshness in the new validator, and receipt/event semantics;
- drift, edge, direction, source/destination manipulation, slippage, balances, rate limits;
- immutable per-tenant isolation and factory dependency binding;
- fixed adapter route/output/transfer postconditions;
- deterministic key and reasoning-hash parity;
- tenant isolation and proof sharing in the runner.

Not currently protected:

- canonical three-strategy proposal parity;
- universal policy across every strategy;
- rejection persistence without capital movement;
- deterministic rebalancing accounting/rounding;
- risk exposure and daily-reduction caps;
- cross-strategy replay behavior;
- strategy priority/concurrent snapshot protection;
- owner exit constraints;
- Supabase schema/RLS/indexer reconciliation;
- complete agent-to-new-contract integration;
- a current Sepolia Attestcoin proof -> new policy -> real PenguinSwap testnet receipt.

CI currently omits the agent TypeScript build, frontend lint/tests, ABI drift for the new contracts, database migration checks, adversarial integration, and deployment smoke tests.

## Environment and configuration audit

Required or optional variables are documented for source RPCs, observer address, Creditcoin RPC/proof builder, legacy treasury/factory, agent submit private key, source chain key, Gemini, polling, frontend live/demo mode, reasoning API, Thirdweb, explorer, and Supabase.

Issues:

- Real `.env` files exist locally and are ignored; their values must never enter documentation or logs.
- The agent example/current config names Ethereum mainnet, while stale scripts and desired final path refer to Sepolia.
- No generic strategy, policy, risk, rebalance, indexer, or Supabase service configuration exists.
- Deployment scripts accept private keys and broadcast; Phase 0 did not run them.

## Direct answers to the 28 required questions

1. **Reusable components:** Attestcoin SDK client, native interfaces, semantic event decoder, V3 observer, validator, V3 adapter, price math, per-tenant factory pattern, agent allowlist, reasoning commitments, watcher failover, tenant isolation, replay UI concepts, Thirdweb onboarding, Supabase client, and extensive tests.
2. **Arbitrage-specific components:** both treasury generations, decision prompt/input, DEX reader, runner candidate logic, keys/action enum, submitter, journal payload decoder, nearly all product UI copy/forms, and legacy deploy scripts.
3. **Arbitrage-specific treasury assumptions:** one price gap, dual price confirmations, edge-scaled sizing, only one action type, fact consumed only as arbitrage, BASE/QUOTE naming and six-decimal unit assumption, no portfolio accounting, and success-only journal.
4. **Universal checks:** proposer authorization, active policy, schema, strategy/action/asset/venue allowlists, nonzero commitments, deadline, slippage ceiling, proof validity/freshness, source drift, destination validity, replay, amount/value cap, balance, execution rate, exact approval, fixed recipient/route, and journal linkage.
5. **Strategy-specific checks:** arbitrage edge/direction/costs; rebalance allocation/tolerance/target/direction/adjustment; risk exposure breach/sell-only/per-action and daily reduction.
6. **Strategy abstraction location:** typed modules in `agent/src/strategies`, with a closed enum and explicit branches inside the treasury policy.
7. **Proposal model location:** canonical Solidity interface co-located with the treasury boundary and exact mirrored TypeScript types/key encoder; no database-defined schema is authoritative.
8. **On-chain:** immutable mandate and dependencies, allowed proposer/mode state, verified evidence evaluation, deterministic accounting/policy, replay/rate/daily usage, custody, exact execution, compact attempt/execution journal and hashes.
9. **Off-chain:** collection/orchestration, proof construction, AI prompts/reasoning, rich snapshots, proof bodies/locators, analytics, UI state, chain projection and replay presentation.
10. **Supabase contents:** user-instance mapping, mandate projections, observations, evidence artifacts/references, AI decisions, proposals, policy results, portfolio snapshots, execution receipts, journal index, analytics, and UI preferences—never secrets or authorization truth.
11. **AI decision:** `EXECUTE` or `WAIT` for a deterministic candidate, with rationale and reason tags. It may compare qualitative verified context but cannot set execution terms.
12. **Deterministic:** balances, prices used for policy, portfolio valuation, allocations, deviations, exposure, thresholds, direction, permitted size, fees/slippage/edge, freshness, allowlists, replay, priority, minimum output, and execution.
13. **Attestcoin evidence representation:** typed proof bundle validated by the immutable validator; compact evidence identity is a treasury-derived hash of verified typed facts.
14. **Evidence-decision link:** `evidenceHash` and `observationHash` enter the canonical decision payload and proposal; `decisionHash`, proposal ID, evaluated-state hash, and evidence locations appear in the journal.
15. **Multi-strategy replay:** proposal ID + per-agent nonce + strategy-scoped evidence execution key; attempted replays are separate reason-coded attempts but never executions.
16. **Strategy-aware journal:** closed strategy/action enums and typed universal plus strategy metric fields in each attempt, with stable result/reason enums.
17. **Rebalance sizing:** two-asset deterministic stable-value accounting and target delta, capped by strategy and universal maxima; AI does not calculate it.
18. **Minimum risk model:** verified-value WCTC exposure cap, sell-only reduction, deterministic excess value, per-action maximum, and daily reduction maximum.
19. **Strategy parameters:** constructor-set immutable sub-structs validated against protocol ceilings; enabled bitmap; strategy configuration cannot be modified by AI or owner in place.
20. **Contracts needing modification:** `FairWitnessTreasury`, `FairWitnessTreasuryFactory`, client ABI generation; possibly narrow validator return/hash compatibility. Add a canonical interface/library only if it reduces duplication.
21. **Contracts remaining untouched:** legacy deployed treasury/factory and deployments; mock contracts except test use; `PenguinV3Adapter`, observer, native interfaces, decoder/math unless a required compatibility/security fix is proven.
22. **Frontend modifications:** types/readers/data provider/mock fixtures, signup mandate form, dashboard/treasury portfolio and strategy views, action/replay/causal explorer, architecture/help/home copy, version detection, rejection display, Supabase data access.
23. **Deployment changes:** new artifacts/ABIs, validator+adapter+factory deployment path, per-tenant mandate constructor, readiness preflight, source observer/market dependency, agent registration, funding, address manifest, indexer config, smoke tests; additive only.
24. **Existing critical tests:** custody/no-bypass, replay and proof identity, verifier semantics/freshness, direction/edge/slippage/rates, adapter route/postconditions, tenant isolation, reasoning hash, and runner isolation.
25. **Mandatory new tests:** all malicious proposal classes, strategy math/boundaries, cross-strategy replay, rejection journal atomicity, owner exit, Supabase/indexer parity, full agent integration, E2E and deployment smoke listed in `TEST_STRATEGY.md`.
26. **Smallest safe migration:** preserve immutable validator/adapter and pair, add one typed generic treasury path and mandate, migrate arbitrage to it, then add two deterministic policy branches, journal/indexer/UI, deploy additively.
27. **Deferrable:** more assets/venues, mutable mandates, WAIT-root anchoring, decentralized reasoning storage, advanced risk inputs, code splitting, generalized discovery, production mainnet hardening.
28. **Scope explosion risks:** arbitrary calldata/strategies, generalized routers/bridges, multi-asset optimization, orders, leverage/derivatives, volatility/prediction engines, backtesting/HFT/MEV, and production-profit claims.

## Conclusion

The repository is a strong arbitrage security prototype with a partially built next-generation market boundary. It is not yet the requested autonomous financial execution system. The safest migration is additive and narrow: one pair, one adapter, one canonical proposal, one per-tenant policy/custody contract, and three closed strategies.
