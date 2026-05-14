create extension if not exists pgcrypto;

create table if not exists public.clean_day_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  status text,
  morning_intention text,
  one_trade_rule_status text,
  evening_state text,
  evening_reset_started_at timestamptz,
  evening_reset_completed boolean not null default false,
  emergency_lock_activated boolean not null default false,
  evening_market_carrom_avoided boolean not null default false,
  evening_phone_away_after_11 boolean not null default false,
  evening_no_reels boolean not null default false,
  evening_no_porn boolean not null default false,
  evening_no_4am_market boolean not null default false,
  sleep_time text,
  wake_time text,
  sleep_quality text,
  meaningful_work text,
  reflection text,
  closed_at timestamptz,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, local_date)
);

create index if not exists idx_clean_day_entries_user_date
  on public.clean_day_entries (user_id, local_date desc);

alter table public.clean_day_entries enable row level security;

drop policy if exists "clean_day_entries_select_own" on public.clean_day_entries;
create policy "clean_day_entries_select_own"
on public.clean_day_entries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "clean_day_entries_insert_own" on public.clean_day_entries;
create policy "clean_day_entries_insert_own"
on public.clean_day_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "clean_day_entries_update_own" on public.clean_day_entries;
create policy "clean_day_entries_update_own"
on public.clean_day_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "clean_day_entries_delete_own" on public.clean_day_entries;
create policy "clean_day_entries_delete_own"
on public.clean_day_entries
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.clean_day_entries to authenticated;
