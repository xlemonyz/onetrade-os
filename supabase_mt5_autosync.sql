-- MT5 Auto Sync schema setup
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key text not null unique,
  account_number text,
  broker_name text,
  platform text not null default 'MT5',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists broker_connections_user_platform_unique
  on public.broker_connections (user_id, platform);

alter table public.broker_connections enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.broker_connections to authenticated;

drop policy if exists "broker_connections_select_own" on public.broker_connections;
create policy "broker_connections_select_own"
  on public.broker_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "broker_connections_insert_own" on public.broker_connections;
create policy "broker_connections_insert_own"
  on public.broker_connections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "broker_connections_update_own" on public.broker_connections;
create policy "broker_connections_update_own"
  on public.broker_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "broker_connections_delete_own" on public.broker_connections;
create policy "broker_connections_delete_own"
  on public.broker_connections
  for delete
  to authenticated
  using (auth.uid() = user_id);

alter table public.trades add column if not exists broker_ticket text;
alter table public.trades add column if not exists broker_account_number text;
alter table public.trades add column if not exists broker_source text default 'MT5';
alter table public.trades add column if not exists imported_at timestamptz default now();

create unique index if not exists trades_mt5_unique_import
  on public.trades (user_id, broker_account_number, broker_ticket)
  where broker_ticket is not null and broker_account_number is not null;
