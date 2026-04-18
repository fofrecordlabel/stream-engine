/** Normalize Spotify track/playlist URLs for oEmbed + Web API (intl paths, spotify: URIs). */

export function normalizeSpotifyTrackUrl(raw) {
  const u = String(raw || '').trim()
  const m = u.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]+)/i)
  if (m) return `https://open.spotify.com/track/${m[1]}`
  const uri = u.match(/^spotify:track:([A-Za-z0-9]+)$/i)
  if (uri) return `https://open.spotify.com/track/${uri[1]}`
  return u
}

export function normalizeSpotifyPlaylistUrl(raw) {
  const u = String(raw || '').trim()
  const m = u.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]+)/i)
  if (m) return `https://open.spotify.com/playlist/${m[1]}`
  const uri = u.match(/^spotify:playlist:([A-Za-z0-9]+)$/i)
  if (uri) return `https://open.spotify.com/playlist/${uri[1]}`
  return u
}
