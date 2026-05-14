create extension if not exists pgcrypto;

create table if not exists public.trade_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_date date not null,
  sleep_quality text,
  sleep_hours text,
  meditation_done text,
  showered text,
  food_and_water text,
  energy_level int,
  focus_level int,
  desk_clean text,
  room_clean text,
  phone_distraction_off text,
  external_influence text,
  current_emotion text,
  previous_result_bothering text,
  revenge_risk text,
  financial_pressure text,
  stress_level int,
  confidence_level int,
  plan_reviewed text,
  news_checked text,
  market_bias text,
  key_levels_marked text,
  max_loss_accepted text,
  a_plus_setup_only text,
  max_trades_today int,
  today_rule text,
  if_then_plan_1 text,
  if_then_plan_2 text,
  if_then_plan_3 text,
  notes text,
  score int,
  status text,
  hard_block boolean default false,
  reasons jsonb not null default '[]'::jsonb,
  no_trade_day boolean default false,
  discipline_win boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, check_date)
);

alter table public.trade_readiness_checks enable row level security;

drop policy if exists "readiness_select_own" on public.trade_readiness_checks;
create policy "readiness_select_own"
on public.trade_readiness_checks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "readiness_insert_own" on public.trade_readiness_checks;
create policy "readiness_insert_own"
on public.trade_readiness_checks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "readiness_update_own" on public.trade_readiness_checks;
create policy "readiness_update_own"
on public.trade_readiness_checks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "readiness_delete_own" on public.trade_readiness_checks;
create policy "readiness_delete_own"
on public.trade_readiness_checks
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.trade_readiness_checks to authenticated;
