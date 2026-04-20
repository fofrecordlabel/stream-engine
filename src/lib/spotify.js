/**
 * Spotify — link parsing in the browser; metadata only via backend `/api/spotify/*`
 * (no Spotify client secret in frontend). PKCE OAuth uses VITE_SPOTIFY_CLIENT_ID in spotifyAuth.js.
 */

import { apiFetch } from './apiClient.js'
import { formatTrackMetadataError } from './apiErrors.js'

const TRACK_RE    = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]+)/i
const TRACK_URI_RE = /^spotify:track:([A-Za-z0-9]+)$/i
const PLAYLIST_RE = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]+)/i
const PLAYLIST_URI_RE = /^spotify:playlist:([A-Za-z0-9]+)$/i

const SPOTIFY_OEMBED = 'https://open.spotify.com/oembed'

/** Browser-only fallback: Spotify oEmbed allows `Access-Control-Allow-Origin: *` (works when your API is down). */
async function fetchTrackOEmbedInBrowser(trackPageUrl) {
  if (typeof window === 'undefined') return null
  const clean = canonicalSpotifyTrackUrl(trackPageUrl) || String(trackPageUrl).trim()
  try {
    const r = await fetch(`${SPOTIFY_OEMBED}?url=${encodeURIComponent(clean)}&format=json`)
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    if (!d) return null
    const id = extractSpotifyId(trackPageUrl)
    return {
      id: id || null,
      title: d.title || '',
      artist: d.author_name || '',
      artworkUrl: d.thumbnail_url || null,
      spotifyUrl: clean,
      previewUrl: null,
      duration: null,
    }
  } catch {
    return null
  }
}

async function fetchPlaylistOEmbedInBrowser(playlistPageUrl) {
  if (typeof window === 'undefined') return null
  const clean = canonicalSpotifyPlaylistUrl(playlistPageUrl) || String(playlistPageUrl).trim()
  try {
    const r = await fetch(`${SPOTIFY_OEMBED}?url=${encodeURIComponent(clean)}&format=json`)
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    if (!d) return null
    const id = extractPlaylistId(playlistPageUrl)
    return {
      id: id || null,
      name: d.title || '',
      owner: d.author_name || null,
      artworkUrl: d.thumbnail_url || null,
      spotifyUrl: clean,
      followers: null,
      trackCount: null,
    }
  } catch {
    return null
  }
}

export function extractSpotifyId(url) {
  const s = String(url || '').trim()
  const uri = s.match(TRACK_URI_RE)
  if (uri) return uri[1]
  const m = s.match(TRACK_RE)
  return m ? m[1] : null
}

/** Canonical https URL for API + oEmbed (intl paths and spotify: URIs). */
export function canonicalSpotifyTrackUrl(input) {
  const id = extractSpotifyId(input)
  return id ? `https://open.spotify.com/track/${id}` : null
}

export function isSpotifyTrackUrl(url) {
  return !!extractSpotifyId(url)
}

export function extractPlaylistId(url) {
  const s = String(url || '').trim()
  const uri = s.match(PLAYLIST_URI_RE)
  if (uri) return uri[1]
  const m = s.match(PLAYLIST_RE)
  return m ? m[1] : null
}

export function canonicalSpotifyPlaylistUrl(input) {
  const id = extractPlaylistId(input)
  return id ? `https://open.spotify.com/playlist/${id}` : null
}

export function isSpotifyPlaylistUrl(url) {
  return !!extractPlaylistId(url)
}

/** Build a spotify:track:ID URI from a URL */
export function trackUri(url) {
  const id = extractSpotifyId(url)
  return id ? `spotify:track:${id}` : null
}

/**
 * Fetch track metadata via backend (Spotify Web API or oEmbed on server).
 * Returns: { id, title, artist, artworkUrl, spotifyUrl } | null
 */
export async function fetchSpotifyTrack(url) {
  if (!isSpotifyTrackUrl(url)) return null
  const apiUrl = canonicalSpotifyTrackUrl(url) || String(url).trim()

  /** Spotify oEmbed is CORS-open — load first so pasted links work even when your API is unreachable. */
  let oEmbedTrack = null
  try {
    const o = await fetchTrackOEmbedInBrowser(url)
    if (o && (o.title || o.artworkUrl)) oEmbedTrack = o
  } catch {
    /* ignore */
  }

  try {
    const res = await apiFetch(`/api/spotify/track?url=${encodeURIComponent(apiUrl)}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok && d?.ok) {
      return {
        id: d.id || extractSpotifyId(url),
        title: d.title || oEmbedTrack?.title || '',
        artist: d.artist || oEmbedTrack?.artist || '',
        artworkUrl: d.artworkUrl || oEmbedTrack?.artworkUrl || null,
        spotifyUrl: d.spotifyUrl || apiUrl,
        previewUrl: d.previewUrl || null,
        duration: d.durationMs ?? d.duration ?? null,
      }
    }
  } catch {
    /* network — fall through to oEmbed */
  }

  if (oEmbedTrack) return oEmbedTrack
  throw new Error(
    'Could not load this Spotify track. Check the link, try again, or use search above and pick a result.',
  )
}

/**
 * Live track search (artist / song name). Requires API server with Spotify client credentials.
 * @returns {Promise<{ tracks: Array<{id,title,artist,artworkUrl,spotifyUrl,previewUrl,durationMs}>, searchConfigured: boolean, hint?: string }>}
 */
export async function searchSpotifyTracks(query, limit = 10) {
  const q = String(query || '').trim()
  if (q.length < 2) return { tracks: [], searchConfigured: true }
  if (isSpotifyTrackUrl(q)) return { tracks: [], searchConfigured: true }
  try {
    const res = await apiFetch(`/api/spotify/search?q=${encodeURIComponent(q)}&limit=${limit}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      const expressNoRoute =
        res.status === 404 &&
        d &&
        typeof d === 'object' &&
        d.error === 'Not found' &&
        typeof d.path === 'string'
      return {
        tracks: [],
        searchConfigured: true,
        hint:
          res.status === 404
            ? expressNoRoute
              ? import.meta.env.DEV
                ? `API is up but no route for ${d.path}. From the repo root run \`npm run dev\` (starts API + Vite), or redeploy Render with the latest \`server/index.js\`.`
                : `API is up but no route for ${d.path}. Deploy the latest Render service from this repo.`
              : 'Search returned 404. Confirm VITE_API_ORIGIN on Netlify matches your Render API URL, redeploy, and check Render has SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.'
            : `Search could not complete (${res.status}). Paste a Spotify track link below, or try again.`,
      }
    }
    if (!d?.ok) {
      return {
        tracks: [],
        searchConfigured: false,
        hint: typeof d?.error === 'string' ? d.error : undefined,
      }
    }
    return {
      tracks: Array.isArray(d.tracks) ? d.tracks : [],
      searchConfigured: d.searchConfigured !== false,
      hint: d.hint,
    }
  } catch {
    return {
      tracks: [],
      searchConfigured: true,
      hint: 'Could not reach the API. Check your connection, or paste a Spotify track link.',
    }
  }
}

