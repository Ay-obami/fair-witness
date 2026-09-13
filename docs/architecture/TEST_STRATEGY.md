# Test Strategy

## Security theorem

The highest-priority test obligation is:

> Even if the reasoning layer produces malicious, incorrect, oversized, stale, replayed, or unauthorized instructions, it cannot cause capital movement outside deterministic policy constraints.

A policy test is incomplete if it checks only a reason code. Adversarial cases should also assert the protected state that must remain unchanged: balances, approvals, execution identity/counters, replay state and strategy-specific usage.

## Test layers

### Contracts

The Foundry suite covers:

- constructor/mandate validation and protocol ceilings;
- policy hash and policy-epoch invalidation;
- universal gates and stable reason-code mapping;
- Arbitrage direction, edge, costs and deterministic sizing;
- Rebalancing valuation, allocation, tolerance, direction and rounding;
- Risk Reduction exposure, per-action cap, daily cap and rollover;
- proposal/nonce/evidence replay identities;
- attempt versus execution journal transitions;
- pause/resume, agent management and lifecycle/owner controls;
- validator receipt/proof semantics;
- adapter route/output behavior and atomic rollback;
- tenant isolation and factory-created configuration.

Boundary-value and fuzz tests are preferred over example-only tests for amounts, prices, basis points and token units.

### Agent

The TypeScript tests cover:

- fixed strategy priority (`Risk Reduction → Rebalancing → Arbitrage`);
- deterministic candidate math and Solidity-parity commitment construction;
- strict EXECUTE/WAIT model output with execution-shaped fields rejected;
- proposal terms copied only from deterministic candidate/mandate state;
- proof acquisition/validation handling;
- fail-closed preflight and just-in-time state refresh;
- no stale broadcast when state drifts;
- per-treasury runtime telemetry;
- idempotency/replay-safe submission behavior.

### Frontend

Frontend tests and build checks cover:

- mandate unit/bounds/address validation;
- strategy/result/reason rendering;
- current treasury lifecycle states;
- live pipeline status mapping without decorative fake progress;
- schema-v1 Activity and Decision Detail data handling;
- `/verify` treasury + attempt locator behavior;
- production build and lint safety.

UI tests do not substitute for chain authorization tests.

### Database/audit projection

Where the richer audit projection is enabled, tests should cover migration safety, identity uniqueness, idempotent event ingestion, block-hash reconciliation, honest missing-artifact states and service-role isolation.

The public `user_instances` cache is intentionally smaller: wallet address, treasury address and timestamp only. Login email must not be persisted in that public projection.

## Mandatory adversarial matrix

| Case | Expected result | Required state assertion |
|---|---|---|
| Oversized action | amount/policy rejection | No balance/approval/execution/usage change. |
| Unauthorized asset | asset rejection | No adapter call or approval. |
| Unauthorized venue | venue rejection | No external venue call. |
| Stale/invalid evidence | evidence rejection | No movement; never marked verified. |
| Exact proposal replay | replay rejection | Original can execute at most once. |
| Changed nonce/amount/agent over executed evidence | evidence-executed rejection | No second execution. |
| Expired proposal | expiry rejection | No movement. |
| Rebalance inside tolerance | tolerance rejection | No movement. |
| Rebalance wrong direction | direction rejection | Deviation cannot be increased. |
| Risk below/equal threshold | threshold rejection | No movement or daily usage. |
| Risk amount/daily cap exceeded | cap rejection | Treasury state remains bounded. |
| Valid Arbitrage | executed | Exact allowed pair/venue/direction/input. |
| Valid Rebalance | executed | Movement is toward target. |
| Valid Risk Reduction | executed | WCTC exposure is reduced within caps. |

The concrete test names are tracked in [`../ADVERSARIAL_TEST_MATRIX.md`](../ADVERSARIAL_TEST_MATRIX.md).

## CI gates

Every pull request runs four independent jobs:

1. **Contracts** — Foundry tests/build, runtime-size checks, current deployed creation-code commitment and committed ABI drift.
2. **Agent** — clean install, Vitest and TypeScript build.
3. **Frontend** — clean install, tests, lint and production build.
4. **Release/security** — lifecycle-reference consistency, required public docs, tracked-secret checks and public-email persistence guard.

The exact workflow is `.github/workflows/ci.yml`; this document intentionally does not freeze test-count numbers that become stale as coverage grows.

## Public-testnet validation

Deterministic tests are the repeatable acceptance layer. Public-testnet controlled rehearsals complement them by checking the real source observation → Attestcoin proof → Creditcoin authorization/execution path.

Before showing a public receipt, preserve the relevant source/confirmation transactions, Creditcoin attempt transaction, treasury/attempt identity and explicit controlled-market disclosure. See [`../CONTROLLED_DEMO_RUNBOOK.md`](../CONTROLLED_DEMO_RUNBOOK.md).

Live-market availability is never a reason to weaken deterministic acceptance criteria.
