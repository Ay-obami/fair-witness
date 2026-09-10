-- Phase 7 — normalized, chain-reconciled Fair Witness audit projection.
-- Apply with a database owner/service migration role, never a browser key.

create type public.audit_sync_status as enum ('PENDING', 'CANONICAL', 'ORPHANED');
create type public.evidence_validation_status as enum ('UNVERIFIED', 'VERIFIED_ONCHAIN', 'INVALID');
create type public.ai_decision_outcome as enum ('EXECUTE', 'WAIT');
create type public.proposal_lifecycle as enum ('BUILT', 'SUBMITTED', 'REJECTED', 'EXECUTED', 'EXECUTION_FAILED');

-- Remove the Phase 0 PoC anonymous identity write. New associations must be
-- written by a server after wallet/owner verification.
drop policy if exists "user_instances_upsert" on public.user_instances;

create table public.ui_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_treasury text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ui_preferences_treasury_shape check (selected_treasury is null or selected_treasury ~ '^0x[0-9a-fA-F]{40}$')
);

create table public.mandate_projections (
  chain_id bigint not null,
  treasury_address text not null,
  policy_hash text not null,
  mandate jsonb not null,
  automation_mode smallint not null check (automation_mode between 0 and 1),
  policy_epoch bigint not null check (policy_epoch >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null,
  sync_status public.audit_sync_status not null default 'PENDING',
  updated_at timestamptz not null default now(),
  primary key (chain_id, treasury_address),
  constraint mandate_treasury_shape check (treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
  constraint mandate_policy_hash_shape check (policy_hash ~ '^0x[0-9a-fA-F]{64}$'),
  constraint mandate_block_hash_shape check (block_hash ~ '^0x[0-9a-fA-F]{64}$')
);

create table public.evidence_bundles (
  evidence_hash text primary key check (evidence_hash ~ '^0x[0-9a-fA-F]{64}$'),
  source_chain_key bigint not null check (source_chain_key >= 0),
  source_block_height bigint not null check (source_block_height >= 0),
  source_tx_index bigint not null check (source_tx_index >= 0),
  confirm_block_height bigint not null check (confirm_block_height > source_block_height),
  confirm_tx_index bigint not null check (confirm_tx_index >= 0),
  observer_address text not null check (observer_address ~ '^0x[0-9a-fA-F]{40}$'),
  source_pool_address text not null check (source_pool_address ~ '^0x[0-9a-fA-F]{40}$'),
  proof_object_locator text,
  proof_digest text check (proof_digest is null or proof_digest ~ '^0x[0-9a-fA-F]{64}$'),
  validation_status public.evidence_validation_status not null default 'UNVERIFIED',
  validation_tx_hash text,
  validation_block_hash text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_chain_key, source_block_height, source_tx_index, confirm_block_height, confirm_tx_index, observer_address, source_pool_address),
  constraint evidence_verified_receipt check (
    validation_status <> 'VERIFIED_ONCHAIN'
    or (validation_tx_hash ~ '^0x[0-9a-fA-F]{64}$' and validation_block_hash ~ '^0x[0-9a-fA-F]{64}$' and reconciled_at is not null)
  )
);

create table public.observations (
  observation_hash text primary key check (observation_hash ~ '^0x[0-9a-fA-F]{64}$'),
  chain_id bigint not null,
  treasury_address text not null check (treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
  evidence_hash text not null references public.evidence_bundles(evidence_hash),
  source_block_height bigint not null,
  destination_block_number bigint not null,
  destination_block_hash text not null check (destination_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.portfolio_snapshots (
  id bigint generated always as identity primary key,
  chain_id bigint not null,
  treasury_address text not null check (treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
  block_number bigint not null,
  block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  wctc_balance numeric(78,0) not null check (wctc_balance >= 0),
  stable_balance numeric(78,0) not null check (stable_balance >= 0),
  wctc_value_e6 numeric(78,0) not null check (wctc_value_e6 >= 0),
  portfolio_value_e6 numeric(78,0) not null check (portfolio_value_e6 >= 0),
  current_wctc_bps integer check (current_wctc_bps between 0 and 10000),
  observation_hash text references public.observations(observation_hash),
  evidence_hash text references public.evidence_bundles(evidence_hash),
  sync_status public.audit_sync_status not null default 'PENDING',
  unique (chain_id, treasury_address, block_hash)
);

create table public.ai_decisions (
  decision_hash text primary key check (decision_hash ~ '^0x[0-9a-fA-F]{64}$'),
  observation_hash text not null references public.observations(observation_hash),
  evidence_hash text not null references public.evidence_bundles(evidence_hash),
  policy_hash text not null check (policy_hash ~ '^0x[0-9a-fA-F]{64}$'),
  strategy smallint not null check (strategy between 0 and 2),
  outcome public.ai_decision_outcome not null,
  candidate_envelope jsonb not null,
  prompt_template_version text not null,
  provider text not null,
  model text not null,
  temperature numeric,
  seed bigint,
  structured_output jsonb not null,
  rationale text not null,
  created_at timestamptz not null default now()
);

create table public.proposals (
  proposal_id text primary key check (proposal_id ~ '^0x[0-9a-fA-F]{64}$'),
  decision_hash text not null references public.ai_decisions(decision_hash),
  observation_hash text not null references public.observations(observation_hash),
  evidence_hash text not null references public.evidence_bundles(evidence_hash),
  policy_hash text not null check (policy_hash ~ '^0x[0-9a-fA-F]{64}$'),
  chain_id bigint not null,
  treasury_address text not null check (treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
  submitting_agent text not null check (submitting_agent ~ '^0x[0-9a-fA-F]{40}$'),
  nonce numeric(20,0) not null check (nonce >= 0),
  typed_fields jsonb not null,
  encoded_proposal text not null check (encoded_proposal ~ '^0x[0-9a-fA-F]*$'),
  lifecycle public.proposal_lifecycle not null default 'BUILT',
  created_at timestamptz not null default now()
);

create table public.policy_attempts (
  chain_id bigint not null,
  treasury_address text not null check (treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
  attempt_id numeric(20,0) not null check (attempt_id > 0),
  nonce numeric(20,0) not null check (nonce >= 0),
  source_chain_key numeric(20,0) not null check (source_chain_key >= 0),
  source_block_height numeric(20,0) not null check (source_block_height >= 0),
  source_tx_index numeric(20,0) not null check (source_tx_index >= 0),
  confirm_block_height numeric(20,0) not null check (confirm_block_height >= 0),
  confirm_tx_index numeric(20,0) not null check (confirm_tx_index >= 0),
  agent text not null check (agent ~ '^0x[0-9a-fA-F]{40}$'),
  asset_in text not null check (asset_in ~ '^0x[0-9a-fA-F]{40}$'),
  asset_out text not null check (asset_out ~ '^0x[0-9a-fA-F]{40}$'),
  venue text not null check (venue ~ '^0x[0-9a-fA-F]{40}$'),
  proposal_id text not null check (proposal_id ~ '^0x[0-9a-fA-F]{64}$'),
  execution_key text not null check (execution_key ~ '^0x[0-9a-fA-F]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^0x[0-9a-fA-F]{64}$'),
  observation_hash text not null check (observation_hash ~ '^0x[0-9a-fA-F]{64}$'),
  decision_hash text not null check (decision_hash ~ '^0x[0-9a-fA-F]{64}$'),
  policy_hash text not null check (policy_hash ~ '^0x[0-9a-fA-F]{64}$'),
  strategy smallint not null check (strategy between 0 and 2),
  action smallint not null check (action = 0),
  result smallint not null check (result between 0 and 2),
  reason smallint not null check (reason between 0 and 33),
  evidence_status smallint not null check (evidence_status between 0 and 2),
  evaluated_state_hash text check (evaluated_state_hash is null or evaluated_state_hash ~ '^0x[0-9a-fA-F]{64}$'),
  permitted_value_e6 numeric(39,0) not null check (permitted_value_e6 >= 0),
  proposed_amount_in numeric(39,0) not null check (proposed_amount_in >= 0),
  amount_in_actual numeric(39,0) not null check (amount_in_actual >= 0),
  amount_out_actual numeric(39,0) not null check (amount_out_actual >= 0),
  current_wctc_bps integer not null check (current_wctc_bps between 0 and 10000),
  reference_bps integer not null check (reference_bps between 0 and 65535),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_number bigint not null,
  block_hash text not null check (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
  log_index integer not null check (log_index >= 0),
  sync_status public.audit_sync_status not null default 'PENDING',
  submitted_at timestamptz not null,
  resolved_at timestamptz not null,
  primary key (chain_id, treasury_address, attempt_id),
  unique (chain_id, transaction_hash, log_index),
  constraint attempt_result_reason check ((result = 1 and reason = 0) or result <> 1),
  constraint invalid_evidence_not_verified check (not (evidence_status = 2 and reason in (15, 16)))
);

create table public.executions (
  chain_id bigint not null,
  treasury_address text not null,
  attempt_id numeric(20,0) not null,
  execution_key text not null check (execution_key ~ '^0x[0-9a-fA-F]{64}$'),
  asset_in text not null check (asset_in ~ '^0x[0-9a-fA-F]{40}$'),
  asset_out text not null check (asset_out ~ '^0x[0-9a-fA-F]{40}$'),
  venue text not null check (venue ~ '^0x[0-9a-fA-F]{40}$'),
  amount_in numeric(39,0) not null check (amount_in > 0),
  amount_out numeric(39,0) not null check (amount_out > 0),
  receipt jsonb not null,
  post_state jsonb,
  sync_status public.audit_sync_status not null default 'PENDING',
  primary key (chain_id, treasury_address, attempt_id),
  unique (chain_id, treasury_address, execution_key),
  foreign key (chain_id, treasury_address, attempt_id)
    references public.policy_attempts(chain_id, treasury_address, attempt_id)
);

create index policy_attempts_proposal_idx on public.policy_attempts(proposal_id);
create index policy_attempts_chain_position_idx on public.policy_attempts(chain_id, block_number, log_index);
create index ai_decisions_outcome_idx on public.ai_decisions(outcome, created_at desc);

alter table public.ui_preferences enable row level security;
alter table public.mandate_projections enable row level security;
alter table public.evidence_bundles enable row level security;
alter table public.observations enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.ai_decisions enable row level security;
alter table public.proposals enable row level security;
alter table public.policy_attempts enable row level security;
alter table public.executions enable row level security;

create policy "ui_preferences_owner_select" on public.ui_preferences for select using (auth.uid() = user_id);
create policy "ui_preferences_owner_insert" on public.ui_preferences for insert with check (auth.uid() = user_id);
create policy "ui_preferences_owner_update" on public.ui_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reconciled chain projections are public facts. No browser write policies exist.
create policy "mandates_public_read" on public.mandate_projections for select using (sync_status = 'CANONICAL');
create policy "evidence_public_read" on public.evidence_bundles for select using (true);
create policy "observations_public_read" on public.observations for select using (true);
create policy "portfolios_public_read" on public.portfolio_snapshots for select using (sync_status = 'CANONICAL');
create policy "decisions_public_read" on public.ai_decisions for select using (true);
create policy "proposals_public_read" on public.proposals for select using (true);
create policy "attempts_public_read" on public.policy_attempts for select using (sync_status = 'CANONICAL');
create policy "executions_public_read" on public.executions for select using (sync_status = 'CANONICAL');

comment on table public.policy_attempts is 'Projection only: Creditcoin receipt plus FairWitnessTreasury.getAttempt are authoritative.';
comment on table public.ai_decisions is 'Includes WAIT decisions; WAIT has no proposal, policy_attempt, or execution row.';
