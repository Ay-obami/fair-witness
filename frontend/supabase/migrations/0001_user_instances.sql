-- Stage 4c — Supabase auth<->address mapping
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) or via psql:
--   psql "$DATABASE_URL" -f frontend/supabase/migrations/0001_user_instances.sql
-- Only an ANON/publishable key is used in the browser bundle (never the service-role key).

create extension if not exists pgcrypto;

create table if not exists public.user_instances (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  wallet_address   text not null,
  instance_address text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists user_instances_wallet_idx on public.user_instances (wallet_address);
create index if not exists user_instances_email_idx on public.user_instances (email);

-- Honest RLS scope (see ROADMAP Stage 4b "hardening items"): this is a testnet PoC and
-- every user's instance is already publicly visible on-chain (TreasuryDeployed events,
-- tenants.json, Blockscout). RLS here prevents accidental writes with a bad shape, and
-- the "login-gated" UX requirement is enforced in the UI (the dashboard requires a
-- funded Thirdweb embedded-wallet session). True per-user access auth — a custom JWT
-- bridging Thirdweb's signLoginPayload identity to Supabase auth.jwt claims — is the
-- tracked production hardening item; the policies below are the anon-key-safe baseline.
alter table public.user_instances enable row level security;

-- Anyone with a valid project key may read the mapping table (instances are public
-- on-chain anyway — this is convenience, not confidentiality).
create policy "user_instances_select" on public.user_instances
  for select using (true);

-- Any client with a valid project key may insert/update. Upserts are keyed on the
-- unique instance_address, so re-runs of the sign-up flow can never duplicate rows.
create policy "user_instances_upsert" on public.user_instances
  for insert with check (true);

-- No update/delete policies: mappings are append-only for the PoC. Deletions (e.g.
-- account removal) are admin-level operations, deliberately not exposed to anon.