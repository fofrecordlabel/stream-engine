import { useEffect, useState } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { apiFetch } from '../lib/apiClient.js'
import { useAuth } from '../context/AuthContext.jsx'

const PENDING_BILLING = 'se_artist_section'

function Layout({ setPage, title, subtitle, tone = 'success', children }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const c = tone === 'success' ? T.gn : tone === 'warn' ? T.gold : T.red
  const bg = tone === 'success' ? 'rgba(127,255,0,.08)' : tone === 'warn' ? 'rgba(255,199,64,.08)' : 'rgba(255,64,96,.08)'
  const bc = tone === 'success' ? T.gnB : tone === 'warn' ? 'rgba(255,199,64,.22)' : 'rgba(255,64,96,.22)'

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />
      <div style={{ maxWidth:900, margin:'0 auto', padding:'110px 24px 72px' }}>
        <div style={{ display:'inline-block', padding:'5px 14px', borderRadius:999, background:bg, border:`1px solid ${bc}`, color:c, fontWeight:900, fontSize:11.5, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:18 }}>
          Billing
        </div>
        <h1 style={{ fontSize:'clamp(28px,4.5vw,44px)', fontWeight:900, letterSpacing:'-.03em', marginBottom:10 }}>{title}</h1>
        <p style={{ color:T.g200, fontSize:16, lineHeight:1.7, maxWidth:740, marginBottom:28 }}>{subtitle}</p>

        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:18, padding:'20px 20px' }}>
          {children}
        </div>

        <div style={{ marginTop:18, display:'flex', gap:10, flexWrap:'wrap' }}>
          <button type="button" className="bp" onClick={() => { try { sessionStorage.setItem(PENDING_BILLING, 'billing') } catch {} ; setPage('artist') }} style={{ padding:'10px 16px' }}>Go to Billing →</button>
          <button type="button" className="bt" onClick={() => setPage('artist')} style={{ padding:'10px 16px' }}>Back to Dashboard</button>
        </div>
      </div>
    </div>
  )
}

export function CheckoutSuccessPage({ setPage }) {
  const { refreshProfile } = useAuth()
  const qs = new URLSearchParams(window.location.search)
  const sessionId = qs.get('session_id') || null
  const [syncing, setSyncing] = useState(!!sessionId)
  const [syncResult, setSyncResult] = useState(null)
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const run = async () => {
      setSyncing(true)
      setSyncError('')
      try {
        const res = await apiFetch('/api/sync-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.ok) throw new Error(data?.error || `Sync failed (${res.status})`)
        if (!cancelled) setSyncResult(data)
        if (!cancelled) await refreshProfile?.()
      } catch (e) {
        if (!cancelled) setSyncError(e?.message || 'Sync failed')
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sessionId, refreshProfile])

  return (
    <Layout
      setPage={setPage}
      title="Payment successful"
      subtitle="Your checkout completed successfully. If credits don’t appear immediately, refresh in a moment."
      tone="success"
    >
      <div style={{ color:T.g100, fontSize:14.5, lineHeight:1.7 }}>
        <div style={{ fontWeight:900, marginBottom:8 }}>Receipt</div>
        <div style={{ color:T.g300 }}>Session: <span className="mono" style={{ color:T.w }}>{sessionId || '—'}</span></div>
        <div style={{ marginTop: 12, color:T.g300, fontSize:13.5 }}>
          {syncing ? 'Finalizing your order…' : syncResult ? `Order stored (${syncResult.status}). Credits should update shortly.` : 'Order finalization pending.'}
        </div>
        {syncError && (
          <div style={{ marginTop: 10, padding:'10px 12px', borderRadius:12, background:'rgba(255,64,96,.08)', border:'1px solid rgba(255,64,96,.22)', color:T.red, fontSize:13, fontWeight:900 }}>
            ⚠ {syncError}
          </div>
        )}
      </div>
    </Layout>
  )
}

export function CheckoutCancelPage({ setPage }) {
  return (
    <Layout
      setPage={setPage}
      title="Checkout cancelled"
      subtitle="No worries — your payment was not completed. You can try again at any time."
      tone="warn"
    >
      <div style={{ color:T.g100, fontSize:14.5, lineHeight:1.7 }}>
        <div style={{ fontWeight:900, marginBottom:8 }}>What happened?</div>
        <div style={{ color:T.g300 }}>You closed Stripe checkout or navigated back before payment completed.</div>
      </div>
    </Layout>
  )
}

