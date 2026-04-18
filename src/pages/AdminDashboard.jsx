import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { supabase } from '../lib/supabase.js'

const card = (extra = {}) => ({
  background: `linear-gradient(145deg,${T.card},#0d0d10)`,
  border: `1px solid ${T.b0}`,
  borderRadius: 14,
  padding: '18px 20px',
  ...extra,
})
const th = { padding:"10px 14px", fontSize:11, fontWeight:700, color:T.g300, letterSpacing:".06em", textTransform:"uppercase", textAlign:"left", borderBottom:`1px solid ${T.b0}`, whiteSpace:"nowrap" }
const td = { padding:"12px 14px", fontSize:13, color:T.g100, borderBottom:`1px solid ${T.b0}`, verticalAlign:"middle" }

const ADMIN_NAV = [
  { id:"overview",  icon:"📊", label:"Overview" },
  { id:"users",     icon:"👥", label:"Users" },
  { id:"campaigns", icon:"📋", label:"Campaigns" },
  { id:"disputes",  icon:"⚠",  label:"Disputes" },
]

function LiveEmpty({ title, desc, error }) {
  return (
    <div style={{ ...card({ padding: 18 }), textAlign:'center' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🛠</div>
      <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>{title}</div>
      <div style={{ color: T.g300, fontSize: 13, lineHeight: 1.6 }}>{desc}</div>
      {error && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.22)', color: T.red, fontSize: 12.5, fontWeight: 900 }}>
          {error}
        </div>
      )}
    </div>
  )
}

