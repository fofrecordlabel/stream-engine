/**
 * StreamEngine V1 — canonical rules for song, campaign, and signup deduplication.
 * (Comments are the product contract; keep in sync with DB constraints in supabase/migrations.)
 */

/** Spotify track id is the canonical dedupe key when present (trimmed). */
export function spotifyTrackKey(song) {
  if (!song) return ''
  const id = song.spotifyId || song.spotify_id || song.trackId || ''
  return String(id).trim()
}

/**
 * Campaign statuses that block starting another Playlist Push for the same song.
 * Re-submit is allowed only after the campaign leaves these states (e.g. approved, declined, cancelled).
 */
export const BLOCKING_CAMPAIGN_STATUSES = Object.freeze(
  new Set(['pending', 'in_review', 'active', 'processing', 'submitted', 'draft'])
)

/** Terminal / non-blocking statuses — a new campaign may be created after this. */
export const TERMINAL_CAMPAIGN_STATUSES = Object.freeze(
  new Set(['approved', 'declined', 'rejected', 'cancelled', 'completed', 'failed', 'closed', 'archived'])
)

export function campaignStatusBlocksResubmit(status) {
  const s = String(status || '').toLowerCase().trim()
  if (!s) return false
  if (TERMINAL_CAMPAIGN_STATUSES.has(s)) return false
  return BLOCKING_CAMPAIGN_STATUSES.has(s)
}

/**
 * True if this user already has a blocking campaign for this song (by DB song id or Spotify id on nested song).
 */
export function hasBlockingActiveCampaignForSong(song, campaigns) {
  if (!song || !Array.isArray(campaigns)) return false
  const sid = spotifyTrackKey(song)
  const songId = song.id != null ? String(song.id) : ''
  return campaigns.some((c) => {
    if (!campaignStatusBlocksResubmit(c.status)) return false
    if (songId && String(c.song_id) === songId) return true
    const rel = c.songs
    const relSid = rel && String(rel.spotify_id || rel.spotifyId || '').trim()
    return !!(sid && relSid && relSid === sid)
  })
}

/** Supabase GoTrue / common API copy when email is already registered. */
export function isUserAlreadyRegisteredError(error) {
  if (!error) return false
  const msg = String(error.message || error.error_description || '').toLowerCase()
  const code = String(error.code || error.status || '').toLowerCase()
  if (code === 'user_already_exists') return true
  if (msg.includes('already registered')) return true
  if (msg.includes('user already exists')) return true
  if (msg.includes('email address is already registered')) return true
  if (msg.includes('already been registered')) return true
  return false
}
