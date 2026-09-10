# Phase 7 Handoff

## Status

COMPLETED

## Current Phase

Phase 7 — Journal, Supabase, Indexer, and Replay

## Objective

Make every AI decision queryable off-chain and every processable submitted policy result authoritative on-chain, with hash-linked reconstruction, idempotent indexing, and honest replay states.

## Completed

- Added the normalized Supabase audit migration and hardened the PoC identity policy.
- Added complete chain-attempt projections that do not depend on optional off-chain artifacts.
- Added server-only Supabase REST persistence using `SUPABASE_SERVICE_ROLE_KEY`.
- Added typed `AttemptResolved` ingestion plus block-tagged `getAttempt` reconstruction.
- Added idempotent attempt identity and block-hash orphan reconciliation.
- Added deterministic recursively canonical decision hashing and tamper/missing detection.
- Added explicit `WAIT_NOT_SUBMITTED`, `MISSING_ARTIFACT`, `MATCH`, and `MISMATCH` replay states.
- Added schema-v1 index/replay CLIs while preserving the legacy replay CLI.
- Added the audit data dictionary, operations, reconciliation, backup, and retention runbook.

## Files Changed

- `frontend/supabase/migrations/0002_audit_journal.sql`
- `agent/package.json`
- `agent/src/audit/types.ts`
- `agent/src/audit/memoryRepository.ts`
- `agent/src/audit/supabaseRepository.ts`
- `agent/src/audit/indexer.ts`
- `agent/src/audit/replay.ts`
- `agent/src/audit/index.ts`
- `agent/src/auditIndexer.ts`
- `agent/src/auditReplay.ts`
- `agent/test/auditJournal.test.ts`
- `agent/test/auditMigration.test.ts`
- `docs/AUDIT_DATA_DICTIONARY.md`
- `master_instruction.md`
- `docs/handoffs/PHASE_7_HANDOFF.md`

## Contracts Changed

- NONE

## Database Changes

- Adds normalized audit enums and nine tables for preferences, mandates, observations, evidence, portfolios, decisions, proposals, attempts, and executions.
- Removes the anonymous `user_instances` insert policy.
- Enables RLS on all new tables; browser policies are owner-scoped preferences and read-only public projections.
- Adds evidence-verification, result/reason, invalid-evidence, identity, shape, and uniqueness constraints.
- Migration was not applied to a live database because no database URL/service credentials were provided.

## Tests Added

- Migration table/RLS/security/constraint contract tests.
- Duplicate ingestion and conflicting canonical log tests.
- Orphan marking and canonical replacement tests.
- Missing/tampered/matching decision replay tests.
- Canonical key-order-independent hashing tests.
- WAIT-not-submitted and invalid-evidence projection tests.

## Tests Passing

- `cd contracts && forge test`: 114 passed, 0 failed across 13 suites.
- `cd agent && npm test`: 98 passed, 0 failed across 14 files.
- `cd agent && npm run build`: passed.
- `cd frontend && npm run lint`: passed.
- `cd frontend && npm run build`: passed with the pre-existing bundle-size warning.
- Static migration tests: 5 passed; no live Postgres/Supabase migration smoke test was available.

## Deployment Changes

- No contract deployment or address change.
- Adds database migration `0002_audit_journal.sql` and server environment requirements: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDITCOIN_RPC_URL`, `AUDIT_TREASURIES`, `AUDIT_FROM_BLOCK`.
- Contract sizes remain treasury 20,954 bytes and factory 24,521 bytes (55-byte factory margin).

## Security Impact

- Chain receipt plus `getAttempt` remains authoritative; Supabase cannot authorize or move funds.
- Browser clients receive no audit mutation policy and no service-role credential path.
- `VERIFIED_ONCHAIN` requires reconciled transaction/block data; invalid evidence cannot be marked verified by the constrained schema.
- Missing or tampered off-chain artifacts render explicitly rather than being fabricated.

## Known Limitations

- The migration was validated statically but not executed against a live Supabase/Postgres instance.
- The indexer requires configured treasury addresses and a starting block; automatic factory-event discovery/checkpoint scheduling is deferred to deployment hardening.
- Runtime strategy orchestration still uses the legacy local reasoning store until later integration.
- Phase 8 must build the UI/API consumption layer over these projections.

## Remaining Work

- Apply and smoke-test migrations in a configured Supabase project.
- Add production scheduling, confirmation-depth configuration, checkpoints, and alerting during deployment hardening.
- Implement strategy-aware mandate/replay UI in Phase 8.

## Next Phase

Phase 8 — Frontend and Mandate UX

## Locked Decisions That Must Not Change

- Supabase remains a non-authoritative projection.
- Service-role credentials remain server-only and must never use a `VITE_` prefix.
- WAIT is not a policy rejection; missing artifacts and legacy data remain explicitly labeled.
- Only reconciled chain state may assert verified evidence, canonical policy result, or successful execution.
- Legacy and schema-v1 replay decoders remain distinct.
- No Solidity scope should be added casually; factory EIP-170 margin is only 55 bytes.

## Architectural Concerns

- NONE