function LiveTable({ title, cols, rows, empty }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{title}</h1>
      <div style={{ ...card({ padding: 0 }), overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{cols.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td style={{ ...td, color:T.g300 }} colSpan={cols.length}>{empty}</td></tr>
            ) : rows.map((r, idx) => (
              <tr key={r.id || idx}>
                {cols.map((h) => <td key={h} style={td}>{r[h]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LiveDisputes({ disputes, onUpdate }) {
  const [selected, setSelected] = useState(null)
  const [internalNote, setInternalNote] = useState('')
  const [adminResponse, setAdminResponse] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!selected) return
    setInternalNote(selected.internal_note || '')
    setAdminResponse(selected.admin_response || '')
    setLocalError('')
  }, [selected?.id])

  if (!disputes?.length) {
    return (
      <div style={card({ textAlign:'center' })}>
        <div style={{ fontSize:32, marginBottom:10 }}>⚠</div>
        <div style={{ fontWeight:900, fontSize:15, marginBottom:6 }}>No disputes</div>
        <div style={{ color:T.g300, fontSize:13, lineHeight:1.6 }}>
          When artists open support issues tied to campaigns, they’ll appear here for handling.
        </div>
      </div>
    )
  }

  const save = async (patch) => {
    try {
      setLocalError('')
      await onUpdate(selected.id, patch)
      setSelected(p => ({ ...p, ...patch }))
    } catch (e) {
      setLocalError(e?.message || 'Update failed')
    }
  }

  const addThread = async ({ kind, message }) => {
    const entry = { at: new Date().toISOString(), by: 'admin', kind, message }
    const nextThread = Array.isArray(selected.thread) ? [...selected.thread, entry] : [entry]
    await save({ thread: nextThread })
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.1fr 1.4fr', gap:12, alignItems:'start' }}>
      <div style={card({ padding: 0, overflow:'hidden' })}>
        <div style={{ padding:'12px 14px', borderBottom:`1px solid ${T.b0}` }}>
          <div style={{ fontSize:11, fontWeight:900, letterSpacing:'.08em', textTransform:'uppercase', color:T.g300 }}>Disputes queue</div>
        </div>
        <div>
          {disputes.map(d => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              style={{
                width:'100%',
                textAlign:'left',
                padding:'12px 14px',
                border:'none',
                borderBottom:`1px solid ${T.b0}`,
                background: selected?.id === d.id ? 'rgba(255,255,255,.04)' : 'transparent',
                cursor:'pointer',
              }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
                <div style={{ fontWeight:900, color:T.w, fontSize:13 }}>
                  {d.issue_summary || 'Support issue'}
                </div>
                <span style={{ fontSize:11, fontWeight:900, color:T.g200 }}>{d.status || 'open'}</span>
              </div>
              <div style={{ marginTop:4, color:T.g400, fontSize:11.5 }}>
                {(d.created_at || '').toString().slice(0, 10)} · artist {String(d.artist_id || '').slice(0, 8)}…
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={card()}>
        {!selected ? (
          <div style={{ textAlign:'center', padding:'28px 10px', color:T.g300 }}>
            <div style={{ fontSize:30, marginBottom:10 }}>🧾</div>
            <div style={{ fontWeight:900, fontSize:14, marginBottom:6 }}>Select a dispute</div>
            <div style={{ fontSize:12.5, color:T.g400 }}>Open an item from the queue to view details and respond.</div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:900, fontSize:16, color:T.w }}>{selected.issue_summary || 'Support issue'}</div>
                <div style={{ fontSize:12.5, color:T.g300 }}>Campaign: {selected.campaign_id ? String(selected.campaign_id).slice(0, 8) + '…' : '—'}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="bt" onClick={() => save({ status: 'handled', handled_at: new Date().toISOString() })}>Handle</button>
                <button className="bp" onClick={() => save({ status: 'resolved', resolved_at: new Date().toISOString() })} style={{ padding:'10px 14px' }}>Resolved</button>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10.5, fontWeight:900, color:T.g400, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:6 }}>User message</div>
                <div style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)', color:T.g100, lineHeight:1.6, fontSize:13 }}>
                  {selected.user_message || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize:10.5, fontWeight:900, color:T.g400, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:6 }}>Admin response</div>
                <textarea value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)} rows={5}
                  style={{ width:'100%', resize:'vertical', padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)', color:T.w, outline:'none', lineHeight:1.6, fontSize:13 }} />
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                  <button className="bt" onClick={() => save({ admin_response: adminResponse })}>Save response</button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10.5, fontWeight:900, color:T.g400, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:6 }}>Internal notes</div>
              <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={3}
                style={{ width:'100%', resize:'vertical', padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)', color:T.w, outline:'none', lineHeight:1.6, fontSize:13 }} />
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginTop:8 }}>
                <button className="bt" onClick={() => save({ internal_note: internalNote })}>Save note</button>
                <button className="bt" onClick={() => addThread({ kind: 'note', message: 'Refund processed externally.' })} style={{ color:T.g200 }}>
                  Add “refund processed externally”
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize:10.5, fontWeight:900, color:T.g400, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:6 }}>Thread</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(Array.isArray(selected.thread) ? selected.thread : []).length === 0 ? (
                  <div style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)', color:T.g300, fontSize:12.5 }}>
                    No messages yet.
                  </div>
                ) : (
                  (selected.thread).map((t, idx) => (
                    <div key={idx} style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:4 }}>
                        <div style={{ fontSize:11.5, fontWeight:900, color:T.g200 }}>{t.by || 'admin'} · {t.kind || 'note'}</div>
                        <div style={{ fontSize:11, color:T.g400 }}>{(t.at || '').toString().slice(0, 16).replace('T',' ')}</div>
                      </div>
                      <div style={{ fontSize:13, color:T.g100, lineHeight:1.6 }}>{t.message || ''}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {localError && (
              <div style={{ marginTop:12, padding:'10px 12px', borderRadius:12, background:'rgba(255,64,96,.08)', border:'1px solid rgba(255,64,96,.22)', color:T.red, fontSize:12.5, fontWeight:900 }}>
                ⚠ {localError}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminDashboard({ setPage }) {
  const [section, setSection] = useState('overview')
  const [live, setLive] = useState({ loading: false, error: '', users: [], songs: [], campaigns: [], submissions: [], disputes: [] })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLive(p => ({ ...p, loading: true, error: '' }))
      try {
        if (!supabase) throw new Error('Supabase not configured')
        const [u, s, c, sub, d] = await Promise.all([
          supabase.from('profiles').select('id,email,role,created_at').order('created_at', { ascending: false }).limit(50),
          supabase.from('songs').select('id,artist_id,title,artist_name,spotify_id,spotify_url,created_at').order('created_at', { ascending: false }).limit(50),
          supabase.from('campaigns').select('id,artist_id,song_id,campaign_type,status,total_credits,created_at').order('created_at', { ascending: false }).limit(50),
          supabase.from('submissions').select('id,campaign_id,curator_id,status,credits,created_at').order('created_at', { ascending: false }).limit(50),
          supabase.from('disputes').select('*').order('created_at', { ascending: false }).limit(50),
        ])
        const err = u.error || s.error || c.error || sub.error || d.error
        if (err) throw err
        if (cancelled) return
        setLive({ loading: false, error: '', users: u.data || [], songs: s.data || [], campaigns: c.data || [], submissions: sub.data || [], disputes: d.data || [] })
      } catch (e) {
        if (cancelled) return
        setLive(p => ({ ...p, loading: false, error: e?.message || 'Failed to load admin data' }))
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const pendingApprovals = useMemo(() => (
    live.campaigns.filter(c => (c.status || '').toLowerCase() === 'pending').length
  ), [live.campaigns])

  const renderSection = () => {
    if (live.loading) return <LiveEmpty title="Loading admin data…" desc="Fetching from Supabase." error={live.error} />
    if (live.error) return <LiveEmpty title="Admin unavailable" desc="Check your Supabase configuration and RLS policies." error={live.error} />

    if (section === 'overview') {
      const counts = [
        { label: 'Users', value: live.users.length, icon: '👥', color: T.w },
        { label: 'Songs', value: live.songs.length, icon: '🎵', color: T.gn },
        { label: 'Campaigns', value: live.campaigns.length, icon: '📣', color: '#38bdf8' },
        { label: 'Submissions', value: live.submissions.length, icon: '📩', color: '#a78bfa' },
      ]
      return (
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Admin Overview</h1>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12, marginBottom:18 }}>
            {counts.map(s => (
              <div key={s.label} style={card()}>
                <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
                <div className="mono" style={{ fontSize:24, fontWeight:800, color:s.color, marginBottom:4 }}>{s.value}</div>
                <div style={{ fontSize:11.5, color:T.g200 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <LiveEmpty title="Live-only admin" desc="This dashboard intentionally shows no seeded data. Add real records via the product to populate." />
        </div>
      )
    }

    if (section === 'users') {
      const rows = live.users.map(u => ({
        id: u.id,
        email: u.email || '',
        role: u.role || '',
        created_at: (u.created_at || '').slice(0, 10),
      }))
      return <LiveTable title="Users" cols={['email','role','created_at']} rows={rows} empty="No users yet." />
    }

    if (section === 'campaigns') {
      const rows = live.campaigns.map(c => ({
        id: c.id,
        campaign_type: c.campaign_type || '',
        status: c.status || '',
        total_credits: String(c.total_credits ?? ''),
        created_at: (c.created_at || '').slice(0, 10),
      }))
      return <LiveTable title="Campaigns" cols={['campaign_type','status','total_credits','created_at']} rows={rows} empty="No campaigns yet." />
    }

    if (section === 'disputes') {
      return (
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, marginBottom:12 }}>Disputes</h1>
          <LiveDisputes
            disputes={live.disputes || []}
            onUpdate={async (id, patch) => {
              const { error } = await supabase.from('disputes').update(patch).eq('id', id)
              if (error) throw error
              setLive(p => ({ ...p, disputes: (p.disputes || []).map(d => d.id === id ? { ...d, ...patch } : d) }))
            }}
          />
        </div>
      )
    }

    return null
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:T.bg, color:T.w, width:"100%", overflowX:"hidden" }}>
      <div style={{ height:58, borderBottom:"1px solid rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:"rgba(5,5,6,.97)", backdropFilter:"blur(20px)", zIndex:50, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <BrandMark onClick={() => setPage("home")} size={26} />
          <div style={{ width:1, height:18, background:T.b1 }} />
          <span style={{ fontSize:11.5, fontWeight:900, color:T.red, letterSpacing:".1em", textTransform:"uppercase" }}>Admin</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ padding:"4px 12px", borderRadius:8, background:"rgba(255,64,96,.1)", border:"1px solid rgba(255,64,96,.25)", fontSize:11.5, fontWeight:800, color:T.red }}>
            {pendingApprovals} pending approvals
          </div>
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <aside style={{ width:214, borderRight:"1px solid rgba(255,255,255,.05)", flexShrink:0, display:"flex", flexDirection:"column", background:`linear-gradient(180deg,${T.bg1},${T.bg})`, overflow:"auto" }}>
          <nav style={{ padding:"12px 10px", flex:1 }}>
            <div style={{ fontSize:9.5, fontWeight:900, color:T.g400, letterSpacing:".1em", textTransform:"uppercase", padding:"8px 8px 4px" }}>Control Panel</div>
            {ADMIN_NAV.map(it => (
              <button key={it.id} className={`sni ${section===it.id?"act":""}`} onClick={() => setSection(it.id)}>
                <span style={{ fontSize:13 }}>{it.icon}</span>{it.label}
              </button>
            ))}
          </nav>
          <div style={{ padding:12, borderTop:"1px solid rgba(255,255,255,.05)" }}>
            <div style={{ background:"rgba(255,64,96,.06)", border:"1px solid rgba(255,64,96,.15)", borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:9.5, fontWeight:900, color:"rgba(255,64,96,.7)", letterSpacing:".07em", textTransform:"uppercase", marginBottom:3 }}>Admin Access</div>
              <div style={{ fontSize:12, color:T.g200 }}>Role + RLS controlled</div>
            </div>
          </div>
        </aside>

        <main style={{ flex:1, overflow:"auto", padding:"24px 20px 60px", minWidth:0 }}>
          {renderSection()}
        </main>
      </div>
    </div>
  )
}

