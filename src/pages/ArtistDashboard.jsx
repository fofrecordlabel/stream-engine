import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { MobileDrawer, DesktopSide } from '../components/layout/Sidebar.jsx'
import { SongsSection, ArtistSubmissionsPage, BillingSection, SubmissionBuilder } from '../components/artist/index.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useSongs } from '../hooks/useSongs.js'
import { useCampaigns } from '../hooks/useCampaigns.js'
import { isSpotifyConnected } from '../lib/spotifyAuth.js'
import { clearPendingSubmission, getPendingSubmission } from '../lib/pendingSubmission.js'
import { hasBlockingActiveCampaignForSong } from '../lib/dedupeRules.js'

const NAV = [
  { id:"songs",       icon:"🎵", label:"My Songs"   },
  { id:"submissions", icon:"📋", label:"Campaigns"  },
  { id:"billing",     icon:"💳", label:"Credits"    },
  { id:"analytics",   icon:"📊", label:"Analytics"  },
  { id:"settings",    icon:"⚙",  label:"Settings"   },
]

const SESSION_NAV_SECTION = 'se_artist_section'
const artistSectionStorageKey = (userId) => `se_artist_section_saved_${userId}`

/** Free plan: up to 10 Playlist Push campaigns per week; count resets each Monday (local time). */
function countCampaignsSinceLocalWeekMonday(campaigns) {
  if (!Array.isArray(campaigns)) return 0
  const now = new Date()
  const dow = now.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday, 0, 0, 0, 0)
  const t0 = monday.getTime()
  return campaigns.filter((c) => {
    const t = new Date(c.created_at || c.createdAt || 0).getTime()
    return Number.isFinite(t) && t >= t0
  }).length
}

