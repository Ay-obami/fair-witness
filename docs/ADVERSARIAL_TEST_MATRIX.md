# Adversarial Security Matrix

Phase: 9 — Adversarial and Integration Testing
Environment: deterministic local Foundry/TypeScript/browser-unit mocks only
Date: 2026-09-09

## Security theorem

Even if the AI produces malicious, incorrect, oversized, stale, replayed, or unauthorized instructions, it cannot cause capital movement outside deterministic policy constraints.

This matrix is implementation evidence, not a live-network or profitability claim. Foundry validator/adapter fixtures model the required interfaces; they do not masquerade as Attestcoin proofs or naturally occurring markets.

## Mandatory cases

| Case | Expected | Primary test evidence | Protected state asserted |
|---|---|---|---|
| Oversized action | `AmountExceedsPolicy` | `FairWitnessRiskReductionTest.testFuzz_MaliciousOversizeCannotMoveCapital` (256 runs) | balances, allowance, execution count/key, daily use, rejection record |
| Unauthorized asset | `AssetNotAllowed` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | both balances, both allowances, execution count, rejection record |
| Unauthorized venue | `VenueNotAllowed` | `FairWitnessTreasuryTest.test_WrongVenueAndOverslippageCannotMoveFunds` | no execution; universal gate precedes evidence/adapter |
| Stale evidence | `EvidenceStale` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | invalid evidence status, balances, allowances, execution count |
| Exact replay | `ReplayProposal` | `FairWitnessTreasuryTest.test_UniversalChecksAndReplayAreJournaled` | no execution; replay attempt journaled |
| Changed-nonce evidence replay | `EvidenceAlreadyExecuted` | `FairWitnessArbitrageTest.test_ChangedNonceCannotReuseExecutedEvidence` | no second balance change, allowance or execution increment |
| Expired proposal | `ProposalExpired` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | evidence remains `NotChecked`; no capital path entered |
| Invalid evidence | `InvalidEvidence` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | invalid status, balances, allowances, execution count |
| Rebalance inside tolerance | `RebalanceWithinTolerance` | `FairWitnessRebalancingTest.test_InclusiveToleranceAndZeroPortfolioReject` | recorded allocation, balances, allowance, execution count |
| Rebalance wrong direction/amount | `WrongDirection` / amount reason | `FairWitnessRebalancingTest.test_WrongDirectionOversizedAndSmallerAmountReject` | balances, allowance, execution count |
| Risk below/equal threshold | `RiskThresholdNotBreached` | `FairWitnessRiskReductionTest.test_StrictThresholdAndWrongDirectionRejectWithoutUsage` | zero daily use and no execution |
| Risk above per-action limit | `AmountExceedsPolicy` | risk fuzz test above | exact permitted maximum recorded; treasury untouched |
| Daily risk limit | `DailyRiskLimit` | `FairWitnessRiskReductionTest.test_DailyRemainingLimitAndFixedDayRollover` | no over-cap usage; next fixed day is independent |
| Valid arbitrage | `Executed` | `test_ValidVerifiedSellExecutesAndJournals`, `test_ValidVerifiedBuyExecutesDeterministicStableInput` | verified evidence, bounded exact direction/input, one execution |
| Valid rebalance | `Executed` | `test_AboveTargetExecutesCappedSellAndJournalsAllocation`, `test_BelowTargetExecutesBuy` | direction toward target and deterministic amount |
| Valid risk reduction | `Executed` | `test_ValidReductionExecutesAndChargesDailyUsage` | exact WCTC reduction, execution count and daily charge |

## Cross-layer boundaries

- `agent/test/securityBoundary.integration.test.ts` proves model output containing `amountIn` or `venue` is rejected, while a valid EXECUTE decision produces a proposal whose amount, assets, venue and policy hash come only from the deterministic candidate/mandate.
- `agent/test/domain.test.ts` rejects malformed/unknown decisions and every execution-shaped AI field including route, recipient and calldata.
- `agent/test/proposalSchema.test.ts` locks Solidity/TypeScript hashes, field sensitivity, numeric widths and deterministic proposal derivation.
- `agent/test/auditJournal.test.ts` proves idempotency/orphan handling, WAIT-not-submitted, missing artifact and tamper mismatch states.
- `agent/test/auditMigration.test.ts` statically checks audit tables, RLS and constraints. It does not replace the deferred live Supabase migration smoke test.
- `frontend/src/lib/policyUi.test.ts` locks strategy/reason rendering and mandate ceiling/address validation. Browser checks are presentation only.

## Additional retained controls

The full suites also cover policy pause/epoch invalidation, agent authorization, attempt/execution rates, source proof/index/receipt semantics, source drift, source/destination liquidity, destination TWAP deviation, adapter route/output failures, atomic failure rollback, owner-only constrained exit, tenant isolation, and legacy custody/replay invariants.

## Honest limitations and deployment evidence

- These tests use deterministic local fixtures. No test here is a live independent market or live Attestcoin execution claim.
- The Supabase migration has not been applied to a live project because credentials are unavailable.
- There is no single browser-driven full-stack harness joining a real chain process, Supabase and UI. Contract, agent/indexer and frontend boundaries are independently deterministic.
- Schema-v1 is deployed additively in a paused controlled-demo environment. A paused policy rejection and a genuine Attestcoin-backed risk-reduction execution have public receipts; see `docs/deployments/CONTROLLED_SCHEMA_V1_DEPLOYMENT_2026-09-09.md`.
- Public-testnet controlled Arbitrage, Rebalancing, valid Risk Reduction, and oversized-risk rejection receipts are captured in `contracts/deployments/controlled-demo-schema-v1.json`. These supplement rather than replace deterministic local security tests.
- Independent Sepolia WCTC market identity/liquidity remains unresolved. The deployed `fwUSD`/`fwWCTC` pools are controlled, have no bridge/redemption promise, and must always be labeled controlled.
- The treasury is paused outside supervised rehearsals. Explorer source verification and hosted desktop/mobile rehearsal completed on 2026-09-10. Live Supabase audit projection remains pending operational work; the separate public demo-request queue is live and non-authoritative.
