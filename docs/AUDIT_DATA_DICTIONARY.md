# Audit Data Dictionary and Operations

Creditcoin receipts and `FairWitnessTreasury.getAttempt()` are authoritative. Database rows are optional projections for querying, observability and richer artifact retention; they never authorize execution.

## On-chain record chain

A submitted schema-v1 attempt links the proposal identity, agent, strategy/action, evidence status, policy result/reason, evaluated-state commitment and actual execution amounts. Successful executions add the execution identity and token movement. Activity, Decision Detail and Verify read this chain-facing model directly.

An off-chain reasoning decision to `WAIT` is not submitted and therefore does not become an on-chain attempt.

## Optional richer audit projection

Where the audit migration/indexer is enabled, the logical record chain is:

```text
observations → evidence_bundles → ai_decisions → proposals → policy_attempts → executions
```

- `observations` — canonical reasoning-visible source/destination/portfolio snapshot.
- `evidence_bundles` — proof locations/artifacts and reconciliation state; only reconciled chain results may be labeled verified on-chain.
- `ai_decisions` — canonical model decision envelope; WAIT terminates here.
- `proposals` — deterministic schema-v1 proposal artifact.
- `policy_attempts` — projection of the typed on-chain attempt plus chain/log identity.
- `executions` — successful asset movement linked to an executed attempt.
- `portfolio_snapshots` — block-bound accounting snapshots.
- `mandate_projections` — chain-derived mandate/mode cache.

Missing off-chain reasoning/proof/proposal artifacts must be displayed as missing, never synthesized from the on-chain hashes.

## Public identity cache

`user_instances` is a convenience copy of a relationship that is already observable on-chain. Its current public schema is intentionally limited to:

```text
id
wallet_address
instance_address
created_at
```

It must not store login email or social identity. The dashboard independently validates discovered treasury ownership/factory provenance against chain state.

## Authority rules

- Chain state is authoritative for ownership, mandate, evidence result, policy result and execution.
- Supabase `VERIFIED_ONCHAIN`, `EXECUTED` or `CANONICAL` labels are cached conclusions that must be reconciled to chain data.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `VITE_`, commit it, log it or bundle it in the browser.
- Frontend validation and database RLS improve application safety/privacy but do not replace treasury authorization.

## Apply and operate the richer audit index

1. Back up the database.
2. Apply the migrations in `frontend/supabase/migrations/` in order using the database owner/migration role.
3. Configure only the server process with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` plus the required Creditcoin/indexer settings.
4. Run the audit indexer scripts from `agent/package.json` when that projection is desired.
5. Re-running an indexed range should remain idempotent by treasury attempt identity and `(chain_id, transaction_hash, log_index)`.

## Reconciliation and reorgs

A projection that claims a canonical chain block should retain the block number/hash needed for reconciliation. If a stored block hash no longer matches `eth_getBlockByNumber`, mark data derived from the old block as orphaned and re-ingest from the last finalized checkpoint. Do not silently rewrite audit history.

## Retention

- retain canonical and orphaned policy attempts for the project lifetime;
- proof bodies may move to object storage, but retain their digest and durable locator;
- preserve proposal/decision artifacts when they exist so commitments can be checked;
- never store raw private keys, OTPs or service credentials in audit tables or backups.
