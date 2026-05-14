alter table if exists public.clean_day_entries
  add column if not exists evening_location text,
  add column if not exists evening_went_carrom_place text,
  add column if not exists evening_played_carrom text,
  add column if not exists smoking_done text,
  add column if not exists cigarette_count integer,
  add column if not exists evening_state text,
  add column if not exists evening_reset_started_at timestamptz,
  add column if not exists evening_reset_completed boolean not null default false,
  add column if not exists emergency_lock_activated boolean not null default false,
  add column if not exists closed_at timestamptz;
