import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { MobileDrawer } from '../components/layout/Sidebar.jsx'
import { CuratorInboxSection, CuratorPlaylistsSection, CuratorHistorySection, CuratorProfileSection } from '../components/curator/index.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { isDemo } from '../lib/supabase.js'

const NAV = [
  { id:"inbox",     icon:"📥", label:"Inbox"            },
  { id:"playlists", icon:"🎵", label:"Playlists"        },
  { id:"history",   icon:"📋", label:"History"          },
  { id:"profile",   icon:"🎨", label:"Profile"          },
  { id:"settings",  icon:"⚙",  label:"Settings"         },
];

export default function CuratorDashboard({ setPage }) {
  const { user, signOut } = useAuth()
  const [section,      setSection]      = useState("inbox");
  const [drawer,       setDrawer]       = useState(false);
  const [isMobile,     setIsMobile]     = useState(window.innerWidth < 700);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [earnings] = useState({ pending:0, thisMonth:0, total:0 });

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn, { passive:true });
    return () => window.removeEventListener("resize", fn);
  }, []);

  const renderSection = () => {
    const emptyCopy = {
      inbox: ['No submissions yet', 'Once your curator account is approved and playlists are connected, submissions will appear here.'],
      playlists: ['No playlists connected', 'Connect Spotify and add your first playlist to start receiving submissions.'],
      history: ['No history yet', 'Accepted and completed reviews will appear here once you start reviewing.'],
      profile: ['Curator profile setup', 'Complete your profile and preferences to get approved.'],
    }
    const [title, desc] = emptyCopy[section] || ['Nothing here yet', 'This section will populate when live curator data is available.']
    return (
      <div style={{ background:`linear-gradient(145deg,${T.bg1},${T.bg})`, border:`1px dashed ${T.b1}`, borderRadius:16, padding:'52px 24px', textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🎵</div>
        <div style={{ fontWeight:800, fontSize:18, color:T.w, marginBottom:6 }}>{title}</div>
        <div style={{ fontSize:13.5, color:T.g300, maxWidth:420, margin:'0 auto' }}>{desc}</div>
        {isDemo && (
          <div style={{ marginTop:12, fontSize:12.5, color:T.gold, fontWeight:800 }}>
            Demo mode is enabled — connect Supabase to use real curator data.
          </div>
        )}
      </div>
    )
  };

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
                <button key={it.id} className={`sni ${section===it.id?"act":""}`} onClick={() => setSection(it.id)}>
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
                <button key={it.id} className={`chip ${section===it.id?"csel":"cb"}`} onClick={() => setSection(it.id)} style={{ flexShrink:0 }}>{it.icon} {it.label}</button>
              ))}
            </div>
          )}
          {renderSection()}
        </main>
      </div>

      {isMobile && drawer && (
        <MobileDrawer items={NAV} section={section} setSection={setSection} wallet={0} onClose={() => setDrawer(false)} label="Curator" />
      )}
    </div>
  );
}
