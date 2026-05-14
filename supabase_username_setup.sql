-- Run this once in Supabase SQL Editor.
-- Purpose: enforce globally unique usernames.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,20}$')
);

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.sync_profile_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text;
begin
  normalized_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  if normalized_username = '' then
    normalized_username := null;
  end if;

  insert into public.profiles (id, username, created_at, updated_at)
  values (new.id, normalized_username, now(), now())
  on conflict (id) do update
    set username = excluded.username,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of raw_user_meta_data on auth.users
for each row
execute function public.sync_profile_from_auth_users();

with base as (
  select
    u.id,
    nullif(lower(trim(u.raw_user_meta_data->>'username')), '') as normalized_username,
    u.created_at
  from auth.users u
),
dedup as (
  select
    id,
    normalized_username,
    row_number() over (
      partition by normalized_username
      order by created_at asc nulls last, id
    ) as rn
  from base
)
insert into public.profiles (id, username, created_at, updated_at)
select
  d.id,
  case
    when d.normalized_username is null then null
    when d.rn = 1 then d.normalized_username
    else null
  end as username,
  now(),
  now()
from dedup d
on conflict (id) do update
set username = excluded.username,
    updated_at = now();
