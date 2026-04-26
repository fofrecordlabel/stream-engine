import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { MobileDrawer } from '../components/layout/Sidebar.jsx'
import OnboardingCoach from '../components/onboarding/OnboardingCoach.jsx'
import { CuratorInboxSection, CuratorPlaylistsSection, CuratorHistorySection, CuratorProfileSection } from '../components/curator/index.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const NAV = [
  { id:"inbox",     icon:"📥", label:"Inbox",     coach:"coach-nav-inbox" },
  { id:"playlists", icon:"🎵", label:"Playlists", coach:"coach-nav-playlists" },
  { id:"history",   icon:"📋", label:"History" },
  { id:"profile",   icon:"🎨", label:"Profile",   coach:"coach-nav-profile" },
  { id:"settings",  icon:"⚙",  label:"Settings" },
]

const CURATOR_COACH_STEPS = [
  { selector: '[data-coach="coach-nav-inbox"]', title: 'Submission inbox', body: 'New artist campaigns land here. Accept or pass with structured feedback.' },
  { selector: '[data-coach="coach-nav-playlists"]', title: 'Playlist slots', body: 'Connect Spotify playlists and set credits so artists can target you accurately.' },
  { selector: '[data-coach="coach-nav-profile"]', title: 'Public profile', body: 'Complete your curator card — genres, turnaround, and rules build trust with artists.' },
]

const LS_CURATOR_COACH_DONE = 'se_curator_coach_done'
const LS_CURATOR_COACH_STEP = 'se_curator_coach_step'

