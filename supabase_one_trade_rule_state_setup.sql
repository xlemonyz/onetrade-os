-- One Trade Rule state persistence (user-level JSON snapshot)
-- Run once in Supabase SQL Editor.

create table if not exists public.one_trade_rule_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_one_trade_rule_states_updated
  on public.one_trade_rule_states (updated_at desc);

alter table public.one_trade_rule_states enable row level security;

drop policy if exists "one_trade_rule_states_select_own" on public.one_trade_rule_states;
create policy "one_trade_rule_states_select_own"
on public.one_trade_rule_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_rule_states_insert_own" on public.one_trade_rule_states;
create policy "one_trade_rule_states_insert_own"
on public.one_trade_rule_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "one_trade_rule_states_update_own" on public.one_trade_rule_states;
create policy "one_trade_rule_states_update_own"
on public.one_trade_rule_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "one_trade_rule_states_delete_own" on public.one_trade_rule_states;
create policy "one_trade_rule_states_delete_own"
on public.one_trade_rule_states
for delete
to authenticated
using (auth.uid() = user_id);

