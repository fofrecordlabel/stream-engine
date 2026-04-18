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
  try {
    const res = await apiFetch(`/api/spotify/track?url=${encodeURIComponent(apiUrl)}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(formatTrackMetadataError(res.status, d?.error))
    }
    if (!d?.ok) return null
    return {
      id: d.id || extractSpotifyId(url),
      title: d.title || '',
      artist: d.artist || '',
      artworkUrl: d.artworkUrl || null,
      spotifyUrl: d.spotifyUrl || apiUrl,
      previewUrl: d.previewUrl || null,
      duration: d.durationMs ?? d.duration ?? null,
    }
  } catch (err) {
    console.warn('[Spotify] track metadata failed:', err.message)
    throw err
  }
}

/**
 * Fetch playlist metadata via backend.
 */
export async function fetchSpotifyPlaylist(url) {
  if (!isSpotifyPlaylistUrl(url)) return null
  const apiUrl = canonicalSpotifyPlaylistUrl(url) || String(url).trim()
  try {
    const res = await apiFetch(`/api/spotify/playlist?url=${encodeURIComponent(apiUrl)}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(formatTrackMetadataError(res.status, d?.error))
    }
    if (!d?.ok) return null
    return {
      id: d.id || extractPlaylistId(url),
      name: d.name || '',
      owner: d.owner || null,
      artworkUrl: d.artworkUrl || null,
      spotifyUrl: d.spotifyUrl || apiUrl,
      followers: d.followers != null ? d.followers : null,
      trackCount: d.trackCount != null ? d.trackCount : null,
    }
  } catch (err) {
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
