create extension if not exists pgcrypto;

create table if not exists public.clean_day_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_name text not null,
  target_days integer not null check (target_days in (7, 15, 30)),
  status text not null default 'ACTIVE',
  start_local_date date not null,
  current_day_number integer not null default 1,
  clean_days_count integer not null default 0,
  recovered_days_count integer not null default 0,
  not_clean_days_count integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_clean_day_challenges_one_active_per_user
  on public.clean_day_challenges (user_id)
  where status = 'ACTIVE';

create index if not exists idx_clean_day_challenges_user_created
  on public.clean_day_challenges (user_id, created_at desc);

create table if not exists public.clean_day_challenge_days (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.clean_day_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  day_number integer not null,
  checkins_completed integer not null default 0,
  final_cigarette_count integer not null default 0,
  sleep_protection_started boolean not null default false,
  close_day_result text,
  daily_status text,
  hourly_checkins jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(challenge_id, day_number),
  unique(challenge_id, local_date)
);

create index if not exists idx_clean_day_challenge_days_user_date
  on public.clean_day_challenge_days (user_id, local_date desc);

alter table public.clean_day_challenges enable row level security;
alter table public.clean_day_challenge_days enable row level security;

drop policy if exists "clean_day_challenges_select_own" on public.clean_day_challenges;
create policy "clean_day_challenges_select_own"
on public.clean_day_challenges
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "clean_day_challenges_insert_own" on public.clean_day_challenges;
create policy "clean_day_challenges_insert_own"
on public.clean_day_challenges
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "clean_day_challenges_update_own" on public.clean_day_challenges;
create policy "clean_day_challenges_update_own"
on public.clean_day_challenges
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "clean_day_challenges_delete_own" on public.clean_day_challenges;
create policy "clean_day_challenges_delete_own"
on public.clean_day_challenges
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "clean_day_challenge_days_select_own" on public.clean_day_challenge_days;
create policy "clean_day_challenge_days_select_own"
on public.clean_day_challenge_days
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "clean_day_challenge_days_insert_own" on public.clean_day_challenge_days;
create policy "clean_day_challenge_days_insert_own"
on public.clean_day_challenge_days
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "clean_day_challenge_days_update_own" on public.clean_day_challenge_days;
create policy "clean_day_challenge_days_update_own"
on public.clean_day_challenge_days
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "clean_day_challenge_days_delete_own" on public.clean_day_challenge_days;
create policy "clean_day_challenge_days_delete_own"
on public.clean_day_challenge_days
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.clean_day_challenges to authenticated;
grant select, insert, update, delete on table public.clean_day_challenge_days to authenticated;
