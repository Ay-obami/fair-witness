# Phase 3 Handoff

## Status

COMPLETED

## Current Phase

Phase 3 — Generic Treasury and Universal Policy

## Objective

Create the generic typed treasury boundary, immutable mandate, universal policy, replay/rate state, lifecycle controls, rejection journal skeleton, and atomic execution boundary without implementing strategy arithmetic.

## Completed

- Migrated the local undeployed treasury and factory to schema-v1 proposals and four-part mandates.
- Added the locked attempt result, evidence status, reason code, and attempt record types.
- Added universal schema, commitment, mode, strategy bitmap, action, pair, venue, deadline, slippage, policy-hash, proposal replay, per-agent nonce, evidence replay, and zero-amount checks.
- Added bounded per-epoch attempt admission and monotonic attempt IDs.
- Added durable normal rejections; unauthorized callers and attempt-cap exhaustion revert before storage.
- Added pause/resume with monotonic policy epoch and policy-hash invalidation.
- Added constrained owner exit for WCTC/stable to owner only and disabled ownership renunciation.
- Added an `onlySelf` atomic execution subcall and verified caught execution rollback.
- Kept production strategy evaluation fail-closed pending Phases 4–6.
- Added new treasury/factory ABI generation gates and generated client ABIs.

## Files Changed

- `contracts/src/FairWitnessTreasury.sol`
- `contracts/src/FairWitnessTreasuryFactory.sol`
- `contracts/src/interfaces/IFairWitnessTypes.sol`
- `contracts/test/FairWitnessTreasury.t.sol`
- `contracts/script/update-abis.js`
- `agent/src/abi/FairWitnessTreasury.json`
- `agent/src/abi/FairWitnessTreasuryFactory.json`
- `frontend/src/abi/FairWitnessTreasury.json`
- `frontend/src/abi/FairWitnessTreasuryFactory.json`
- `master_instruction.md`
- `docs/handoffs/PHASE_3_HANDOFF.md`

## Contracts Changed

- `FairWitnessTreasury`: replaced arbitrage-only API with generic Phase 3 boundary.
- `FairWitnessTreasuryFactory`: now accepts and hashes the complete mandate.
- `IFairWitnessTypes`: added exact locked journal enums and record.
- Legacy `ASCTreasuryJournal` and `ASCTreasuryFactory` were untouched.

## Database Changes

- NONE

## Tests Added

- Durable paused rejection and no-movement state.
- Universal venue/slippage checks.
- Proposal replay and nonce consumption.
- Unauthorized caller and attempt-cap reverts.
- Mode/epoch policy-hash invalidation.
- Pair-only owner exit.
- Factory mandate deployment.
- Direct execution-helper rejection.
- Caught execution failure rollback for balances, allowance, execution key, and counter.

## Tests Passing

- `cd contracts && forge test`: 99 passed, 0 failed across 10 suites.
- `cd agent && npm test`: 75 passed, 0 failed.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.

## Deployment Changes

- NONE. Bytecode and ABI changed locally; no broadcast or address manifest update occurred.

## Security Impact

- Registered AI submitters cannot select an arbitrary asset pair, venue, action, recipient, route, or calldata.
- Normal policy failures are durable and cannot approve or transfer tokens.
- Replay identity uses proposal ID, per-agent nonce, and strategy/evidence execution key.
- Execution state and approvals live inside a caught `onlySelf` subcall so adapter failure rolls them back atomically.
- Production strategy evaluation fails closed, so Phase 3 introduces no partially authorized trading path.

## Known Limitations

- Attestcoin proof bundles, verified evidence hashing, market reads, and strategy arithmetic are not connected to `submitProposal`; Phase 4 owns that integration.
- Production proposals cannot execute yet; each valid universal proposal receives its strategy-specific fail-closed reason.
- Attempt records have claimed evidence-location fields available but leave them zero until typed proof submission is introduced.
- Execution-rate and daily-risk state become active with their strategy branches.
- New ABIs are generated but not imported by current legacy agent/frontend runtime.

## Remaining Work

- Phase 4 must attach typed dual proofs, verify Attestcoin evidence, populate evidence locations/status, implement deterministic arbitrage authorization, and make only that branch executable.
- Populate evaluated-state and permitted-value metrics during strategy evaluation.
- Port hardened arbitrage tests through the generic proposal/rejection path.

## Next Phase

Phase 4 — Arbitrage Migration

## Locked Decisions That Must Not Change

- AI remains unable to supply arbitrary execution.
- Policy remains internal to the per-tenant treasury.
- Normal registered-agent rejections remain non-reverting and durable.
- Unauthorized callers and attempt-cap overflow revert.
- Policy mode changes increment epoch and invalidate prior proposals.
- Execution occurs only through the atomic `onlySelf` subcall.
- Legacy deployed contracts remain separate and readable.

## Architectural Concerns

- NONE
