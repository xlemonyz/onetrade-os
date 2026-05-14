-- One Trade Discipline Challenge setup (idempotent)
-- Optional: the app currently supports storing this model in project data payload too.

create table if not exists public.discipline_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  challenge_type text not null default 'ONE_TRADE_DISCIPLINE',
  target_clean_days integer not null default 10,
  completed_clean_days integer not null default 0,
  current_streak integer not null default 0,
  rule_breaks integer not null default 0,
  status text not null default 'ACTIVE',
  restart_on_break boolean not null default true,
  start_date date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discipline_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  challenge_id uuid references public.discipline_challenges(id) on delete cascade,
  trade_date date not null,
  status text not null default 'WAITING',
  trades_count integer not null default 0,
  is_clean_day boolean not null default false,
  score integer not null default 0,
  commitment_completed boolean not null default false,
  journal_completed boolean not null default false,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, trade_date)
);

create table if not exists public.discipline_trade_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  challenge_id uuid references public.discipline_challenges(id) on delete cascade,
  discipline_day_id uuid references public.discipline_days(id) on delete cascade,
  trade_id uuid,
  event_type text not null,
  result text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  challenge_id uuid references public.discipline_challenges(id) on delete cascade,
  commitment_date date not null,
  rule_text text not null,
  committed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (challenge_id, commitment_date)
);
