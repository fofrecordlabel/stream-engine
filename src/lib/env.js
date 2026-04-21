/**
 * Central browser env access (Vite). No secrets — only public VITE_* keys.
 */

/** Public Spotify Client ID for this app (Dashboard → Basic Information). Override with VITE_SPOTIFY_CLIENT_ID. */
export const DEFAULT_SPOTIFY_CLIENT_ID = 'a689918def2f448e9632819a8ec289cd'

export const isDev = import.meta.env.DEV
export const isProd = import.meta.env.PROD

export function browserHostname() {
  if (typeof window === 'undefined') return ''
  return window.location.hostname || ''
}

export function isLocalDevHost() {
  const h = browserHostname()
  return h === 'localhost' || h === '127.0.0.1'
}

/** True if VITE_API_ORIGIN looks like a full https API base URL (not a secret pasted by mistake). */
export function isLikelyValidApiOriginUrl(raw) {
  const s = String(raw || '').trim().replace(/\/$/, '')
  if (!s) return true
  // Spotify client secrets are 32 hex chars — never use that as the API "origin"
  if (/^[0-9a-f]{32}$/i.test(s) && !s.includes('.')) return false
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    if (u.protocol !== 'https:') return false
    return u.hostname.includes('.')
  } catch {
    return false
  }
}

export const env = {
  /** Browser PKCE + paste flows. Netlify must use VITE_SPOTIFY_CLIENT_ID (plain SPOTIFY_CLIENT_ID is not read by Vite). */
  spotifyClientId: String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || DEFAULT_SPOTIFY_CLIENT_ID).trim(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  stripePublishableKey: String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim(),
  /** API origin, no trailing slash (e.g. https://your-service.onrender.com) */
  apiOrigin: (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, ''),
  /** Public site URL for OAuth / redirects when it matches current origin */
  appUrl: (import.meta.env.VITE_APP_URL || '').trim().replace(/\/$/, ''),
}

export function assertProdPublicEnv() {
  if (!isProd) return []
  const missing = []
  if (!env.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  if (!env.apiOrigin) missing.push('VITE_API_ORIGIN')
  if (!env.stripePublishableKey) missing.push('VITE_STRIPE_PUBLISHABLE_KEY')
  return missing
}
