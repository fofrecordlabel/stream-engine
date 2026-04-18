import { useEffect } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { SongArt, SpotifyBadge } from '../components/common/Atoms.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getPendingSubmission } from '../lib/pendingSubmission.js'

export default function GetStartedScreen({ setPage }) {
  const { isLoggedIn } = useAuth()
  const pending = getPendingSubmission()
  const selected = pending?.song || null

  useEffect(() => {
    if (!selected) return
    const timer = setTimeout(() => setPage(isLoggedIn ? 'artist' : 'auth'), 600)
    return () => clearTimeout(timer)
  }, [isLoggedIn, selected, setPage])

  return (
    <div style={{ background:T.bg, color:T.w, minHeight:"100vh", width:"100%", overflowX:"hidden", display:"flex", flexDirection:"column" }}>
      <div style={{ height:58, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px", borderBottom:"1px solid rgba(255,255,255,.05)", background:"rgba(5,5,6,.98)", backdropFilter:"blur(20px)", flexShrink:0 }}>
        <BrandMark onClick={() => setPage("home")} size={26} />
        <button className="bt" onClick={() => setPage("home")} style={{ fontSize:13 }}>← Back</button>
      </div>

      <div style={{ display:"flex", justifyContent:"center", gap:8, padding:"22px 0 0" }}>
        {[1,2].map(n => (
          <div key={n} style={{ width:n===1?24:8, height:8, borderRadius:4, background:T.gn, transition:"all .3s ease" }} />
        ))}
      </div>
      <div style={{ textAlign:"center", marginTop:8, fontSize:11.5, color:T.g300, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase" }}>
        Playlist Push
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"32px 20px 80px", maxWidth:600, margin:"0 auto", width:"100%" }}>
        <div style={{ width:"100%", animation:"fadeUp .4s ease both" }}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>{selected ? '✓' : '🎵'}</div>
            <h1 style={{ fontSize:"clamp(24px,5vw,36px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:10 }}>
              {selected ? 'Track ready for Playlist Push' : 'Paste your Spotify link on the homepage'}
            </h1>
            <p style={{ fontSize:14.5, color:T.g200, lineHeight:1.65 }}>
              {selected ? 'We already saved your track metadata. Continuing you into the real submission flow now.' : 'Your live submission flow now starts from the homepage paste box.'}
            </p>
          </div>
          {selected ? (
            <div style={{ background:`linear-gradient(135deg,rgba(127,255,0,.06),rgba(127,255,0,.02))`, border:"1px solid rgba(127,255,0,.25)", borderRadius:18, padding:"22px 20px", marginBottom:24, display:"flex", gap:16, alignItems:"center" }}>
              <SongArt song={selected} size={62} r={14} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:17, color:T.w, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.title}</div>
                <div style={{ fontSize:13, color:T.g200, marginBottom:8 }}>{selected.artist}</div>
                <div style={{ display:"flex", gap:6, flexWrap:'wrap' }}>
                  <SpotifyBadge />
                  {selected.genre && <span className="chip cb" style={{ fontSize:10.5, padding:"2px 8px" }}>{selected.genre}</span>}
                </div>
              </div>
            </div>
          ) : null}
          <button className="bp" onClick={() => setPage(selected ? (isLoggedIn ? "artist" : "auth") : "home")} style={{ width:"100%", padding:"15px 0", fontSize:16, borderRadius:13, marginBottom:12 }}>
            {selected ? 'Continue' : 'Back to Homepage'} <span className="arr">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