export default function CuratorDashboard({ setPage }) {
  const { user, signOut } = useAuth()
  const [section,      setSection]      = useState("inbox");
  const [drawer,       setDrawer]       = useState(false);
  const [isMobile,     setIsMobile]     = useState(window.innerWidth < 700);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [earnings] = useState({ pending:0, thisMonth:0, total:0 });
  const [curatorCoachStep, setCuratorCoachStep] = useState(0)
  const [curatorCoachOff, setCuratorCoachOff] = useState(false)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn, { passive:true });
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LS_CURATOR_COACH_DONE) === '1') setCuratorCoachOff(true)
      const s = parseInt(sessionStorage.getItem(LS_CURATOR_COACH_STEP) || '0', 10)
      if (Number.isFinite(s) && s >= 0) setCuratorCoachStep(s)
    } catch { /* ignore */ }
  }, [])

  const showCuratorCoach = !curatorCoachOff && curatorCoachStep < CURATOR_COACH_STEPS.length

  const persistCuratorCoachStep = (n) => {
    try { sessionStorage.setItem(LS_CURATOR_COACH_STEP, String(n)) } catch { /* ignore */ }
    setCuratorCoachStep(n)
  }

  const dismissCuratorCoach = () => {
    try {
      sessionStorage.setItem(LS_CURATOR_COACH_DONE, '1')
      sessionStorage.setItem(LS_CURATOR_COACH_STEP, String(CURATOR_COACH_STEPS.length))
    } catch { /* ignore */ }
    setCuratorCoachOff(true)
  }

  const selectNav = (id) => {
    if (id === 'settings') {
      setPage('settings')
      return
    }
    setSection(id)
  }

  const renderSection = () => {
    switch (section) {
      case 'inbox':     return <CuratorInboxSection />
      case 'playlists': return <CuratorPlaylistsSection />
      case 'history':   return <CuratorHistorySection />
      case 'profile':   return <CuratorProfileSection />
      case 'settings':  return null
      default: return null
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:T.bg, color:T.w, width:"100%", overflowX:"hidden" }}>
      <div style={{ height:58, borderBottom:"1px solid rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background:"rgba(5,5,6,.97)", backdropFilter:"blur(20px)", zIndex:50, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {isMobile && (
            <button onClick={() => setDrawer(true)} style={{ width:36, height:36, borderRadius:9, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer" }}>
              {[0,1,2].map(i => <div key={i} style={{ width:15, height:2, background:"#fff", borderRadius:2 }} />)}
            </button>
          )}
          <BrandMark onClick={() => setPage("home")} size={26} />
          <span style={{ fontSize:12, color:T.g300, fontWeight:600, letterSpacing:".03em" }}>Curator</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button type="button" className="bt hide-sm" onClick={() => setPage('playlist-trader')} style={{ padding:'7px 12px', fontSize:12.5, borderRadius:9, color:T.g200 }}>
            Playlist Trader
          </button>
          <div className="hide-sm" style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 13px", background:"rgba(255,255,255,.04)", border:`1px solid ${T.b0}`, borderRadius:9 }}>
            <span style={{ fontSize:11, color:T.g300, fontWeight:800 }}>Earnings</span>
            <span className="mono" style={{ fontSize:13, color:T.g200 }}>$0.00</span>
          </div>
          <div style={{ position:"relative" }}>
            <div title={user?.name || ''} style={{ width:34, height:34, borderRadius:9, background:"rgba(255,199,64,.1)", border:"1px solid rgba(255,199,64,.22)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:T.gold, cursor:"pointer", flexShrink:0 }}
              onClick={() => setShowUserMenu(p=>!p)}>
              {user?.avatar || (user?.name?.slice(0,2).toUpperCase()) || "CU"}
            </div>
            {showUserMenu && (
              <div style={{ position:"absolute", top:40, right:0, background:"#13131a", border:`1px solid ${T.b1}`, borderRadius:11, padding:"6px", minWidth:150, boxShadow:"0 12px 40px rgba(0,0,0,.7)", zIndex:200 }}>
                <div style={{ padding:"7px 12px 5px", fontSize:11.5, color:T.g300, fontWeight:600, borderBottom:`1px solid ${T.b0}`, marginBottom:4 }}>{user?.name || "Curator"}</div>
                <button onClick={() => { setShowUserMenu(false); setPage('playlist-trader'); }}
                  style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", color:T.g100, fontSize:13, cursor:"pointer", borderRadius:7 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.06)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>Playlist Trader</button>
                <button onClick={() => { setShowUserMenu(false); setSection("profile"); }}
                  style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", color:T.g100, fontSize:13, cursor:"pointer", borderRadius:7 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.06)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>Profile</button>
                <button onClick={() => { setShowUserMenu(false); setSection("settings"); }}
                  style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", color:T.g100, fontSize:13, cursor:"pointer", borderRadius:7 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.06)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>Settings</button>
                <button onClick={() => { setShowUserMenu(false); signOut().then(() => setPage("home")); }}
                  style={{ width:"100%", textAlign:"left", padding:"8px 12px", background:"none", border:"none", color:T.red, fontSize:13, cursor:"pointer", borderRadius:7 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,64,96,.08)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {!isMobile && (
          <aside style={{ width:210, borderRight:"1px solid rgba(255,255,255,.05)", flexShrink:0, display:"flex", flexDirection:"column", background:`linear-gradient(180deg,${T.bg1},${T.bg})`, overflow:"auto" }}>
            <nav style={{ padding:"12px 10px", flex:1 }}>
              <div style={{ fontSize:9.5, fontWeight:800, color:T.g400, letterSpacing:".1em", textTransform:"uppercase", padding:"8px 8px 4px" }}>Curator</div>
              {NAV.map(it => (
                <button key={it.id} type="button" data-coach={it.coach || undefined} className={`sni ${section===it.id?"act":""}`} onClick={() => selectNav(it.id)}>
                  <span style={{ fontSize:13 }}>{it.icon}</span>{it.label}
                </button>
              ))}
            </nav>
            <div style={{ padding:12, borderTop:"1px solid rgba(255,255,255,.05)" }}>
              <div style={{ background:"rgba(255,255,255,.04)", border:`1px solid ${T.b0}`, borderRadius:12, padding:"13px 14px" }}>
                <div style={{ fontSize:9.5, fontWeight:800, color:T.g400, letterSpacing:".07em", textTransform:"uppercase", marginBottom:4 }}>Payouts</div>
                <div className="mono" style={{ fontSize:22, color:T.g200, marginBottom:3 }}>$0.00</div>
                <div style={{ fontSize:11, color:T.g300 }}>Available once approved</div>
              </div>
            </div>
          </aside>
        )}
        <main style={{ flex:1, overflow:"auto", padding:"22px 16px 60px", minWidth:0 }}>
          {isMobile && (
            <div className="scroll-x" style={{ display:"flex", gap:6, marginBottom:18 }}>
              {NAV.slice(0,3).map(it => (
                <button key={it.id} type="button" data-coach={it.coach || undefined} className={`chip ${section===it.id?"csel":"cb"}`} onClick={() => selectNav(it.id)} style={{ flexShrink:0 }}>{it.icon} {it.label}</button>
              ))}
            </div>
          )}
          {renderSection()}
        </main>
      </div>

      {isMobile && drawer && (
        <MobileDrawer items={NAV} section={section} setSection={selectNav} wallet={0} onClose={() => setDrawer(false)} label="Curator" />
      )}

      <OnboardingCoach
        steps={CURATOR_COACH_STEPS}
        active={showCuratorCoach}
        stepIndex={curatorCoachStep}
        onSetStep={(n) => persistCuratorCoachStep(n)}
        onDismiss={dismissCuratorCoach}
      />
    </div>
  );
}
