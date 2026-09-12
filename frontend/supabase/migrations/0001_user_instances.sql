-- Optional public-chain wallet<->treasury projection.
-- Run this in the Supabase SQL editor or via psql.
-- Only an ANON/publishable key is used in the browser bundle.
--
-- IMPORTANT: do not store login email/social identity here. Wallet ownership and
-- treasury addresses are public on-chain; the user's email is not required for
-- discovery and should not be exposed through a public anon-readable table.

create extension if not exists pgcrypto;

create table if not exists public.user_instances (
  id               uuid primary key default gen_random_uuid(),
  wallet_address   text not null,
  instance_address text not null unique,
  created_at       timestamptz not null default now()
);

-- Upgrade older PoC installations that previously stored email addresses.
drop index if exists public.user_instances_email_idx;
alter table public.user_instances drop column if exists email;

create index if not exists user_instances_wallet_idx on public.user_instances (wallet_address);

alter table public.user_instances enable row level security;

-- These values are convenience copies of relationships already visible on-chain.
-- The dashboard still validates every instance against the active factory and owner.
drop policy if exists "user_instances_select" on public.user_instances;
create policy "user_instances_select" on public.user_instances
  for select using (true);

drop policy if exists "user_instances_upsert" on public.user_instances;
create policy "user_instances_upsert" on public.user_instances
  for insert with check (true);

-- No update/delete policies: mappings remain append-only for this hackathon cache.
