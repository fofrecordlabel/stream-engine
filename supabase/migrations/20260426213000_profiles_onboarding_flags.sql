-- Onboarding completion flags (artist + curator).
-- Used by the frontend to route first-time users into a guided setup flow.

alter table profiles add column if not exists artist_onboarded boolean default false;
alter table profiles add column if not exists curator_onboarded boolean default false;
alter table profiles add column if not exists onboarded_at timestamptz;

-- Backfill nulls for safety
update profiles set artist_onboarded = false where artist_onboarded is null;
update profiles set curator_onboarded = false where curator_onboarded is null;

