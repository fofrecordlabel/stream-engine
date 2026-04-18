import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'
import { STREAMENGINE_SUPABASE_URL } from './lib/supabase.js'

/** Warm connections for first paint (URLs are public). */
function addLinkRel(rel, href, crossOrigin) {
  if (typeof document === 'undefined' || !href) return
  const el = document.createElement('link')
  el.rel = rel
  el.href = href
  if (crossOrigin) el.crossOrigin = crossOrigin
  document.head.appendChild(el)
}

const supabaseOrigin = import.meta.env.VITE_SUPABASE_URL || STREAMENGINE_SUPABASE_URL
try {
  const u = new URL(supabaseOrigin)
  addLinkRel('preconnect', u.origin, 'anonymous')
} catch { /* ignore */ }

const apiOrigin = import.meta.env.VITE_API_ORIGIN
if (apiOrigin) {
  try {
    addLinkRel('dns-prefetch', new URL(apiOrigin).origin)
  } catch { /* ignore */ }
}

if (import.meta.env.PROD) {
  const need = []
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) need.push('VITE_SUPABASE_ANON_KEY')
  if (!import.meta.env.VITE_API_ORIGIN) need.push('VITE_API_ORIGIN')
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) need.push('VITE_STRIPE_PUBLISHABLE_KEY')
  if (need.length) {
    console.warn(
      `[StreamEngine] Production build missing: ${need.join(', ')} — set in Netlify → Environment variables and redeploy.`,
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
