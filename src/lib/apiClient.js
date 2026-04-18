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
function collectApiUrls(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const urls = []
  const add = (u) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  /* Same-origin first: Vite dev proxy + Netlify → API rewrite in netlify.toml */
  add(p)
  if (import.meta.env.VITE_API_ORIGIN) add(apiUrl(p))
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

export async function apiFetch(path, init = {}) {
  const p = path.startsWith('/') ? path : `/${path}`
  const urls = collectApiUrls(p)
  const method = String(init.method || 'GET').toUpperCase()
  let lastErr
  let lastRes
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const res = await fetch(url, init)
      lastRes = res
      if (res.ok) return res
      /* GET: try next origin (e.g. Netlify /api proxy down → direct Render URL) */
      if (method === 'GET' && i < urls.length - 1) continue
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
