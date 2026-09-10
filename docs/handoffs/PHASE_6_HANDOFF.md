# Phase 6 Handoff

## Status

COMPLETED

## Current Phase

Phase 6 — Risk Reduction

## Objective

Implement exposure-only WCTC risk reduction with deterministic sizing, per-action/universal/daily bounds, fixed-day usage, rollback-safe execution accounting, and strategy-aware journaling.

## Completed

- Enforced strict WCTC exposure breach and WCTC-to-stable direction.
- Derived exact permitted value from excess exposure, risk action cap, remaining fixed-day cap, universal cap, and available balance.
- Added fixed-day successful risk usage inside the rollback-safe `onlySelf` execution subcall.
- Added deterministic TypeScript risk candidate evaluation and daily-use snapshot input.
- Added the excessive-proposal security demonstration and daily rollover/replay-safe tests.
- Resolved the EIP-170 block without proxies, delegatecalls, external policy, or split custody.
- Consolidated shared portfolio valuation and removed redundant factory owner enumeration.
- Regenerated finalized client ABIs.

## Files Changed

- `contracts/foundry.toml`
- `contracts/src/FairWitnessTreasury.sol`
- `contracts/src/FairWitnessTreasuryFactory.sol`
- `contracts/test/FairWitnessTreasury.t.sol`
- `contracts/test/FairWitnessRiskReduction.t.sol`
- `agent/src/domain/types.ts`
- `agent/src/strategies/index.ts`
- `agent/src/strategies/riskReduction.ts`
- `agent/src/abi/FairWitnessTreasury.json`
- `agent/src/abi/FairWitnessTreasuryFactory.json`
- `frontend/src/abi/FairWitnessTreasury.json`
- `frontend/src/abi/FairWitnessTreasuryFactory.json`
- `agent/test/arbitrageStrategy.test.ts`
- `agent/test/rebalancingStrategy.test.ts`
- `agent/test/strategyCoordinator.test.ts`
- `agent/test/riskReductionStrategy.test.ts`
- `master_instruction.md`
- `docs/handoffs/PHASE_6_HANDOFF.md`

## Contracts Changed

- `FairWitnessTreasury`: risk branch, fixed-day usage, shared portfolio valuation, and atomic risk accounting.
- `FairWitnessTreasuryFactory`: canonical policy hash emission and event/indexer-based owner discovery; `isFactoryTreasury` provenance remains.
- Legacy contracts remain untouched.

## Database Changes

- NONE

## Tests Added

- Valid risk execution and journal metrics.
- Strict below/equal exposure rejection.
- Wrong-direction, oversized, and undersized rejection.
- Oversized 7,000-unit malicious proposal against a 10-unit cap.
- Partial/exhausted daily allowance and fixed-day rollover using fresh strategy evidence.
- Adapter-failure rollback for daily usage, replay state, counter, and approval.
- TypeScript cap intersections, market failure, threshold, daily exhaustion, and rounding dust.

## Tests Passing

- `cd contracts && forge test`: 114 passed, 0 failed across 13 suites.
- `cd agent && npm test`: 86 passed, 0 failed across 12 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.
- ABI regeneration sanity gates: passed.

## Deployment Changes

- No deployment or address change.
- Compiler optimizer runs changed from 200 to 1 and the metadata bytecode hash is omitted to minimize deployment bytecode.
- Treasury runtime: 20,954 bytes, 3,622 bytes below EIP-170.
- Factory runtime: 24,521 bytes, 55 bytes below EIP-170.
- Factory owner discovery now uses `TreasuryCreated` indexing/Supabase rather than `treasuryCount`/`treasuryAt` storage enumeration.

## Security Impact

- AI cannot choose risk direction, exposure accounting, reduction size, or daily usage.
- Rejections and caught adapter failures leave balances, approvals, replay state, counters, and daily usage unchanged.
- Factory provenance remains available through `isFactoryTreasury`; canonical policy identity is emitted directly from the created treasury.
- The narrow factory size margin makes a size check mandatory after every future Solidity change.

## Known Limitations

- Schema-v1 contracts remain undeployed and runtime agent/frontend remain on the legacy path.
- Factory runtime has only 55 bytes of EIP-170 margin.
- Owner-to-treasury enumeration requires the planned event indexer/Supabase projection; it is no longer stored as a factory array.

## Remaining Work

- Implement Phase 7 journal/indexer/replay projections and rejected-decision persistence.
- Preserve the factory size gate in all later contract work.
- Complete runtime integration, UX, adversarial testing, deployment, and demo hardening in later phases.

## Next Phase

Phase 7 — Journal / Replay

## Locked Decisions That Must Not Change

- One per-tenant treasury remains the custody and deterministic policy boundary.
- No proxy, delegatecall policy, mutable external policy, or split custody.
- Risk reduction remains exposure-only, sell-only, exact-sized, verified-evidence-bound, and daily-capped.
- Daily usage commits only on successful execution and rolls back with adapter failure.
- AI decides only `EXECUTE` or `WAIT`.
- Factory discovery is event/indexer-based; `isFactoryTreasury` remains on-chain provenance.

## Architectural Concerns

- Factory EIP-170 margin is only 55 bytes. Run `forge build --sizes` immediately after any later Solidity change and do not add contract scope casually.
