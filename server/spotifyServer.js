/**
 * Spotify Web API (server-only): Client Credentials flow.
 * Uses SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET from process.env (server/.env).
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

let cached = { token: null, expiresAt: 0 }

export async function getSpotifyAccessToken() {
  const id = String(process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID || '').trim()
  const secret = String(process.env.SPOTIFY_CLIENT_SECRET || '').trim()
  if (!id || !secret) return null
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const auth = Buffer.from(`${id}:${secret}`).toString('base64')
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body,
  })
  if (!r.ok) {
    const errBody = await r.text().catch(() => '')
    console.warn('[Spotify] Client credentials failed:', r.status, errBody.slice(0, 200))
    return null
  }
  const d = await r.json()
  cached.token = d.access_token
  cached.expiresAt = Date.now() + (d.expires_in || 3600) * 1000
  return cached.token
}

/** @returns {Promise<null | { id: string, title: string, artist: string, artworkUrl: string|null, spotifyUrl: string|null }>} */
export async function fetchTrackFromWebApi(trackId) {
  if (!trackId) return null
  const token = await getSpotifyAccessToken()
  if (!token) return null
  const r = await fetch(`${API_BASE}/tracks/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const t = await r.json()
  const images = t.album?.images || []
  const artworkUrl = images.length ? images[0].url : null
  const artist = (t.artists || []).map((a) => a.name).join(', ')
  return {
    id: t.id,
    title: t.name || '',
    artist,
    artworkUrl,
    spotifyUrl: t.external_urls?.spotify || null,
    previewUrl: t.preview_url || null,
    durationMs: t.duration_ms ?? null,
  }
}

/** @returns {Promise<null | { id: string, name: string, owner: string|null, artworkUrl: string|null, spotifyUrl: string|null, followers: number|null, trackCount: number|null }>} */
export async function fetchPlaylistFromWebApi(playlistId) {
  if (!playlistId) return null
  const token = await getSpotifyAccessToken()
  if (!token) return null
  const fields = 'id,name,images,owner,external_urls,followers,tracks'
  const r = await fetch(
    `${API_BASE}/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!r.ok) return null
  const pl = await r.json()
  const images = pl.images || []
  return {
    id: pl.id,
    name: pl.name || '',
    owner: pl.owner?.display_name || pl.owner?.id || null,
    artworkUrl: images[0]?.url || null,
    spotifyUrl: pl.external_urls?.spotify || null,
    followers: pl.followers?.total ?? null,
    trackCount: pl.tracks?.total ?? null,
  }
}

/**
 * Search tracks (client credentials). Returns null if Spotify is not configured on the server.
 * @returns {Promise<null | Array<{ id: string, title: string, artist: string, artworkUrl: string|null, spotifyUrl: string, previewUrl: string|null, durationMs: number|null }>>}
 */
export async function searchTracksFromWebApi(q, limit = 10) {
  const token = await getSpotifyAccessToken()
  if (!token) return null
  const lim = Math.min(Math.max(1, Number(limit) || 10), 50)
  const r = await fetch(
    `${API_BASE}/search?type=track&q=${encodeURIComponent(String(q).trim())}&limit=${lim}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!r.ok) {
    const errBody = await r.text().catch(() => '')
    console.warn('[Spotify] Search request failed:', r.status, errBody.slice(0, 200))
    return []
  }
  const data = await r.json()
  const items = data?.tracks?.items || []
  return items.map((t) => {
    const images = t.album?.images || []
    return {
      id: t.id,
      title: t.name || '',
      artist: (t.artists || []).map((a) => a.name).join(', '),
      artworkUrl: images.length ? images[0].url : null,
      spotifyUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
      previewUrl: t.preview_url || null,
      durationMs: t.duration_ms ?? null,
    }
  })
}
