-- StreamEngine V1 — dedupe safety (run after one-time data cleanup if duplicates exist).
--
-- 1) SONGS: at most one row per artist + Spotify track id (when spotify_id is set).
--    If this fails, run cleanup SQL to merge/delete duplicates first (see songDedupe.js
--    `collapseDuplicateSongsForArtist`, or manual UPDATE campaigns SET song_id = …).
CREATE UNIQUE INDEX IF NOT EXISTS songs_artist_spotify_id_unique
  ON public.songs (artist_id, spotify_id)
  WHERE spotify_id IS NOT NULL AND btrim(spotify_id) <> '';

-- 2) CAMPAIGNS: at most one “open” Playlist Push row per artist + song while status is pending.
--    Adjust the WHERE list to match your product statuses (see src/lib/dedupeRules.js).
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_one_pending_per_song
  ON public.campaigns (artist_id, song_id)
  WHERE coalesce(status, '') = 'pending';

-- 3) PROFILES: primary key on `id` (auth user id) already enforces one profile per user.
--    Optional: if you add a denormalized `email` column on profiles, consider:
--    CREATE UNIQUE INDEX profiles_email_lower_unique ON public.profiles (lower(trim(email)))
--    WHERE email IS NOT NULL AND btrim(email) <> '';
