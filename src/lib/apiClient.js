/**
 * Browser → backend API.
 * - Default: same-origin `/api/...` (Vite dev proxy in development).
 * - Dev fallbacks: direct `http://127.0.0.1:3333` / `localhost:3333` if proxy fails (needs CORS on server).
 * - Optional: `VITE_API_ORIGIN=https://your-api.example.com` (no trailing slash) for production / split hosts.
 */

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const origin = import.meta.env.VITE_API_ORIGIN
  if (origin) return `${String(origin).replace(/\/$/, '')}${p}`
  return p
}

/**
 * @param {string} path - e.g. `/api/spotify/track?...` or `/api/create-checkout`
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, init = {}) {
  const p = path.startsWith('/') ? path : `/${path}`

  const urls = []
  if (import.meta.env.VITE_API_ORIGIN) {
    urls.push(apiUrl(p))
  } else {
    urls.push(p)
    if (import.meta.env.DEV) {
      urls.push(`http://127.0.0.1:3333${p}`)
      urls.push(`http://localhost:3333${p}`)
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h && h !== 'localhost' && h !== '127.0.0.1') {
          urls.push(`http://${h}:3333${p}`)
        }
      }
    }
  }

  let lastErr
  for (const url of urls) {
    try {
      const res = await fetch(url, init)
      return res
    } catch (e) {
      lastErr = e
    }
  }
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
