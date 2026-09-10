# Test Strategy

## Security theorem

The highest-priority test obligation is:

> Even if the AI produces malicious, incorrect, oversized, stale, replayed, or unauthorized instructions, it cannot cause capital movement outside deterministic policy constraints.

Every adversarial test asserts not only a reason code but also balance, allowance, execution counter, execution key, and strategy-usage state.

## Test layers

### Contract unit tests

- Proposal schema/version, policy constructor ceilings, policy hash/policy-epoch invalidation.
- Universal gates and stable reason-code mapping.
- Arbitrage arithmetic/direction/net costs/sizing.
- Rebalance valuation/allocation/tolerance/direction/sizing/rounding.
- Risk exposure/excess/per-action/daily cap and reset boundary.
- Attempt/proposal/nonce/execution replay identity.
- Attempt journal versus execution journal state transitions and exact enum/ABI parity.
- Pause/resume, agent management, constrained owner exit.

Use table tests at exact boundaries and fuzz amounts/prices/bps/decimals within supported domains. Prefer full-precision math and invariant assertions over example-only tests.

### Contract integration tests

- Treasury + mock validator + mock adapter for precise policy branches.
- Treasury + real `VerifiedMarketFactValidator` + semantic encoded receipt fixtures.
- Treasury + `PenguinV3Adapter` + V3 pool/router mocks for end-to-end atomic execution.
- Factory creates isolated tenants with distinct immutable mandates and canonical dependencies.
- Adapter failure rolls back approvals, balances, replay execution key, rate and daily usage.

### Agent unit tests

- Closed strategy dispatch and risk-first priority.
- Deterministic context/candidate math mirrors Solidity.
- AI response schema excludes execution terms and rejects malformed output.
- ProposalBuilder uses candidate/mandate values, not rationale/model numbers.
- Solidity/TypeScript golden hashes and enum parity.
- Per-tenant fresh balance/market reads and candidate invalidation after execution.
- Crash recovery queries proposal/receipt before resubmission.

### Supabase/indexer tests

- Migrations apply from empty database and constraints reject duplicate identities.
- RLS prevents cross-user private preference writes; service role is never bundled in frontend.
- Event ingestion is idempotent by chain/tx/log.
- Reorg/orphan reconciliation and replay from deployment block.
- Evidence becomes `VERIFIED_ONCHAIN` only from a reconciled validator/treasury receipt.
- Hash mismatch, missing reasoning/proof, invalid evidence and legacy entries render honest states.

### Frontend tests

- Mandate fields and protocol ceilings map to constructor units correctly.
- Strategy, result, and reason enums render correctly.
- WAIT, policy rejection, execution, missing artifacts, tampering, legacy, demo and controlled-liquidity badges are distinct.
- Timeline links observation/evidence/decision/proposal/policy/execution.
- Owner and agent role language is accurate.
- Live mode never silently falls back to mock data.

### End-to-end tests

- Deterministic local stack: observer event fixture -> proof fixture -> candidate -> stubbed AI EXECUTE -> proposal -> policy -> adapter -> on-chain journal -> indexer -> UI replay.
- WAIT path persists off-chain without claiming policy evaluation.
- Rejection path persists on-chain/off-chain with unchanged assets.
- Multi-tenant isolation: same evidence may independently execute once per tenant.
- Cross-strategy use: evidence may be evaluated per strategy; same strategy/evidence cannot execute twice.

### Deployment smoke tests

- Correct chain IDs and contract bytecode.
- Every immutable equals reviewed manifest.
- Policy hash recomputes off-chain.
- Owner/registered agent separation; agent has no strategy-token balance.
- Invalid evidence and oversized proposal reject without movement and journal correct reason.
- One minimal valid action executes through exact adapter/pool and appears in replay.
- Attestcoin source proof verifies on Creditcoin; no API flag is substituted.

## Mandatory adversarial matrix

| Case | Expected result | Required state assertion |
|---|---|---|
| Oversized action | `AMOUNT_EXCEEDS_POLICY` | No balance/allowance/counter/usage change; rejection journaled. |
| Unauthorized asset | `ASSET_NOT_ALLOWED` | No adapter call or approval; rejection journaled. |
| Unauthorized venue | `VENUE_NOT_ALLOWED` | No external venue call; rejection journaled. |
| Stale evidence | `EVIDENCE_STALE` | No movement; proof locations/reason linked. |
| Exact replay | `REPLAY_PROPOSAL` | Original executes at most once; replay attempt journaled. |
| Changed nonce/amount/agent replay | `EVIDENCE_ALREADY_EXECUTED_FOR_STRATEGY` | No second execution. |
| Expired proposal | `PROPOSAL_EXPIRED` | Evidence verifier/adapter not called if ordered earlier; no movement. |
| Invalid evidence | `INVALID_EVIDENCE` | Never labeled verified; no movement; rejection journaled. |
| Rebalance inside tolerance | `REBALANCE_WITHIN_TOLERANCE` | No movement; deterministic current allocation recorded. |
| Rebalance wrong direction | `WRONG_DIRECTION` | Deviation cannot be increased. |
| Risk below/equal threshold | `RISK_THRESHOLD_NOT_BREACHED` | No movement. |
| Risk reduction above limit | `AMOUNT_EXCEEDS_POLICY` | Treasury untouched; permitted maximum recorded. |
| Daily risk cap exceeded | `DAILY_RISK_LIMIT` | No movement/usage increment. |
| Valid arbitrage | `EXECUTED` | Exact venue/pair, bounded value/slippage, one journal entry. |
| Valid rebalance | `EXECUTED` | Direction toward target; resulting deviation reduced within rounding/cost bounds. |
| Valid risk reduction | `EXECUTED` | WCTC exposure reduced; daily usage equals executed value. |

Also test zero commitments/amount, unsupported schema/action/strategy, disabled/paused policy, stale policy hash, excessive deadline horizon/slippage, insufficient balance/liquidity, source drift, spot/TWAP manipulation, fee-on-transfer behavior, adapter output mismatch, reentrancy, attempt/execution epoch boundaries, and construction-time invalid mandate relationships.

## Existing regression suite to preserve

Current baseline on 2026-09-08:

- Foundry: 103/103 passing.
- Agent Vitest: 42/42 passing.
- Frontend production build: passing with bundle-size warning.

Do not delete legacy invariant tests merely because new contracts supersede deployments. Port relevant invariants and keep legacy decode/read compatibility tests until explicitly retired.

## CI target

Required jobs:

- `forge fmt --check`, build, unit/integration/fuzz/invariant tests;
- agent clean install, TypeScript build, unit/integration tests;
- frontend clean install, lint, tests, production build;
- proposal ABI/hash golden-vector check;
- Supabase migration/schema test;
- local E2E stack;
- opt-in read-only testnet readiness and post-deploy smoke jobs, never using secrets on untrusted PRs.

Live testnet tests complement but do not replace deterministic local tests. Market unavailability is a deployment/demo blocker, not a reason to weaken unit acceptance.

## Completion evidence

Each handoff reports exact commands, totals, failures/skips, and environment classification (local mock, fork, controlled testnet, or independent live market). “Tests pass” without command/output scope is insufficient.
