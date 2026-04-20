/**
 * Browser → backend API.
 * - Default: same-origin `/api/...` (Vite dev proxy in development).
 * - Dev fallbacks: direct `http://127.0.0.1:3333` / `localhost:3333` if proxy fails (needs CORS on server).
 * - Optional: `VITE_API_ORIGIN=https://your-api.example.com` (no trailing slash) for production / split hosts.
 */

import { isLikelyValidApiOriginUrl } from './env.js'

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const raw = String(import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/$/, '')
  if (!raw || !isLikelyValidApiOriginUrl(raw)) return p
  const base = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return `${base.replace(/\/$/, '')}${p}`
}

/**
 * @param {string} path - e.g. `/api/spotify/track?...` or `/api/create-checkout`
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
function isBrowserLocalhost() {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

function collectApiUrls(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const urls = []
  const add = (u) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  const remote = import.meta.env.VITE_API_ORIGIN
  /*
   * Production (Netlify + Render): call `VITE_API_ORIGIN` first.
   * Netlify’s `/api/*` proxy is optional; if it is missing or returns 404, same-origin would fail
   * even though Render is up. Render must allow this site in CORS (APP_URL / CORS_ALLOW_ORIGINS).
   * Localhost / preview: same-origin or Vite proxy first, then absolute origin if set.
   */
  const prodSplitHost = import.meta.env.PROD && !!remote && !isBrowserLocalhost()
  if (prodSplitHost) {
    add(apiUrl(p))
    add(p)
  } else {
    add(p)
    if (remote) add(apiUrl(p))
  }
  if (import.meta.env.DEV) {
    add(`http://127.0.0.1:3333${p}`)
    add(`http://localhost:3333${p}`)
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h && h !== 'localhost' && h !== '127.0.0.1') {
        add(`http://${h}:3333${p}`)
      }
    }
  }
  return urls
}

/** Safe to retry on alternate API origin (same body → same Stripe session if first attempt never reached server). */
function isBillingPostRetryPath(path) {
  return (
    path.startsWith('/api/create-checkout') ||
    path.startsWith('/api/create-subscription-checkout') ||
    path.startsWith('/api/create-exclusive-guest-checkout') ||
    path.startsWith('/api/sync-checkout') ||
    path.startsWith('/api/validate-discount') ||
    path.startsWith('/api/billing/create-payment-intent')
  )
}

export async function apiFetch(path, init = {}) {
  const p = path.startsWith('/') ? path : `/${path}`
  const urls = collectApiUrls(p)
  const method = String(init.method || 'GET').toUpperCase()
  const allowAlternateOriginRetry =
    method === 'GET' || (method === 'POST' && isBillingPostRetryPath(p) && urls.length > 1)
  let lastErr
  let lastRes
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const res = await fetch(url, init)
      lastRes = res
      if (res.ok) return res
      /* GET (and idempotent billing POST): try next origin if configured */
      if (allowAlternateOriginRetry && i < urls.length - 1) continue
      return res
    } catch (e) {
      lastErr = e
      if (i < urls.length - 1) continue
    }
  }
  if (lastRes) return lastRes
  throw lastErr || new Error('API unreachable')
}

/** Shown when track metadata fails (null response) — dev vs production hosting */
export function spotifyMetadataUnavailableMessage() {
  if (import.meta.env.DEV) {
    return 'Could not reach the API. Start the backend (for example `npm run dev` in `server/`) so `/api` is available.'
  }
  if (!import.meta.env.VITE_API_ORIGIN) {
    return 'Could not reach the API. On Netlify, set `VITE_API_ORIGIN` to your API base URL (no trailing slash) and redeploy, or proxy `/api` to your server.'
  }
  return 'Could not load track metadata. The API may be busy—try again in a moment.'
}
