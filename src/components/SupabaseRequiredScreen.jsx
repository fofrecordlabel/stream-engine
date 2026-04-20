import { T } from '../tokens.js'
import { env } from '../lib/env.js'

/**
 * Shown in production when the app is built without VITE_SUPABASE_ANON_KEY.
 * Prevents fake demo sign-in and mock DB writes; every real user must hit Supabase.
 */
export default function SupabaseRequiredScreen() {
  const url = env.supabaseUrl || 'your Supabase project URL'
  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.w,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.gn, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          Configuration required
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 12, lineHeight: 1.15 }}>
          Connect Supabase for real accounts and data
        </h1>
        <p style={{ fontSize: 15, color: T.g200, lineHeight: 1.65, marginBottom: 22 }}>
          This deployment is missing <span className="mono">VITE_SUPABASE_ANON_KEY</span>. Without it, the app cannot store per-user songs, campaigns, or billing — and demo mode is disabled in production.
        </p>
        <ol style={{ textAlign: 'left', fontSize: 14, color: T.g300, lineHeight: 1.75, margin: '0 0 28px 18px', padding: 0 }}>
          <li>Open Supabase → Project Settings → API.</li>
          <li>Copy the <strong>anon public</strong> key (not the service role key).</li>
          <li>In Netlify: Site → Environment variables → add <span className="mono">VITE_SUPABASE_ANON_KEY</span> (and <span className="mono">VITE_SUPABASE_URL</span> if not already set).</li>
          <li>Trigger a new deploy.</li>
        </ol>
        <p style={{ fontSize: 12, color: T.g400, wordBreak: 'break-all' }}>
          Project URL in this build: <span style={{ color: T.g200 }}>{url}</span>
        </p>
        <button
          type="button"
          className="bp"
          onClick={() => window.location.reload()}
          style={{ marginTop: 28, padding: '14px 28px', fontSize: 15, borderRadius: 12 }}
        >
          Reload after deploy
        </button>
      </div>
    </div>
  )
}
