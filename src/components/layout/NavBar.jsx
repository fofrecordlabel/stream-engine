import { useState, useRef, useEffect } from 'react'
import { T } from '../../tokens.js'
import { BrandMark } from '../common/Logo.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { isSpotifyConnected } from '../../lib/spotifyAuth.js'
import { useLang, LANGS } from '../../context/LangContext.jsx'
import AdminGateModal from '../admin/AdminGateModal.jsx'
import { isAdminUnlocked } from '../../lib/adminGate.js'

/* ── Submit dropdown items ── */
function SubmitDropdown({ setPage, onClose, t }) {
  const items = [
    { icon:'🎵', label: t('submitSong'),     sub: t('submitSongSub'),     page:'submit-song'     },
    { icon:'🎶', label: t('submitPlaylist'), sub: t('submitPlaylistSub'), page:'submit-playlist' },
  ]
  return (
    <div
      style={{ position:'absolute', top:'calc(100% + 10px)', left:'50%', transform:'translateX(-50%)',
               background:'#0f0f14', border:`1px solid ${T.b1}`, borderRadius:14, padding:8,
               width:290, zIndex:500, boxShadow:'0 24px 60px rgba(0,0,0,.8)', animation:'scaleIn .16s ease' }}
      onMouseLeave={onClose}>
      {items.map(it => (
        <button key={it.label} onClick={() => { setPage(it.page); onClose(); }}
          style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'11px 13px',
                   borderRadius:10, background:'none', border:'none', cursor:'pointer', textAlign:'left',
                   transition:'background .12s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <div style={{ width:36, height:36, borderRadius:9, background:'rgba(127,255,0,.08)',
                        border:`1px solid ${T.gnB}`, display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:16, flexShrink:0 }}>{it.icon}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:13.5, color:T.w, marginBottom:2 }}>{it.label}</div>
            <div style={{ fontSize:11.5, color:T.g300 }}>{it.sub}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

/* ── Language switcher pill ── */
function LangSwitcher() {
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 9px',
                 background: open ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)',
                 border:`1px solid ${T.b0}`, borderRadius:8,
                 color: T.g200, fontSize:11.5, fontWeight:700, cursor:'pointer',
                 letterSpacing:'.04em', transition:'all .15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}>
        🌐 {lang}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
          style={{ opacity:.5, transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0,
                      background:'#0f0f14', border:`1px solid ${T.b1}`, borderRadius:10,
                      padding:5, zIndex:500, boxShadow:'0 16px 40px rgba(0,0,0,.7)',
                      animation:'scaleIn .15s ease', minWidth:80 }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => { setLang(l); setOpen(false) }}
              style={{ display:'block', width:'100%', textAlign:'center', padding:'7px 12px',
                       borderRadius:7, background: lang === l ? 'rgba(127,255,0,.1)' : 'none',
                       border:'none', color: lang === l ? T.gn : T.g200,
                       fontSize:12.5, fontWeight: lang === l ? 700 : 500,
                       cursor:'pointer', transition:'all .12s' }}
              onMouseEnter={e => { if (lang !== l) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
              onMouseLeave={e => { if (lang !== l) e.currentTarget.style.background = 'none' }}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Nav links (public) ── */
const PUBLIC_LINKS = [
  { labelKey:'pricing', page:'pricing' },
  { labelKey:'tools',   page:'tools' },
  { labelKey:'blog',    page:'blog' },
]

export default function NavBar({ setPage, scrolled = false }) {
  const { user, role, credits, isLoggedIn, signOut } = useAuth()
  const { t } = useLang()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [userOpen,   setUserOpen]   = useState(false)
  const [adminGateOpen, setAdminGateOpen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(isAdminUnlocked())
  const submitRef = useRef(null)
  const userRef   = useRef(null)
  const spotifyOk = isSpotifyConnected()

  /* close dropdowns on outside click */
  useEffect(() => {
    const fn = (e) => {
      if (submitRef.current && !submitRef.current.contains(e.target)) setSubmitOpen(false)
      if (userRef.current   && !userRef.current.contains(e.target))   setUserOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  useEffect(() => {
    const sync = () => setAdminUnlocked(isAdminUnlocked())
    window.addEventListener('se-admin-gate-unlock', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('se-admin-gate-unlock', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const dashPage    = role === 'curator' ? 'curator' : role === 'admin' ? 'admin' : 'artist'
  const accentColor = role === 'curator' ? T.gold : role === 'admin' ? T.red : T.gn
  const planLabel   = role === 'curator' ? 'Curator' : 'Free'
  const canSeeAdmin = (role === 'admin') || adminUnlocked

  const avatarContent = user?.avatar || (user?.name?.slice(0,2).toUpperCase()) || 'ME'

  return (
    <>
    <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:200,
                  background: scrolled ? 'rgba(5,5,6,.97)' : 'rgba(5,5,6,.85)',
                  backdropFilter:'blur(24px)',
                  borderBottom:`1px solid ${scrolled ? T.b1 : 'rgba(255,255,255,.04)'}`,
                  transition:'all .25s ease' }}>
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 24px', paddingRight:'calc(24px + var(--se-right-gutter))', height:60,
                    display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>

        {/* ── Left: brand ── */}
        <div
          onDoubleClick={() => setAdminGateOpen(true)}
          style={{ display: 'flex', alignItems: 'center' }}
          title="Double-click for admin access"
        >
          <BrandMark onClick={() => setPage('home')} size={28} />
        </div>

        {/* ── Center: primary nav ── */}
        <div style={{ display:'flex', alignItems:'center', gap:2 }} className="hide-sm">

          {/* Dashboard (logged in only) */}
          {isLoggedIn && (
            <button onClick={() => setPage(dashPage)}
              style={{ padding:'7px 14px', borderRadius:9, background:'none', border:'none',
                       color:T.g200, fontSize:13.5, fontWeight:500, cursor:'pointer', transition:'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.w}
              onMouseLeave={e => e.currentTarget.style.color = T.g200}>
              {t('dashboard')}
            </button>
          )}

          {/* Submit dropdown */}
          <div ref={submitRef} style={{ position:'relative' }}>
            <button
              onClick={() => setSubmitOpen(o => !o)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:9,
                       background: submitOpen ? 'rgba(255,255,255,.06)' : 'none', border:'none',
                       color: submitOpen ? T.w : T.g200, fontSize:13.5, fontWeight:500, cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = T.w }}
              onMouseLeave={e => { if (!submitOpen) e.currentTarget.style.color = T.g200 }}>
              {t('submit')}
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                style={{ opacity:.6, transition:'transform .2s', transform: submitOpen ? 'rotate(180deg)' : 'none' }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {submitOpen && <SubmitDropdown setPage={setPage} onClose={() => setSubmitOpen(false)} t={t} />}
          </div>

          {/* Static links */}
          {PUBLIC_LINKS.map(l => (
            <button key={l.labelKey} onClick={() => setPage(l.page)}
              style={{ padding:'7px 14px', borderRadius:9, background:'none', border:'none',
                       color:T.g200, fontSize:13.5, fontWeight:500, cursor:'pointer', transition:'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.w}
              onMouseLeave={e => e.currentTarget.style.color = T.g200}>
              {t(l.labelKey)}
            </button>
          ))}
        </div>

        {/* ── Right: lang + account area ── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>

          {/* Language switcher */}
          <div className="hide-sm">
            <LangSwitcher />
          </div>

          {isLoggedIn ? (
            <>
              {/* Credits chip — artists */}
              {role === 'artist' && (
                <button onClick={() => setPage('artist')}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 11px',
                           background:'rgba(127,255,0,.08)', border:`1px solid rgba(127,255,0,.2)`,
                           borderRadius:8, cursor:'pointer', transition:'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(127,255,0,.14)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(127,255,0,.08)'}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:T.gn, boxShadow:`0 0 6px ${T.gn}` }} />
                  <span className="mono" style={{ fontSize:13, fontWeight:600, color:T.gn }}>{credits ?? 0}</span>
                  <span style={{ fontSize:10, fontWeight:800, color:'rgba(127,255,0,.55)', letterSpacing:'.05em' }}>CR</span>
                </button>
              )}

              {/* User avatar + dropdown */}
              <div ref={userRef} style={{ position:'relative' }}>
                <button type="button" aria-haspopup="menu" aria-expanded={userOpen}
                  onClick={() => setUserOpen(o => !o)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px 5px 6px',
                           background:'rgba(255,255,255,.04)', border:`1px solid ${T.b1}`,
                           borderRadius:10, cursor:'pointer', transition:'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}>

                  {/* Avatar circle */}
                  <div style={{ width:26, height:26, borderRadius:7,
                                background:`linear-gradient(135deg,${accentColor}22,${accentColor}40)`,
                                border:`1px solid ${accentColor}40`,
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:10, fontWeight:800, color:accentColor, flexShrink:0 }}>
                    {avatarContent}
                  </div>

                  <div className="hide-sm" style={{ textAlign:'left' }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:T.w, lineHeight:1.2 }}>
                      {user?.name?.split(' ')[0] || 'Account'}
                    </div>
                    <div style={{ fontSize:10.5, color:accentColor, fontWeight:700, lineHeight:1 }}>{planLabel}</div>
                  </div>

                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="hide-sm"
                    style={{ opacity:.4, marginLeft:2 }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {userOpen && (
                  <div role="menu" style={{ position:'absolute', top:'calc(100% + 8px)', right:0,
                                background:'#0f0f14', border:`1px solid ${T.b1}`, borderRadius:14,
                                padding:6, width:220, zIndex:500, boxShadow:'0 24px 60px rgba(0,0,0,.8)' }}>

                    {/* Header */}
                    <div style={{ padding:'10px 12px 12px', borderBottom:`1px solid ${T.b0}`, marginBottom:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                        <div style={{ width:36, height:36, borderRadius:9,
                                      background:`linear-gradient(135deg,${accentColor}22,${accentColor}40)`,
                                      border:`1px solid ${accentColor}40`,
                                      display:'flex', alignItems:'center', justifyContent:'center',
                                      fontSize:13, fontWeight:800, color:accentColor }}>
                          {avatarContent}
                        </div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13.5, color:T.w }}>{user?.name}</div>
                          <div style={{ fontSize:11, color:T.g300 }}>{user?.email}</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6,
                                       background:`${accentColor}18`, color:accentColor,
                                       border:`1px solid ${accentColor}30`, textTransform:'uppercase', letterSpacing:'.06em' }}>
                          {planLabel}
                        </span>
                        {spotifyOk && (
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6,
                                         background:'rgba(30,215,96,.1)', color:'#1ed760',
                                         border:'1px solid rgba(30,215,96,.22)' }}>
                            Spotify ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {[
                      { label: t('settings'), action: () => { setPage('settings'); setUserOpen(false) } },
                      ...(canSeeAdmin ? [{ label: 'Admin', action: () => { setPage('admin'); setUserOpen(false) } }] : []),
                    ].map(item => (
                      <button key={item.label} type="button" role="menuitem" onClick={item.action}
                        style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
                                 padding:'9px 12px', borderRadius:9, background:'none', border:'none',
                                 color:T.g100, fontSize:13.5, cursor:'pointer', transition:'background .08s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        {item.label}
                      </button>
                    ))}

                    <div style={{ height:1, background:T.b0, margin:'4px 6px' }} />

                    <button type="button" role="menuitem" onClick={async () => { await signOut(); setPage('home'); setUserOpen(false) }}
                      style={{ display:'block', width:'100%', textAlign:'left', padding:'9px 12px',
                               borderRadius:9, background:'none', border:'none', color:T.red,
                               fontSize:13.5, cursor:'pointer', fontWeight:600, transition:'background .08s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,64,96,.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      {t('signOut')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="na hide-sm" onClick={() => setPage('auth')}
                style={{ padding:'7px 14px', fontSize:13.5, borderRadius:9 }}>
                {t('logIn')}
              </button>
              <button className="bp" onClick={() => setPage('get-started')}
                style={{ padding:'8px 20px', fontSize:13.5, borderRadius:10, gap:6 }}>
                {t('getStarted')} <span className="arr">→</span>
              </button>
            </>
          )}
        </div>

      </div>
    </nav>
    <AdminGateModal
      open={adminGateOpen}
      onClose={() => setAdminGateOpen(false)}
      onUnlocked={() => setAdminUnlocked(true)}
    />
    </>
  )
}
