import { useEffect, useState } from 'react'
import { T } from '../../tokens.js'
import { supabase, isDemo } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'

export default function AnnouncementBar({ setPage }) {
  const { user, role, isLoggedIn } = useAuth()
  const [rows, setRows] = useState([])
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    if (isDemo || !supabase) return
    let cancelled = false
    const run = async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, audience, title, body, cta_label, cta_url, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5)
      if (cancelled) return
      setRows(data || [])
      if (isLoggedIn && user?.id) {
        const { data: dis } = await supabase
          .from('announcement_dismissals')
          .select('announcement_id')
          .eq('user_id', user.id)
        if (!cancelled) setDismissed(new Set((dis || []).map((d) => d.announcement_id)))
      }
    }
    run()
    return () => { cancelled = true }
  }, [isLoggedIn, user?.id])

  const audienceOk = (a) => {
    if (a === 'all') return true
    if (a === 'admins') return role === 'admin'
    if (a === 'curators') return role === 'curator'
    if (a === 'artists') return role === 'artist'
    return true
  }

  const active = rows.find((r) => audienceOk(r.audience) && !dismissed.has(r.id))
  if (!active) return null

  const dismiss = async () => {
    setDismissed((p) => new Set([...p, active.id]))
    if (isDemo || !supabase || !user?.id) return
    await supabase.from('announcement_dismissals').insert({ announcement_id: active.id, user_id: user.id }).catch(() => {})
  }

  const go = () => {
    const url = String(active.cta_url || '').trim()
    if (!url) return
    if (url.startsWith('page:')) {
      setPage?.(url.slice('page:'.length))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ position: 'fixed', top: 58, left: 0, right: 0, zIndex: 199, padding: '10px 12px', background: 'linear-gradient(90deg, rgba(127,255,0,.16), rgba(99,102,241,.16))', borderBottom: `1px solid ${T.b1}`, backdropFilter: 'blur(18px)' }}>
      <div className="se-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 12.5, color: T.w, marginBottom: 2 }}>{active.title}</div>
          {active.body ? <div style={{ fontSize: 12, color: T.g200, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.body}</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {active.cta_label && active.cta_url ? (
            <button type="button" className="bp" onClick={go} style={{ padding: '8px 12px', fontSize: 12, borderRadius: 10 }}>
              {active.cta_label} →
            </button>
          ) : null}
          <button type="button" className="bt" aria-label="Dismiss" onClick={dismiss} style={{ padding: '8px 10px', fontSize: 12, borderRadius: 10 }}>✕</button>
        </div>
      </div>
    </div>
  )
}

