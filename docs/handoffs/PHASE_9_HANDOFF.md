# Phase 9 Handoff

## Status

COMPLETED

## Current Phase

Phase 9 — Adversarial and Integration Testing

## Objective

Establish with deterministic local evidence that malicious, incorrect, oversized, stale, replayed, or unauthorized AI proposals cannot move capital outside the locked treasury policy.

## Completed

- Added a consolidated universal-input adversarial test for unauthorized assets, expired proposals, invalid evidence and stale evidence.
- Proved an executed strategy/evidence pair cannot execute again by changing the nonce.
- Added a 256-run fuzz test for arbitrary oversized risk-reduction proposals.
- Strengthened rebalancing and risk tests to assert treasury balances, adapter allowances, execution counters/keys and daily usage.
- Added an agent integration test spanning strict AI parsing through deterministic proposal construction.
- Created a traceable mandatory adversarial matrix with honest environment and claim boundaries.
- Re-ran contract, agent and frontend suites and rechecked EIP-170 sizes.

## Files Changed

- `contracts/test/FairWitnessArbitrage.t.sol`
- `contracts/test/FairWitnessRebalancing.t.sol`
- `contracts/test/FairWitnessRiskReduction.t.sol`
- `agent/test/securityBoundary.integration.test.ts`
- `docs/ADVERSARIAL_TEST_MATRIX.md`
- `master_instruction.md`
- `docs/handoffs/PHASE_9_HANDOFF.md`

## Contracts Changed

- NONE (test contracts only)

## Database Changes

- NONE

## Tests Added

- Universal malicious-input no-capital-path test covering asset, expiry, invalid and stale evidence.
- Changed-nonce executed-evidence replay test.
- Fuzzed malicious risk-reduction oversize test with full unchanged-state assertions.
- AI parser-to-ProposalBuilder integration tests for injection rejection, deterministic term ownership and WAIT behavior.
- Additional state invariants on existing rebalance and risk tests.

## Tests Passing

- `cd contracts && forge test`: 117 passed, 0 failed across 13 suites; fuzz cases use 256 runs.
- `cd agent && npm test`: 101 passed, 0 failed across 15 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm test`: 4 passed, 0 failed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the existing large-chunk warning.
- `cd contracts && forge build --sizes`: treasury runtime 20,954 bytes; factory runtime 24,521 bytes (55-byte margin).
- `forge fmt --check` is not green because multiple pre-existing production and legacy test files are not forge-formatted. Phase 9 did not mass-format or alter those production files.

## Deployment Changes

- NONE. All evidence is deterministic local mock/test evidence, not a live Attestcoin or independent-market claim.

## Security Impact

- The principal malicious-AI theorem is now directly fuzzed: an amount above the deterministic risk cap is rejected and cannot change balance, allowance, execution state/key or daily use.
- Universal invalid inputs stop before evidence/adapter execution where ordered, and all admissible rejections are durable.
- Changing nonce cannot bypass strategy-scoped executed-evidence replay protection.
- AI output remains unable to provide amount, venue, route, recipient or calldata.

## Known Limitations

- The Supabase migration has not been executed against a live project; static schema and in-memory indexer/replay tests pass.
- There is no single browser-driven live-stack harness joining a chain process, Supabase and UI. These are independent tested boundaries; deployment smoke testing is a Phase 10 gate.
- Schema-v1 is undeployed, so no live schema-v1 Attestcoin execution is claimed.
- `forge fmt --check` has repository-wide pre-existing failures outside Phase 9 scope.
- Independent Sepolia WCTC market identity/liquidity remains unresolved.

## Remaining Work

- Perform Phase 10 read-only network/market/Attestcoin preflight before any broadcast.
- Apply and smoke-test Supabase with provided credentials.
- Prepare reviewed manifests, constructor values, signer roles, dry runs and post-deployment smoke assertions.
- Do not deploy or claim independent cross-chain arbitrage while source-market identity remains unresolved.

## Next Phase

Phase 10 — Deployment Preparation and Deployment

## Locked Decisions That Must Not Change

- AI proposes only EXECUTE/WAIT; deterministic code owns all execution terms.
- Only on-chain policy authorizes treasury movement; Supabase/frontend are projections.
- Attestcoin proof plus semantic validation cannot be replaced by an API/database assertion.
- Legacy and schema-v1 contracts and claims remain separate.
- Deployment is additive and requires reviewed preflight; no proxies or legacy mutation.
- Factory runtime has only 55 bytes of EIP-170 margin.

## Architectural Concerns

- NONE
