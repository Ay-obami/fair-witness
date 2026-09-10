-- Public hackathon demo requests. Requests are an operator inbox only: they do not
-- authorize or trigger on-chain execution and are deliberately separate from audit truth.

create table if not exists public.demo_requests (
  request_id uuid primary key,
  client_id uuid not null,
  strategy text not null check (strategy in ('ARBITRAGE', 'REBALANCING', 'RISK_REDUCTION')),
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'ACKNOWLEDGED', 'COMPLETED', 'DECLINED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_requests_status_created_idx on public.demo_requests (status, created_at);
create index if not exists demo_requests_client_created_idx on public.demo_requests (client_id, created_at desc);

alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;
grant insert (request_id, client_id, strategy) on public.demo_requests to anon, authenticated;

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert" on public.demo_requests
  for insert to anon, authenticated
  with check (status = 'REQUESTED');

-- Browser clients cannot select, update, or delete requests. The service role/database
-- operator reviews the queue. This trigger limits accidental repeat submissions; it is
-- not an authentication or execution-security boundary.
create or replace function public.limit_demo_requests()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.demo_requests
    where client_id = new.client_id and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'Please wait five minutes before requesting another demonstration.' using errcode = 'P0001';
  end if;
  new.status := 'REQUESTED';
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists demo_requests_rate_limit on public.demo_requests;
create trigger demo_requests_rate_limit before insert on public.demo_requests
  for each row execute function public.limit_demo_requests();
