-- Hardening for Spotify auto-add + DailyPlaylists-style announcements and curator levels (standard-only).

-- ── Auto-add attempt hardening ────────────────────────────────
alter table spotify_auto_add_attempts add column if not exists attempt_count int default 0;
alter table spotify_auto_add_attempts add column if not exists next_attempt_at timestamptz;

-- Prevent duplicate adds of the same track to the same playlist (regardless of campaign).
create unique index if not exists saa_unique_playlist_track
  on spotify_auto_add_attempts(spotify_playlist_id, spotify_track_id)
  where spotify_playlist_id is not null and spotify_track_id is not null and status = 'success';

-- ── Curator levels (standard-only) ────────────────────────────
alter table curator_profiles add column if not exists curator_level text default 'standard';
alter table curator_profiles add column if not exists level_updated_at timestamptz default now();

-- Curator level applications (admin-reviewed)
create table if not exists curator_level_applications (
  id uuid default gen_random_uuid() primary key,
  curator_id uuid not null references profiles(id) on delete cascade,
  requested_level text not null,
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  note text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

create index if not exists cla_curator_created_idx on curator_level_applications(curator_id, created_at desc);

alter table curator_level_applications enable row level security;
drop policy if exists "cla_owner_read_insert" on curator_level_applications;
drop policy if exists "cla_admin_all" on curator_level_applications;

create policy "cla_owner_read_insert" on curator_level_applications
  for select using (curator_id = auth.uid());
create policy "cla_owner_insert" on curator_level_applications
  for insert with check (curator_id = auth.uid());
create policy "cla_admin_all" on curator_level_applications for all using (current_user_role() = 'admin');

-- ── Announcement banners (dismissible) ────────────────────────
create table if not exists announcements (
  id uuid default gen_random_uuid() primary key,
  active bool default true,
  audience text not null check (audience in ('all','artists','curators','admins')) default 'all',
  title text not null,
  body text,
  cta_label text,
  cta_url text,
  created_at timestamptz default now()
);

alter table announcements enable row level security;
drop policy if exists "ann_public_read" on announcements;
drop policy if exists "ann_admin_all" on announcements;
create policy "ann_public_read" on announcements for select using (active = true);
create policy "ann_admin_all" on announcements for all using (current_user_role() = 'admin');

create table if not exists announcement_dismissals (
  id uuid default gen_random_uuid() primary key,
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  dismissed_at timestamptz default now(),
  constraint ann_dismiss_unique unique (announcement_id, user_id)
);

alter table announcement_dismissals enable row level security;
drop policy if exists "ann_dismiss_owner" on announcement_dismissals;
drop policy if exists "ann_dismiss_admin" on announcement_dismissals;
create policy "ann_dismiss_owner" on announcement_dismissals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ann_dismiss_admin" on announcement_dismissals for all using (current_user_role() = 'admin');

