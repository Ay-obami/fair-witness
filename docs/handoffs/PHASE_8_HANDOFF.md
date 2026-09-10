# Phase 8 Handoff

## Status

COMPLETED

## Current Phase

Phase 8 — Frontend and Mandate UX

## Objective

Present Fair Witness as a user-created three-strategy mandate and make its security boundary and strategy-aware audit sequence understandable without implying that undeployed schema-v1 contracts are live.

## Completed

- Added a responsive `/mandate` schema-v1 review flow covering capital instructions, three-strategy enablement, target/tolerance, WCTC risk cap, allowed assets/venue, universal action/slippage bounds, and automation.
- Added explicit immutable/redeploy consequences, protocol ceiling validation, and the required AI/treasury security statement.
- Added all-three-strategy mandate status and the observation → Attestcoin evidence → AI → typed proposal → policy → execution/rejection timeline.
- Added closed schema-v1 strategy and policy-reason display mappings with safe unknown states.
- Corrected stale pages that said rejected schema-v1 proposals were not journaled.
- Clearly labeled the active signup and published addresses as legacy arbitrage; the planner cannot save, deploy, or authorize policy.
- Updated product language from an arbitrage-only system to a policy-bound execution boundary while retaining honest testnet claims.

## Files Changed

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/main.tsx`
- `frontend/src/components/layout.tsx`
- `frontend/src/components/SecurityBoundaryNotice.tsx`
- `frontend/src/components/DecisionTimeline.tsx`
- `frontend/src/lib/policyUi.ts`
- `frontend/src/lib/policyUi.test.ts`
- `frontend/src/routes/Mandate.tsx`
- `frontend/src/routes/SignUp.tsx`
- `frontend/src/routes/Home.tsx`
- `frontend/src/routes/Architecture.tsx`
- `frontend/src/routes/Help.tsx`
- `master_instruction.md`
- `docs/handoffs/PHASE_8_HANDOFF.md`

## Contracts Changed

- NONE

## Database Changes

- NONE

## Tests Added

- Four frontend unit tests for strategy ordinals, security-significant reason mappings, unknown enum states, valid mandate input, and invalid strategy/address/ceiling input.

## Tests Passing

- `cd frontend && npm test`: 4 passed, 0 failed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed; existing large-chunk warning remains.
- `cd agent && npm test`: 98 passed, 0 failed across 14 files.
- `cd agent && npm run build`: passed.
- `cd contracts && forge test`: 114 passed, 0 failed across 13 suites.

## Deployment Changes

- Adds frontend route `/mandate` and Vitest as a frontend development dependency.
- No contract deployment, address, environment-variable, or Supabase deployment change.

## Security Impact

- The UI prominently states that the AI cannot change rules or directly access funds.
- Client validation is explicitly non-authoritative; on-chain validation remains the security boundary.
- The legacy factory is not silently treated as schema v1, preventing false deployment/security claims.
- Rejections are described as reason-coded, balance-preserving schema-v1 security events; AI WAIT remains distinct.

## Known Limitations

- The schema-v1 mandate planner is review-only until Phase 10 deployment; it intentionally does not persist or deploy policy.
- Existing treasury/dashboard/action-detail readers remain legacy for published addresses. Schema-v1 live attempt projection requires deployed addresses and the Phase 7 migration applied to Supabase.
- No browser E2E framework existed; Phase 8 adds pure unit coverage and validates production build/lint. Full-stack targeted UI flows belong with Phase 9 integration infrastructure.
- The frontend production bundle retains its pre-existing large-chunk warning.

## Remaining Work

- Prove the complete malicious-proposal matrix and full-stack reconciliation in Phase 9.
- Apply/smoke-test Supabase migration when credentials are available.
- Wire schema-v1 readers and deployment only after actual addresses exist in Phase 10; do not fabricate live data in Phase 8 fixtures.

## Next Phase

Phase 9 — Adversarial and Integration Testing

## Locked Decisions That Must Not Change

- The frontend and Supabase are non-authoritative; only deterministic treasury policy authorizes movement.
- AI response remains EXECUTE or WAIT and supplies no execution terms.
- Legacy and schema-v1 deployments/replay semantics remain explicitly distinct.
- Assets, venue, and numeric policy are constructor-set; changes require redeployment. Automation mode is owner-controlled and policy-hash-bound.
- Attestcoin evidence must never be replaced by or mislabeled from an ordinary API response.
- No Solidity changes without an immediate EIP-170 size gate; the factory has only 55 bytes of margin.

## Architectural Concerns

- NONE
