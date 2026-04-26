-- DailyPlaylists-style automatic Spotify submission gates (MVP)
-- Curators connect Spotify, pick eligible playlists, define gates; system auto-adds tracks on artist submit.

-- ── Curator Spotify tokens (server-side) ──────────────────────
-- Stored for use by Edge Functions. Client should not read raw tokens.
create table if not exists curator_spotify_tokens (
  curator_id uuid primary key references profiles(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  token_type text,
  updated_at timestamptz default now()
);

alter table curator_spotify_tokens enable row level security;

drop policy if exists "cst_admin_all" on curator_spotify_tokens;
drop policy if exists "cst_no_client_access" on curator_spotify_tokens;

-- No client access by default (functions use service role).
create policy "cst_no_client_access" on curator_spotify_tokens for all using (false) with check (false);
create policy "cst_admin_all" on curator_spotify_tokens for all using (current_user_role() = 'admin');

-- ── Gates ────────────────────────────────────────────────────
create table if not exists curator_submission_gates (
  id uuid default gen_random_uuid() primary key,
  curator_id uuid not null references profiles(id) on delete cascade,
  active bool default true,
  allowed_genres text[] default '{}'::text[], -- empty = allow all
  min_credits int default 0,
  max_auto_add_per_day int default 50,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint curator_submission_gates_one_per_curator unique (curator_id)
);

alter table curator_submission_gates enable row level security;
drop policy if exists "csg_owner_all" on curator_submission_gates;
drop policy if exists "csg_admin_all" on curator_submission_gates;
create policy "csg_owner_all" on curator_submission_gates for all using (curator_id = auth.uid()) with check (curator_id = auth.uid());
create policy "csg_admin_all" on curator_submission_gates for all using (current_user_role() = 'admin');

-- ── Playlist eligibility ──────────────────────────────────────
alter table curator_playlists add column if not exists auto_add_enabled bool default false;
alter table curator_playlists add column if not exists spotify_playlist_id text;

-- Backfill spotify_playlist_id from spotify_url if missing (best-effort).
update curator_playlists
set spotify_playlist_id = regexp_replace(spotify_url, '.*open\\.spotify\\.com\\/(?:intl-[a-z]{2}\\/)?playlist\\/([A-Za-z0-9]+).*', '\\1')
where spotify_playlist_id is null
  and spotify_url ilike '%open.spotify.com/%/playlist/%';

create index if not exists curator_playlists_auto_add_idx on curator_playlists(curator_id, auto_add_enabled);

-- ── Audit: auto-add attempts ─────────────────────────────────
create table if not exists spotify_auto_add_attempts (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  submission_id uuid references submissions(id) on delete cascade,
  curator_id uuid not null references profiles(id) on delete cascade,
  playlist_id uuid references curator_playlists(id) on delete set null,
  spotify_playlist_id text,
  spotify_track_id text,
  status text not null check (status in ('queued','skipped','success','failed')) default 'queued',
  reason text,
  spotify_snapshot_id text,
  created_at timestamptz default now()
);

create index if not exists saa_curator_created_idx on spotify_auto_add_attempts(curator_id, created_at desc);
create index if not exists saa_campaign_idx on spotify_auto_add_attempts(campaign_id);

alter table spotify_auto_add_attempts enable row level security;
drop policy if exists "saa_curator_read" on spotify_auto_add_attempts;
drop policy if exists "saa_artist_read" on spotify_auto_add_attempts;
drop policy if exists "saa_admin_all" on spotify_auto_add_attempts;

create policy "saa_curator_read" on spotify_auto_add_attempts for select using (curator_id = auth.uid());
create policy "saa_artist_read" on spotify_auto_add_attempts for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and c.artist_id = auth.uid())
);
create policy "saa_admin_all" on spotify_auto_add_attempts for all using (current_user_role() = 'admin');