/* ── Account summary hero ── */
function AccountSummary({ user, role, credits, songs, campaigns, onUpgrade }) {
  const spotifyOk = isSpotifyConnected()
  const accentColor = role === 'curator' ? T.gold : role === 'admin' ? T.red : T.gn
  const planLabel   = role === 'curator' ? 'Curator' : role === 'admin' ? 'Admin' : 'Free'
  const avatarContent = user?.avatar || (user?.name?.slice(0,2).toUpperCase()) || 'ME'

  const approved = campaigns?.filter(c => c.status === 'approved').length ?? 0
  const pending  = campaigns?.filter(c => c.status === 'pending').length  ?? 0
  const submissionsMax = 10
  const submissionsUsed = countCampaignsSinceLocalWeekMonday(campaigns || [])
  const submissionsRemaining = Math.max(0, submissionsMax - submissionsUsed)

  const stats = [
    { label:'Songs',       value: songs?.length ?? 0,  color: T.w      },
    { label:'This week', value: submissionsUsed,      color: T.w      },
    { label:'Approved',    value: approved,             color: T.gn     },
    { label:'Pending',     value: pending,              color: T.gold   },
  ]

  return (
    <div style={{ marginBottom:28 }}>
      {/* Account card */}
      <div style={{ background:`linear-gradient(145deg,#101013,#0c0c0f)`, border:`1px solid ${T.b0}`,
                    borderRadius:18, padding:'20px 24px', marginBottom:16, position:'relative', overflow:'hidden' }}>
        {/* Subtle accent glow */}
        <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180,
                      background:`radial-gradient(circle,${accentColor}12 0%,transparent 70%)`,
                      pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          {/* Left: avatar + identity */}
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            {/* Avatar */}
            <div style={{ width:52, height:52, borderRadius:14,
                          background:`linear-gradient(135deg,${accentColor}22,${accentColor}40)`,
                          border:`1.5px solid ${accentColor}50`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:16, fontWeight:800, color:accentColor, flexShrink:0 }}>
              {avatarContent}
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:17, fontWeight:800, color:T.w }}>
                  {user?.name || 'Artist'}
                </span>
                <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20,
                               background:`${accentColor}18`, color:accentColor,
                               border:`1px solid ${accentColor}30`, textTransform:'uppercase', letterSpacing:'.06em' }}>
                  {planLabel}
                </span>
                {spotifyOk && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
                                 background:'rgba(30,215,96,.1)', color:'#1ed760',
                                 border:'1px solid rgba(30,215,96,.2)' }}>
                    Spotify ✓
                  </span>
                )}
              </div>
              <div style={{ fontSize:12, color:T.g300 }}>{user?.email || ''}</div>
            </div>
          </div>

          {/* Right: submissions + credits + upgrade */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
            {/* Submissions remaining */}
            <div style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 13px',
                          background:'rgba(255,255,255,.04)', border:`1px solid ${T.b0}`,
                          borderRadius:10 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:T.gn,
                             boxShadow:`0 0 6px ${T.gn}`, flexShrink:0 }} />
              <span style={{ fontSize:12.5, fontWeight:700, color:T.w }}>{submissionsRemaining}</span>
              <span style={{ fontSize:11.5, color:T.g300 }}>free submissions left this week</span>
            </div>

            {/* Credits chip + Buy More */}
            <div style={{ display:'flex', alignItems:'center', gap:0,
                          background:'rgba(127,255,0,.06)', border:`1px solid rgba(127,255,0,.18)`,
                          borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:T.gn,
                               boxShadow:`0 0 6px ${T.gn}`, flexShrink:0 }} />
                <span className="mono" style={{ fontSize:15, fontWeight:700, color:T.gn }}>{credits ?? 0}</span>
                <span style={{ fontSize:10, fontWeight:800, color:'rgba(127,255,0,.5)',
                               letterSpacing:'.07em', textTransform:'uppercase' }}>CR</span>
              </div>
              <button onClick={onUpgrade}
                style={{ padding:'8px 11px', background:'rgba(127,255,0,.12)',
                         borderLeft:'1px solid rgba(127,255,0,.2)', border:'none',
                         color:T.gn, fontSize:11.5, fontWeight:800, cursor:'pointer',
                         letterSpacing:'.03em', transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(127,255,0,.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(127,255,0,.12)'}>
                Buy More
              </button>
            </div>

            {/* Upgrade CTA */}
            {role !== 'admin' && (
              <button onClick={onUpgrade} className="bp"
                style={{ padding:'10px 18px', fontSize:13, borderRadius:11 }}>
                Upgrade <span className="arr">→</span>
              </button>
            )}
          </div>
        </div>

        {/* Submissions progress bar */}
        <div style={{ marginTop:18, paddingTop:16, borderTop:`1px solid ${T.b0}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
            <span style={{ fontSize:11.5, color:T.g300, fontWeight:600 }}>
              Weekly free submissions (resets every Monday)
            </span>
            <span className="mono" style={{ fontSize:11.5, color:T.g200 }}>
              {submissionsUsed} / {submissionsMax}
            </span>
          </div>
          <div style={{ height:4, borderRadius:4, background:'rgba(255,255,255,.06)', overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:4,
                          width:`${Math.min(submissionsUsed / submissionsMax * 100, 100)}%`,
                          background:`linear-gradient(90deg,${T.gn},#6de800)`,
                          transition:'width .6s ease' }} />
          </div>
          <div style={{ fontSize:10.5, color:T.g400, marginTop:8, lineHeight:1.45 }}>
            Free plan includes up to {submissionsMax} Playlist Push campaigns per calendar week (Monday 00:00–Sunday in your local time). Upgrade for unlimited submissions.
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {stats.map(s => (
          <div key={s.label}
            style={{ background:`linear-gradient(145deg,#101013,#0d0d10)`,
                     border:`1px solid ${T.b0}`, borderRadius:14,
                     padding:'16px 18px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2,
                          background:`linear-gradient(90deg,${s.color}40,transparent)`,
                          borderRadius:'14px 14px 0 0' }} />
            <div className="mono" style={{ fontSize:28, fontWeight:700, color:s.color,
                                           lineHeight:1, marginBottom:5 }}>
              {s.value}
            </div>
            <div style={{ fontSize:11, color:T.g300, fontWeight:600,
                          textTransform:'uppercase', letterSpacing:'.06em' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Analytics placeholder ── */
function AnalyticsSection() {
  const all = []
  const approved = all.filter(d => d.status === 'approved').length
  const total    = all.length
  const rate     = total ? Math.round(approved / total * 100) : 0
  const totalSpend = all.reduce((a, d) => a + d.credits, 0)
  const bars = [
  ]
  if (all.length === 0) {
    return (
      <div>
        <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-.02em', marginBottom:20 }}>Analytics</h1>
        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px dashed ${T.b1}`, borderRadius:16, padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:34, marginBottom:12 }}>📈</div>
          <div style={{ fontWeight:700, fontSize:16, color:T.w, marginBottom:6 }}>No campaigns yet</div>
          <div style={{ fontSize:13.5, color:T.g300 }}>Launch your first Playlist Push campaign to unlock performance analytics.</div>
        </div>
      </div>
    )
  }
  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-.02em', marginBottom:20 }}>Analytics</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, marginBottom:24 }}>
        {[
          { l:'Approval Rate',   v:`${rate}%`,       c:T.gn,   ic:'📈' },
          { l:'Total Submitted', v:total,             c:T.w,    ic:'📤' },
          { l:'Approved',        v:approved,          c:T.gn,   ic:'✓'  },
          { l:'Credits Spent',   v:`${totalSpend}cr`, c:T.gold, ic:'💳' },
        ].map(s => (
          <div key={s.l} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`,
                                  border:`1px solid ${T.b0}`, borderRadius:12, padding:'14px 15px' }}>
            <div style={{ fontSize:18, marginBottom:8 }}>{s.ic}</div>
            <div className="mono" style={{ fontSize:24, color:s.c, marginBottom:3 }}>{s.v}</div>
            <div style={{ fontSize:11, color:T.g300 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize:14, fontWeight:700, marginBottom:14, color:T.g100 }}>Performance by Song</h2>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {bars.map(b => {
          const t2 = b.approved + b.declined + b.pending
          return (
            <div key={b.label} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`,
                                        border:`1px solid ${T.b0}`, borderRadius:14, padding:'16px 18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{b.label}</span>
                <span style={{ fontSize:12, color:T.g300 }}>{t2} curators</span>
              </div>
              <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,.06)',
                            overflow:'hidden', marginBottom:10, display:'flex' }}>
                <div style={{ width:`${b.approved/t2*100}%`, background:T.gn,   transition:'width .6s ease' }} />
                <div style={{ width:`${b.pending/t2*100}%`,  background:T.gold, transition:'width .6s ease' }} />
                <div style={{ width:`${b.declined/t2*100}%`, background:T.red,  transition:'width .6s ease' }} />
              </div>
              <div style={{ display:'flex', gap:16 }}>
                {[{l:'Approved',v:b.approved,c:T.gn},{l:'Pending',v:b.pending,c:T.gold},{l:'Declined',v:b.declined,c:T.red}].map(s => (
                  <div key={s.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:s.c }} />
                    <span style={{ fontSize:11.5, color:T.g300 }}>{s.l}</span>
                    <span className="mono" style={{ fontSize:12, color:s.c }}>{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main dashboard ── */
export default function ArtistDashboard({ setPage }) {
  const toast = useToast()
  const { user, role, credits, spendCredits, addCredits, signOut } = useAuth()
  const { songs, setSongs, loading: songsLoading, addSong, removeSong, incrementSubmissions } = useSongs(user?.id)
  const { campaigns, loading: campaignsLoading, error: campaignsError, createCampaign } = useCampaigns(user?.id, 'artist')

  const [section,    setSection]  = useState('songs')
  const [submitting, setSubmitting] = useState(null)
  const [drawer,     setDrawer]   = useState(false)
  const [scrolled,   setScrolled] = useState(false)
  const [isMobile,   setIsMobile] = useState(window.innerWidth < 700)
  const [restoringDraft, setRestoringDraft] = useState(false)

  const selectNav = (id) => {
    if (id === 'settings') {
      setPage('settings')
      return
    }
    setSection(id)
  }

  useEffect(() => {
    if (!user?.id) return
    try {
      const pending = sessionStorage.getItem(SESSION_NAV_SECTION)
      if (pending && NAV.some((n) => n.id === pending)) {
        setSection(pending)
        sessionStorage.removeItem(SESSION_NAV_SECTION)
        return
      }
      const saved = localStorage.getItem(artistSectionStorageKey(user.id))
      if (saved && NAV.some((n) => n.id === saved)) setSection(saved)
    } catch { /* ignore */ }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    try {
      localStorage.setItem(artistSectionStorageKey(user.id), section)
    } catch { /* ignore */ }
  }, [section, user?.id])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700)
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('resize', onResize, { passive:true })
    window.addEventListener('scroll', onScroll,  { passive:true })
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    if (!user?.id || songsLoading || restoringDraft) return
    const pending = getPendingSubmission()
    if (!pending?.song || !pending?.resumeAfterAuth) return

    let cancelled = false
    const restore = async () => {
      setRestoringDraft(true)
      try {
        const pendingSong = pending.song
        const result = await addSong(pendingSong)
        const readySong = result?.data || pendingSong

        if (!cancelled && readySong) {
          setSubmitting(readySong)
          clearPendingSubmission()
        }
      } finally {
        if (!cancelled) setRestoringDraft(false)
      }
    }

    restore()
    return () => { cancelled = true }
  }, [user?.id, songsLoading, songs, addSong, restoringDraft])

  const wallet    = credits ?? 0
  const setWallet = () => {}

  const handleComplete = async (song, selectedCurators, campaignType, details) => {
    if (hasBlockingActiveCampaignForSong(song, campaigns)) {
      toast.error('This song already has an active submission.', 'Already submitted')
      return
    }

    if (user?.id && campaignType) {
      const cr = await createCampaign({
        songId: song.id,
        song,
        campaignType,
        selectedCurators,
        userId: user.id,
        pitchText: details?.pitchText || null,
        moodTags: details?.moodTags || null,
      })
      if (cr?.error) {
        const dup = cr.code === 'DUPLICATE_ACTIVE_CAMPAIGN' || cr.error?.code === 'DUPLICATE_ACTIVE_CAMPAIGN'
        toast.error(
          dup
            ? 'This song already has an active submission.'
            : (cr.error?.message || 'Could not create campaign.'),
          dup ? 'Already submitted' : 'Error',
        )
        return
      }
    }

    await incrementSubmissions(song.id, selectedCurators.length)
    if (typeof spendCredits === 'function') {
      const cost = selectedCurators.reduce((a, c) => a + (c.credits || 0), 0)
      if (cost > 0) spendCredits(cost)
    }
    setSubmitting(null)
    setSection('submissions')
  }

  const handleSubmitAgain = (historyEntry) => {
    const song = songs.find(s => s.id === historyEntry.songId) || {
      id:historyEntry.songId, title:historyEntry.song, artist:historyEntry.artist,
      genre:'Hip-Hop', platform:'spotify', bg:historyEntry.bg, ac:historyEntry.ac,
    }
    if (hasBlockingActiveCampaignForSong(song, campaigns)) {
      toast.error('This song already has an active submission.', 'Already submitted')
      return
    }
    setSubmitting(song)
  }

  const handleAddSong = async (newSong) => {
    if (typeof addSong === 'function') {
      const result = await addSong(newSong)
      if (result?.duplicate) {
        if (result?.merged) toast.info('Song already added — using existing record.', 'Library')
        else toast.info('That Spotify track is already in your library.', 'Already saved')
      } else if (result?.error) toast.error(result.error.message || 'Could not save song', 'Error')
    } else {
      setSongs(p => [newSong, ...p])
    }
  }

  const renderSection = () => {
    switch (section) {
      case 'songs':       return <SongsSection songs={songs} campaigns={campaigns} onSubmit={setSubmitting} onAddSong={handleAddSong} onAddAndPromote={setSubmitting} onDeleteSong={removeSong} />
      case 'submissions': return <ArtistSubmissionsPage onSubmitAgain={handleSubmitAgain} campaigns={campaigns} loading={campaignsLoading} error={campaignsError} />
      case 'billing':     return <BillingSection wallet={wallet} setWallet={setWallet} onBuy={addCredits} />
      case 'analytics':   return <AnalyticsSection />
      default: return (
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, marginBottom:6, textTransform:'capitalize' }}>{section}</h1>
          <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:'1px dashed rgba(255,255,255,.07)',
                        borderRadius:14, padding:'40px 20px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🚧</div>
            <div style={{ fontWeight:600 }}>Coming soon</div>
          </div>
        </div>
      )
    }
  }

  /* ── Submission builder — full screen ── */
  if (submitting) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:T.bg, color:T.w, overflowX:'hidden' }}>
        <NavBar setPage={setPage} scrolled />
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0, marginTop:60 }}>
          <SubmissionBuilder song={submitting} campaigns={campaigns} onBack={() => setSubmitting(null)}
            wallet={wallet} setWallet={setWallet} onComplete={handleComplete} addCredits={addCredits}
            userId={user?.id || null}
            invite={getPendingSubmission()?.invite || null}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:T.bg, color:T.w, overflowX:'hidden' }}>

      {/* Fixed top nav */}
      <NavBar setPage={setPage} scrolled={scrolled} />

      {/* Body below nav */}
      <div style={{ display:'flex', flex:1, marginTop:60 }}>

        {/* Desktop sidebar */}
        {!isMobile && (
          <DesktopSide items={NAV} section={section} setSection={selectNav}
            wallet={wallet} onBuyCredits={() => setSection('billing')} />
        )}

        {/* Main content */}
        <main style={{ flex:1, overflow:'auto', minWidth:0 }}>
          <div className="se-dash-main">

          {/* Mobile section tabs */}
          {isMobile && (
            <div className="scroll-x" style={{ display:'flex', gap:6, marginBottom:18 }}>
              {NAV.map(t => (
                <button key={t.id} type="button" className={`chip ${section===t.id?'csel':'cb'}`}
                  onClick={() => selectNav(t.id)} style={{ flexShrink:0 }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Account summary + stats — only on Songs section (home) */}
          {section === 'songs' && (
            <AccountSummary
              user={user} role={role} credits={wallet}
              songs={songs} campaigns={campaigns}
              onUpgrade={() => setSection('billing')}
            />
          )}

          {renderSection()}
          </div>
        </main>
      </div>

      {/* Mobile drawer */}
      {isMobile && drawer && (
        <MobileDrawer items={NAV} section={section} setSection={selectNav}
          wallet={wallet} onClose={() => setDrawer(false)} />
      )}
    </div>
  )
}
