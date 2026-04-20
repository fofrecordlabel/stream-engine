import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'
import { STREAMENGINE_SUPABASE_URL } from './lib/supabase.js'
import { assertProdPublicEnv, env, isProd, isLikelyValidApiOriginUrl } from './lib/env.js'

/** Warm connections for first paint (URLs are public). */
function addLinkRel(rel, href, crossOrigin) {
  if (typeof document === 'undefined' || !href) return
  const el = document.createElement('link')
  el.rel = rel
  el.href = href
  if (crossOrigin) el.crossOrigin = crossOrigin
  document.head.appendChild(el)
}

const supabaseOrigin = env.supabaseUrl || STREAMENGINE_SUPABASE_URL
try {
  const u = new URL(supabaseOrigin)
  addLinkRel('preconnect', u.origin, 'anonymous')
} catch { /* ignore */ }

const apiOrigin = env.apiOrigin
if (apiOrigin) {
  try {
    addLinkRel('dns-prefetch', new URL(apiOrigin).origin)
  } catch { /* ignore */ }
}

const need = assertProdPublicEnv()
if (need.length) {
  console.warn(
    `[StreamEngine] Production build missing: ${need.join(', ')} — set in Netlify → Environment variables and redeploy.`,
  )
}
if (isProd && env.apiOrigin && !isLikelyValidApiOriginUrl(env.apiOrigin)) {
  console.error(
    '[StreamEngine] VITE_API_ORIGIN must be your API base URL (e.g. https://your-api.onrender.com), not a Spotify secret or other key. Fix in Netlify → Environment variables → redeploy.',
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