/**
 * Fetch playlist metadata via backend.
 */
export async function fetchSpotifyPlaylist(url) {
  if (!isSpotifyPlaylistUrl(url)) return null
  const apiUrl = canonicalSpotifyPlaylistUrl(url) || String(url).trim()
  const fromOEmbed = async () => {
    const o = await fetchPlaylistOEmbedInBrowser(apiUrl)
    return o && (o.name || o.artworkUrl) ? o : null
  }
  /** oEmbed works from the browser without API credentials — try first so paste/import works when Render has no client secret. */
  const oEmbedFirst = await fromOEmbed()
  try {
    const res = await apiFetch(`/api/spotify/playlist?url=${encodeURIComponent(apiUrl)}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (oEmbedFirst) return oEmbedFirst
      throw new Error(formatTrackMetadataError(res.status, d?.error))
    }
    if (!d?.ok) {
      if (oEmbedFirst) return oEmbedFirst
      return null
    }
    return {
      id: d.id || extractPlaylistId(apiUrl),
      name: d.name || oEmbedFirst?.name || '',
      owner: d.owner ?? oEmbedFirst?.owner ?? null,
      artworkUrl: d.artworkUrl || oEmbedFirst?.artworkUrl || null,
      spotifyUrl: d.spotifyUrl || apiUrl,
      followers: d.followers != null ? d.followers : null,
      trackCount: d.trackCount != null ? d.trackCount : null,
    }
  } catch (err) {
    if (oEmbedFirst) return oEmbedFirst
    console.warn('[Spotify] playlist metadata failed:', err.message)
    throw err
  }
}

/**
 * Fetch playlist details via Spotify Web API (requires user access token).
 */
export async function fetchPlaylistAPI(playlistId, accessToken) {
  if (!playlistId || !accessToken) return null
  try {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,followers,external_urls,tracks.total,owner`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const d = await res.json()
    return {
      id:          d.id,
      name:        d.name,
      description: d.description,
      artworkUrl:  d.images?.[0]?.url || null,
      spotifyUrl:  d.external_urls?.spotify || '',
      followers:   d.followers?.total ?? null,
      trackCount:  d.tracks?.total ?? null,
      owner:       d.owner?.display_name || null,
    }
  } catch {
    return null
  }
}

/**
 * Fetch the connected user's playlists via Spotify Web API.
 */
export async function fetchUserPlaylists(accessToken, limit = 50) {
  if (!accessToken) return []
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return []
    const d = await res.json()
    return (d.items || []).map(pl => ({
      id:         pl.id,
      name:       pl.name,
      artworkUrl: pl.images?.[0]?.url || null,
      spotifyUrl: pl.external_urls?.spotify || '',
      trackCount: pl.tracks?.total || 0,
      isPublic:   pl.public,
    }))
  } catch {
    return []
  }
}

/**
 * Add a track to a Spotify playlist via Web API.
 */
export async function insertTrackToPlaylist(playlistId, trackSpotifyUri, accessToken, position = 0) {
  if (!playlistId || !trackSpotifyUri || !accessToken) {
    return { error: 'Missing playlistId, trackUri, or accessToken' }
  }
  try {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [trackSpotifyUri], position }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { error: err.error?.message || `Spotify API ${res.status}` }
    }
    const d = await res.json()
    return { snapshotId: d.snapshot_id, error: null }
  } catch (err) {
    return { error: err.message }
  }
}

/** Format ms duration to m:ss */
export function formatDuration(ms) {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Map Spotify genre/energy to an accent color */
export function accentFromGenre(genre = '') {
  const g = genre.toLowerCase()
  if (g.includes('hip') || g.includes('rap') || g.includes('trap')) return '#7fff00'
  if (g.includes('r&b') || g.includes('soul'))                        return '#ec4899'
  if (g.includes('electronic') || g.includes('edm'))                  return '#a78bfa'
  if (g.includes('indie') || g.includes('alt'))                       return '#38bdf8'
  if (g.includes('pop'))                                               return '#f59e0b'
  if (g.includes('lo-fi') || g.includes('chill'))                     return '#f59e0b'
  if (g.includes('latin') || g.includes('reggaeton'))                 return '#ff6b35'
  return '#7fff00'
}
