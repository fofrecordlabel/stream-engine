const STORAGE_KEY = 'streamengine.pendingSubmission'
const TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export function normalizePendingSong(song = {}) {
  const spotifyUrl = song.spotifyUrl || song.spotify_url || null
  const trackId = song.trackId || song.spotifyId || song.spotify_id || song.id || null
  return {
    id: song.id || trackId || `draft-${Date.now()}`,
    trackId,
    spotifyId: trackId,
    spotifyUrl,
    title: song.title || song.song || '',
    artist: song.artist || song.artist_name || '',
    artworkUrl: song.artworkUrl || song.artwork_url || null,
    albumName: song.albumName || song.album_name || null,
    releaseDate: song.releaseDate || song.release_date || null,
    duration: song.duration || null,
    previewUrl: song.previewUrl || song.preview_url || null,
    genre: song.genre || '',
    platform: 'spotify',
    bg: song.bg || '#050506',
    ac: song.ac || '#7fff00',
    status: song.status || 'ready',
  }
}

export function getPendingSubmission() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const v = raw ? JSON.parse(raw) : null
    if (!v) return null
    const at = v.updatedAt ? Date.parse(v.updatedAt) : null
    if (at && (Date.now() - at > TTL_MS)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return v
  } catch {
    return null
  }
}

export function setPendingSubmission(payload) {
  if (typeof window === 'undefined') return null
  const normalized = {
    ...payload,
    song: payload?.song ? normalizePendingSong(payload.song) : null,
    invite: payload?.invite ? {
      code: payload.invite.code || null,
      ref: payload.invite.ref || null,
      src: payload.invite.src || null,
    } : (payload?.invite === null ? null : (payload?.invite || null)),
    updatedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function clearPendingSubmission() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function hasPendingSubmission() {
  return !!getPendingSubmission()
}

/** Clears hero draft from localStorage once per browser session so returning visitors don’t see an old track. */
const GUEST_HOME_CLEAR_KEY = 'se_cleared_legacy_guest_pending_v2'

export function clearGuestPendingOncePerBrowserSession() {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(GUEST_HOME_CLEAR_KEY) === '1') return
    clearPendingSubmission()
    sessionStorage.setItem(GUEST_HOME_CLEAR_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

