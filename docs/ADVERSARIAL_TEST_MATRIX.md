# Adversarial Security Matrix

## Security theorem

Even if the reasoning layer produces malicious, incorrect, oversized, stale, replayed, or unauthorized instructions, it cannot cause capital movement outside deterministic policy constraints.

This matrix is implementation evidence. Deterministic Foundry/TypeScript fixtures model required interfaces; they are not presented as live Attestcoin proofs or naturally occurring markets.

## Mandatory cases

| Case | Expected | Primary test evidence | Protected state asserted |
|---|---|---|---|
| Oversized action | `AmountExceedsPolicy` | `FairWitnessRiskReductionTest.testFuzz_MaliciousOversizeCannotMoveCapital` | balances, allowance, execution count/key, daily use, rejection record |
| Unauthorized asset | `AssetNotAllowed` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | balances, allowances, execution count |
| Unauthorized venue | `VenueNotAllowed` | `FairWitnessTreasuryTest.test_WrongVenueAndOverslippageCannotMoveFunds` | universal gate prevents execution |
| Stale evidence | `EvidenceStale` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | invalid evidence status, balances, allowances |
| Exact replay | `ReplayProposal` | `FairWitnessTreasuryTest.test_UniversalChecksAndReplayAreJournaled` | no execution; replay attempt recorded |
| Changed-nonce evidence replay | `EvidenceAlreadyExecuted` | `FairWitnessArbitrageTest.test_ChangedNonceCannotReuseExecutedEvidence` | no second movement or execution increment |
| Expired proposal | `ProposalExpired` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | no capital path entered |
| Invalid evidence | `InvalidEvidence` | `FairWitnessArbitrageTest.test_AdversarialUniversalInputsNeverReachCapital` | balances/allowances unchanged |
| Rebalance inside tolerance | `RebalanceWithinTolerance` | `FairWitnessRebalancingTest.test_InclusiveToleranceAndZeroPortfolioReject` | no movement |
| Rebalance wrong direction/amount | `WrongDirection` / amount reason | `FairWitnessRebalancingTest.test_WrongDirectionOversizedAndSmallerAmountReject` | balances/allowance unchanged |
| Risk below/equal threshold | `RiskThresholdNotBreached` | `FairWitnessRiskReductionTest.test_StrictThresholdAndWrongDirectionRejectWithoutUsage` | zero daily use and no execution |
| Risk above per-action limit | `AmountExceedsPolicy` | risk fuzz test above | exact permitted maximum recorded |
| Daily risk limit | `DailyRiskLimit` | `FairWitnessRiskReductionTest.test_DailyRemainingLimitAndFixedDayRollover` | usage cannot exceed cap |
| Valid arbitrage | `Executed` | valid sell/buy arbitrage tests | verified evidence, bounded direction/input, one execution |
| Valid rebalance | `Executed` | above/below-target rebalance tests | movement only toward target |
| Valid risk reduction | `Executed` | `test_ValidReductionExecutesAndChargesDailyUsage` | bounded WCTC reduction and daily charge |

## Cross-layer controls

- `agent/test/securityBoundary.integration.test.ts` proves model output containing execution terms such as `amountIn` or `venue` is rejected; proposal terms come from deterministic candidate/mandate code.
- `agent/test/domain.test.ts` rejects malformed decisions and execution-shaped AI fields including route, recipient and calldata.
- `agent/test/proposalSchema.test.ts` locks Solidity/TypeScript commitment compatibility, field sensitivity and numeric widths.
- `agent/test/auditJournal.test.ts` covers idempotency/orphan handling, WAIT-not-submitted and missing/tampered artifacts.
- `frontend/src/lib/policyUi.test.ts` locks strategy/reason rendering and mandate ceiling/address validation. Browser validation is UX only.

The full contract suites additionally cover pause/policy-epoch invalidation, agent authorization, attempt/execution rates, proof/index/receipt semantics, source drift, liquidity, destination TWAP deviation, adapter failures, atomic rollback, constrained owner lifecycle actions and tenant isolation.

## Public-testnet evidence

Local tests are the repeatable security evidence. Public-testnet controlled receipts supplement them by exercising the real observation → Attestcoin → Creditcoin policy → execution path.

The current configuration is in `contracts/deployments/controlled-demo-schema-v1-lifecycle.json`. Historical controlled Arbitrage, Rebalancing, Risk Reduction and oversized-risk rejection receipts remain in `contracts/deployments/controlled-demo-schema-v1.json`.

The controlled `fwUSD`/`fwWCTC` markets are synthetic test conditions and do not establish a bridge, redemption relationship, natural arbitrage, production liquidity or profitability.

For the threat model behind these cases, see [`architecture/SECURITY_MODEL.md`](architecture/SECURITY_MODEL.md).
