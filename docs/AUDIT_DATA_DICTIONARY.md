# Audit Data Dictionary and Operations

Phase 7 projects Fair Witness records into Supabase for query and replay. Creditcoin receipts and `FairWitnessTreasury.getAttempt` remain authoritative; database rows never authorize execution.

## Record chain

`observations` → `evidence_bundles` → `ai_decisions` → `proposals` → `policy_attempts` → `executions`

- `observations`: canonical AI-visible source, destination, portfolio, and block-referenced snapshot.
- `evidence_bundles`: proof locations/artifacts and reconciliation state. Only a reconciled chain result may set `VERIFIED_ONCHAIN`.
- `ai_decisions`: canonical prompt/result envelope. `WAIT` ends here and is displayed as `WAIT — NOT SUBMITTED`.
- `proposals`: deterministic schema-v1 proposal artifact. Its absence must not prevent chain attempt ingestion.
- `policy_attempts`: complete projection of the typed on-chain attempt plus chain/log identity. Rejections, executions, and caught execution failures are distinct.
- `executions`: successful asset movement associated one-to-one with an executed attempt.
- `portfolio_snapshots`: block-hash-bound accounting snapshots.
- `mandate_projections`: chain-derived immutable mandate/mode projection.
- `ui_preferences`: the only user-private application-authority table.

## Authority rules

- Browser clients have read-only access to public audit projections and owner-only access to their UI preferences.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `VITE_`, commit it, log it, or bundle it in the frontend.
- A database `VERIFIED_ONCHAIN`, `EXECUTED`, or `CANONICAL` label is only a cache of reconciled chain truth.
- Missing reasoning/proof/proposal rows are shown as missing artifacts, never synthesized.
- Legacy `ASCTreasuryJournal` entries use their legacy decoder and label.

## Apply and run

1. Back up the database and apply `0001_user_instances.sql`, then `0002_audit_journal.sql` using the database owner/migration role.
2. Configure the server process with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDITCOIN_RPC_URL`, `AUDIT_TREASURIES`, and `AUDIT_FROM_BLOCK`.
3. Run `cd agent && npm run index:audit`.
4. Re-running the same range is idempotent by treasury attempt identity and `(chain_id, transaction_hash, log_index)`.
5. Replay schema-v1 data with `npm run replay:audit -- <chainId> <treasuryAddress> <attemptId>`. The existing `npm run replay -- <actionKey>` remains the explicit legacy decoder.

## Reconciliation and reorgs

Before presenting a row as canonical, compare its stored block hash with `eth_getBlockByNumber`. A mismatch marks every projection from the old hash `ORPHANED`; re-ingest from the last finalized checkpoint. Do not delete orphaned rows immediately—they are audit evidence. Production scheduling should index only to a configured confirmation depth and periodically reconcile the recent window.

## Backup and retention

- Use managed point-in-time recovery where available and export audit tables before migrations.
- Retain canonical and orphaned policy attempts for the project lifetime.
- Proof bodies may move to object storage, but retain their content digest and locator.
- Never back up private keys because none belong in Supabase.
