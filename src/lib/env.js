/**
 * Central browser env access (Vite). No secrets — only public VITE_* keys.
 */

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

export const env = {
  spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
  /** API origin, no trailing slash (e.g. https://streamengine-api.onrender.com) */
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
