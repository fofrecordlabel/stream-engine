/**
 * Spotify PKCE OAuth 2.0 — curator account connection
 *
 * Required env var:
 *   VITE_SPOTIFY_CLIENT_ID — your Spotify app's client ID (safe to expose in browser)
 *
 * Required Redirect URIs (add in Spotify Developer Dashboard → your app → Settings):
 *   http://localhost:5173  (dev)
 *   https://your-domain.com  (prod)
 *
 * Scopes requested:
 *   playlist-modify-public     — add tracks to public playlists
 *   playlist-modify-private    — add tracks to private playlists
 *   playlist-read-private      — read private playlists
 *   playlist-read-collaborative
 *   user-read-email
 *   user-read-private
 */

const CLIENT_ID   = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
const REDIRECT_URI = window.location.origin   // SPA — Spotify redirects back to root with ?code=
const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  'user-read-private',
].join(' ')

const TOKEN_KEY    = 'se_spotify_token'
const VERIFIER_KEY = 'se_spotify_pkce_verifier'
const STATE_KEY    = 'se_spotify_state'
/** Set before redirect so App can tell Spotify OAuth apart from Supabase `?code=` redirects. */
const OAUTH_PENDING_KEY = 'se_spotify_oauth_pending'
const OAUTH_STARTED_AT_KEY = 'se_spotify_oauth_started_at'
const OAUTH_TTL_MS = 15 * 60 * 1000

export function hasSpotifyClientId() {
  return !!import.meta.env.VITE_SPOTIFY_CLIENT_ID
}

/** True when URL looks like a Spotify OAuth return (not Supabase). */
export function isSpotifyOAuthReturn() {
  try {
    const qs = new URLSearchParams(window.location.search)
    if (!qs.has('code') || sessionStorage.getItem(OAUTH_PENDING_KEY) !== '1') return false
    const at = Number(sessionStorage.getItem(OAUTH_STARTED_AT_KEY) || 0)
    if (at && Date.now() - at > OAUTH_TTL_MS) {
      sessionStorage.removeItem(OAUTH_PENDING_KEY)
      sessionStorage.removeItem(OAUTH_STARTED_AT_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

/* ── PKCE helpers ── */

function randomString(length = 96) {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, length)
}

async function sha256(plain) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain))
}

function base64url(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/* ── Token storage ── */

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token:  token.access_token,
    refresh_token: token.refresh_token || null,
    expires_at:    Date.now() + (token.expires_in ?? 3600) * 1000,
  }))
}

function loadToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') }
  catch { return null }
}

export function clearSpotifyToken() {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(OAUTH_PENDING_KEY)
  sessionStorage.removeItem(OAUTH_STARTED_AT_KEY)
}

export function isSpotifyConnected() {
  const t = loadToken()
  return !!(t?.access_token)
}

/* ── Auth flow ── */

/**
 * Redirect to Spotify authorization page.
 * Call when the curator clicks "Connect Spotify".
 */
export async function startSpotifyAuth() {
  if (!CLIENT_ID) {
    console.warn('[SpotifyAuth] VITE_SPOTIFY_CLIENT_ID is not set')
    return { error: 'Spotify client ID not configured. Set VITE_SPOTIFY_CLIENT_ID in .env.' }
  }
  const verifier  = randomString()
  const challenge = base64url(await sha256(verifier))
  const state     = randomString(16)

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(OAUTH_PENDING_KEY, '1')
  sessionStorage.setItem(OAUTH_STARTED_AT_KEY, String(Date.now()))

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    state,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

/**
 * Call on app load if `?code=` is in the URL.
 * Exchanges the code for tokens, saves them, cleans the URL.
 * Returns the stored token or throws.
 */
export async function handleSpotifyCallback() {
  const params   = new URLSearchParams(window.location.search)
  const code     = params.get('code')
  const state    = params.get('state')
  const error    = params.get('error')

  if (!code) return null   // not a callback

  // Avoid treating Supabase OAuth `code` as Spotify unless user started Spotify login.
  if (sessionStorage.getItem(OAUTH_PENDING_KEY) !== '1') return null

  if (error) {
    sessionStorage.removeItem(OAUTH_PENDING_KEY)
    sessionStorage.removeItem(OAUTH_STARTED_AT_KEY)
    window.history.replaceState({}, '', window.location.pathname)
    return { error }
  }

  const savedState   = sessionStorage.getItem(STATE_KEY)
  const verifier     = sessionStorage.getItem(VERIFIER_KEY)

  if (savedState && state !== savedState) {
    sessionStorage.removeItem(OAUTH_PENDING_KEY)
    sessionStorage.removeItem(OAUTH_STARTED_AT_KEY)
    window.history.replaceState({}, '', window.location.pathname)
    return { error: 'State mismatch — possible CSRF' }
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier || '',
    }),
  })

  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  window.history.replaceState({}, '', window.location.pathname)
  sessionStorage.removeItem(OAUTH_PENDING_KEY)
  sessionStorage.removeItem(OAUTH_STARTED_AT_KEY)

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { error: err.error_description || `Token exchange failed (${res.status})` }
  }

  const token = await res.json()
  saveToken(token)
  return { token, error: null }
}

/**
 * Get a valid access token, auto-refreshing if needed.
 * Returns null if not connected or refresh fails.
 */
export async function getSpotifyAccessToken() {
  const stored = loadToken()
  if (!stored?.access_token) return null

  // Still valid (with 5-min buffer)
  if (stored.expires_at && Date.now() < stored.expires_at - 5 * 60 * 1000) {
    return stored.access_token
  }

  // Try refresh
  if (stored.refresh_token) {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     CLIENT_ID,
          grant_type:    'refresh_token',
          refresh_token: stored.refresh_token,
        }),
      })
      if (res.ok) {
        const t = await res.json()
        saveToken({ ...t, refresh_token: t.refresh_token || stored.refresh_token })
        return t.access_token
      }
    } catch { /* fall through */ }
    clearSpotifyToken()
  }

  return null
}

/** Fetch the connected user's Spotify profile. */
export async function fetchSpotifyProfile(accessToken) {
  if (!accessToken) return null
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const d = await res.json()
    return {
      id:          d.id,
      displayName: d.display_name || d.id,
      email:       d.email || null,
      avatarUrl:   d.images?.[0]?.url || null,
      spotifyUrl:  d.external_urls?.spotify || null,
      country:     d.country || null,
    }
  } catch { return null }
}
