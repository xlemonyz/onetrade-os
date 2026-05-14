-- One Trade Rule (user-level, project-independent) setup
-- Safe to run multiple times.

create table if not exists public.one_trade_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_clean_days integer not null check (target_clean_days in (5, 10, 15)),
  completed_clean_days integer not null default 0,
  current_streak integer not null default 0,
  rule_breaks integer not null default 0,
  status text not null default 'ACTIVE',
  start_date date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.one_trade_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.one_trade_challenges(id) on delete cascade,
  trading_day_key date not null,
  status text not null default 'WAITING',
  trades_count integer not null default 0,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, trading_day_key)
);

create table if not exists public.one_trade_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.one_trade_challenges(id) on delete cascade,
  trading_day_id uuid references public.one_trade_days(id) on delete cascade,
  trade_id uuid,
  event_type text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_one_trade_challenges_user_status
  on public.one_trade_challenges (user_id, status);

create index if not exists idx_one_trade_days_user_date
  on public.one_trade_days (user_id, trading_day_key desc);

create index if not exists idx_one_trade_events_user_created
  on public.one_trade_events (user_id, created_at desc);

alter table public.one_trade_challenges enable row level security;
alter table public.one_trade_days enable row level security;
alter table public.one_trade_events enable row level security;

drop policy if exists "one_trade_challenges_select_own" on public.one_trade_challenges;
create policy "one_trade_challenges_select_own"
on public.one_trade_challenges
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_challenges_insert_own" on public.one_trade_challenges;
create policy "one_trade_challenges_insert_own"
on public.one_trade_challenges
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "one_trade_challenges_update_own" on public.one_trade_challenges;
create policy "one_trade_challenges_update_own"
on public.one_trade_challenges
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "one_trade_challenges_delete_own" on public.one_trade_challenges;
create policy "one_trade_challenges_delete_own"
on public.one_trade_challenges
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_days_select_own" on public.one_trade_days;
create policy "one_trade_days_select_own"
on public.one_trade_days
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_days_insert_own" on public.one_trade_days;
create policy "one_trade_days_insert_own"
on public.one_trade_days
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "one_trade_days_update_own" on public.one_trade_days;
create policy "one_trade_days_update_own"
on public.one_trade_days
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "one_trade_days_delete_own" on public.one_trade_days;
create policy "one_trade_days_delete_own"
on public.one_trade_days
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_events_select_own" on public.one_trade_events;
create policy "one_trade_events_select_own"
on public.one_trade_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "one_trade_events_insert_own" on public.one_trade_events;
create policy "one_trade_events_insert_own"
on public.one_trade_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "one_trade_events_update_own" on public.one_trade_events;
create policy "one_trade_events_update_own"
on public.one_trade_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "one_trade_events_delete_own" on public.one_trade_events;
create policy "one_trade_events_delete_own"
on public.one_trade_events
for delete
to authenticated
using (auth.uid() = user_id);
