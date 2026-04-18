import { useState, useEffect, useRef, useCallback } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { BrandMark } from '../components/common/Logo.jsx'
import { Dot, SectionLabel, VerifiedMark, SpotifyBadge, CreditPill, SpotifySearchBar } from '../components/common/Atoms.jsx'
import { GENRES, FAQS_DATA } from '../data/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { fetchSpotifyTrack, isSpotifyTrackUrl, accentFromGenre } from '../lib/spotify.js'
import { spotifyMetadataUnavailableMessage } from '../lib/apiClient.js'
import { setPendingSubmission, normalizePendingSong } from '../lib/pendingSubmission.js'

export default function HomePage({ setPage }) {
  const { isLoggedIn } = useAuth()
  const loggedInRef = useRef(isLoggedIn)
  useEffect(() => { loggedInRef.current = isLoggedIn }, [isLoggedIn])
  const toast = useToast()
  const [scrolled, setScrolled] = useState(false);
  const [query,    setQuery]    = useState("");
  const [focused,  setFocused]  = useState(false);
  const [genre,    setGenre]    = useState("All");
  const [openFaq,  setOpenFaq]  = useState(null);
  const [fetching, setFetching] = useState(false);
  const [heroError, setHeroError] = useState('');
  const [heroSuccess, setHeroSuccess] = useState('');

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive:true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const goPricingPage = () => setPage('subscriptions')

  const isUrl = isSpotifyTrackUrl(query.trim())
  const displayCurators = []

  const continueFromHero = useCallback(async () => {
    const spotifyUrl = query.trim()
    setHeroError('')
    setHeroSuccess('')

    if (!isSpotifyTrackUrl(spotifyUrl)) {
      setHeroError('Paste a valid Spotify track link to continue.')
      return
    }

    setFetching(true)
    try {
      const track = await fetchSpotifyTrack(spotifyUrl)
      if (!track) {
        setHeroError(spotifyMetadataUnavailableMessage())
        return
      }

      const song = normalizePendingSong({
        ...track,
        spotifyUrl: track.spotifyUrl || spotifyUrl,
        trackId: track.id,
        spotifyId: track.id,
        genre: '',
        ac: accentFromGenre(''),
      })

      setPendingSubmission({
        source: 'home-hero',
        intent: 'playlist_push',
        resumeAfterAuth: true,
        status: 'metadata-ready',
        song,
      })

      setHeroSuccess(`Loaded ${track.title} by ${track.artist}.`)
      toast.success(`${track.title} is ready for Playlist Push`, 'Track loaded')

      if (loggedInRef.current) {
        setPage('artist')
      } else {
        setPage('auth')
      }
    } catch (e) {
      setHeroError(e?.message || 'Could not fetch Spotify metadata.')
    } finally {
      setFetching(false)
    }
  }, [query, setPage])

  return (
    <div style={{ background:T.bg, color:T.w, minHeight:"100vh", width:"100%", overflowX:"hidden" }}>
      <NavBar setPage={setPage} scrolled={scrolled} />

      {/* HERO */}
      <section style={{ position:"relative", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"118px 0 88px", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"20%", left:"50%", transform:"translateX(-50%)", width:800, height:560, background:"radial-gradient(ellipse,rgba(127,255,0,.07) 0%,transparent 62%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.016) 1px,transparent 1px)", backgroundSize:"60px 60px", pointerEvents:"none" }} />
        <div className="se-shell" style={{ position:"relative", width:"100%", display:"flex", justifyContent:"center", boxSizing:"border-box" }}>
        <div style={{ maxWidth:"min(760px, 100%)", width:"100%", margin:"0 auto", boxSizing:"border-box", position:"relative", display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center" }}>
          <div className="fu1" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 16px 6px 8px", borderRadius:30, background:T.gnGl, border:`1px solid ${T.gnB}`, marginBottom:22 }}>
            <span style={{ background:T.gn, color:"#000", fontWeight:900, fontSize:9.5, padding:"3px 9px", borderRadius:20, letterSpacing:".05em" }}>LIVE</span>
            <Dot size={5} pulse />
            <span style={{ fontSize:13, color:T.g100, fontWeight:500 }}>3,200+ verified Spotify curators</span>
          </div>
          <h1 className="fu2" style={{ fontSize:"clamp(46px,7.2vw,88px)", fontWeight:900, lineHeight:1.02, letterSpacing:"-.045em", marginBottom:24, maxWidth:"100%" }}>
            Get your music<br />onto Spotify<br />
            <span style={{ color:T.gn, animation:"glow 3.5s ease-in-out infinite" }}>playlists.</span>
          </h1>
          <p className="fu3" style={{ fontSize:"clamp(15px,2.1vw,19px)", color:T.g200, lineHeight:1.82, marginBottom:36, maxWidth:540, width:"100%" }}>
            Paste your Spotify track once, save it to your account, and launch one Playlist Push campaign. Credit packs plus optional Pro subscription. Transparent. Fast.
          </p>
          <div className="fu4" style={{ width:"100%", maxWidth:580, marginBottom:22 }}>
            <form onSubmit={e => { e.preventDefault(); continueFromHero(); }} style={{ position:"relative" }}>
              <SpotifySearchBar value={query} onChange={(v) => { setQuery(v); setHeroSuccess(''); setHeroError('') }} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} focused={focused} large placeholder="Paste a Spotify track link…" />
              {query && (
                <button type="submit" disabled={fetching} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:`linear-gradient(135deg,${T.gn},#5ac800)`, border:"none", borderRadius:10, padding:"8px 12px", fontWeight:900, fontSize:13, color:"#000", cursor:"pointer", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", opacity:fetching ? 0.7 : 1 }}>
                  {fetching ? 'Loading…' : 'Go'} →
                </button>
              )}
            </form>
            {heroError && (
              <div style={{ marginTop:14, fontSize:13, color:T.red, fontWeight:600, lineHeight:1.55, maxWidth:520, marginLeft:"auto", marginRight:"auto" }}>
                {heroError}
              </div>
            )}
            {heroSuccess && !heroError && (
              <div style={{ marginTop:14, fontSize:13, color:T.gn, fontWeight:700 }}>
                {heroSuccess}{fetching ? '' : isLoggedIn ? ' Taking you to your dashboard…' : ' Opening sign-in…'}
              </div>
            )}
          </div>
          <div className="fu5" style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap", marginBottom:32, width:"100%", maxWidth:440 }}>
            <button type="button" className="bp" onClick={() => { if (isUrl) void continueFromHero(); else setPage('get-started') }} style={{ flex:1, padding:"14px 22px", fontSize:15.5, minWidth:130 }}>
              {isUrl ? 'Load track & continue' : 'Get Started'} <span className="arr">→</span>
            </button>
            <button type="button" className="bs" onClick={goPricingPage} style={{ flex:1, padding:"14px 22px", fontSize:15.5, minWidth:110 }}>Pricing</button>
          </div>
          <div className="fu5" style={{ display:"flex", gap:9, justifyContent:"center", flexWrap:"wrap", rowGap:10 }}>
            {[{i:"✓",t:"Verified curators"},{i:"🎯",t:"Multi-select campaign"},{i:"🔒",t:"Credit refund guarantee"},{i:"⚡",t:"18h avg response"}].map(t => (
              <div key={t.t} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:20, background:"rgba(255,255,255,.04)", border:`1px solid ${T.b0}`, fontSize:12.5, color:T.g100, fontWeight:500 }}>
                <span style={{ fontSize:11 }}>{t.i}</span>{t.t}
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      {/* STATS */}
      <div style={{ borderTop:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
        <div className="se-shell" style={{ paddingTop:36, paddingBottom:36, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:16 }}>
          {[{n:"3,200+",l:"Curators"},{n:"18K+",l:"Artists Promoted"},{n:"94%",l:"Avg Response Rate"},{n:"$2.4M",l:"Paid to Curators"}].map(s => (
            <div key={s.n} style={{ textAlign:"center" }}>
              <div className="mono" style={{ fontSize:"clamp(22px,3.5vw,32px)", fontWeight:500, color:T.gn, lineHeight:1, marginBottom:5 }}>{s.n}</div>
              <div style={{ fontSize:13, color:T.g300, fontWeight:500 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section style={{ padding:"80px 0", background:`linear-gradient(180deg,${T.bg1},${T.bg})` }}>
        <div className="se-shell">
          <SectionLabel>How It Works</SectionLabel>
          <h2 style={{ fontSize:"clamp(24px,4vw,40px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:12 }}>Four steps to playlist placement</h2>
          <p style={{ color:T.g200, fontSize:15, marginBottom:48, maxWidth:440 }}>Paste your track, pick curators, submit one campaign.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:22 }}>
            {[
              {n:"01",i:"🎵",t:"Paste your track",  d:"Paste your Spotify link or search by title. We identify genre and sound for best curator matches."},
              {n:"02",i:"🎯",t:"Pick curators",      d:"Filter by genre, response rate, credits. Select as many curators as you want."},
              {n:"03",i:"✍️",t:"Submit campaign",    d:"One click submits to all selected curators simultaneously."},
              {n:"04",i:"📊",t:"Track results",      d:"See approvals, playlist adds, and spend — all in your real-time dashboard."},
            ].map(s => (
              <div key={s.n}>
                <div style={{ width:28, height:28, borderRadius:8, background:T.gnGl, border:`1px solid ${T.gnB}`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:36 }}>
                  <span className="mono" style={{ fontSize:11, color:T.gn, fontWeight:700 }}>{s.n}</span>
                </div>
                <div style={{ fontSize:28, marginBottom:13 }}>{s.i}</div>
                <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>{s.t}</h3>
                <p style={{ color:T.g200, fontSize:13.5, lineHeight:1.75 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CURATOR SHOWCASE */}
      <section style={{ padding:"80px 0", background:T.bg }}>
        <div className="se-shell">
          <SectionLabel color="#ff6b35">🔥 Featured Curators</SectionLabel>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:14, marginBottom:24 }}>
            <div>
              <h2 style={{ fontSize:"clamp(22px,4vw,38px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:7 }}>Browse top Spotify curators</h2>
              <p style={{ color:T.g200, fontSize:14.5 }}>All verified · Credit-based campaigns</p>
            </div>
            <button className="bs" onClick={() => setPage("artist")} style={{ padding:"10px 18px", fontSize:13.5 }}>View All →</button>
          </div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:22 }}>
            {GENRES.map(g => (
              <button key={g} className={`chip ${genre===g?"csel":"cb"}`} onClick={() => setGenre(g)} style={{ cursor:"pointer" }}>{g}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
            {displayCurators.map(c => (
              <div key={c.id} onClick={continueFromHero} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:14, padding:"16px 15px", cursor:"pointer", transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b0;e.currentTarget.style.transform="none";}}>
                <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:11 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:`${c.color}22`, border:`1px solid ${c.color}28`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{c.artwork}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
                      <span style={{ fontWeight:700, fontSize:13.5, color:T.w, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</span>
                      {c.verified && <VerifiedMark size={13} />}
                    </div>
                    <span className="chip cb" style={{ fontSize:10, padding:"1px 7px" }}>{c.genre}</span>
                  </div>
                </div>
                <div style={{ fontSize:11.5, color:T.g200, marginBottom:10 }}>{c.followers} followers</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:11.5, color:T.g300 }}>{c.responseRate}% response</div>
                  <CreditPill n={c.credits} />
                </div>
              </div>
            ))}
          </div>
          {displayCurators.length === 0 && (
            <div style={{ textAlign:'center', padding:'42px 18px', border:`1px dashed ${T.b1}`, borderRadius:16, color:T.g300, marginTop:10 }}>
              <div style={{ fontSize:34, marginBottom:10 }}>🎧</div>
              <div style={{ fontWeight:800, fontSize:14.5, marginBottom:6 }}>Curator marketplace is coming soon</div>
              <div style={{ fontSize:13, color:T.g400, maxWidth:520, margin:'0 auto' }}>
                In live mode, featured curators will populate from your connected backend marketplace.
              </div>
            </div>
          )}
          <div style={{ textAlign:"center", marginTop:24 }}>
            <button className="bp" onClick={continueFromHero} style={{ padding:"13px 30px", fontSize:15 }}>Start Your Campaign <span className="arr">→</span></button>
          </div>
        </div>
      </section>

      {/* PRICING (plans + credits) */}
      <section id="pricing" style={{ padding:"80px 0", background:T.bg1, borderTop:"1px solid rgba(255,255,255,.05)", scrollMarginTop:"60px" }}>
        <div className="se-shell" style={{ maxWidth:860 }}>
          <SectionLabel>Pricing</SectionLabel>
          <h2 style={{ fontSize:"clamp(24px,4vw,40px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:10 }}>Credits & subscriptions</h2>
          <p style={{ color:T.g200, fontSize:15, marginBottom:18 }}>Credit packs never expire · Optional Pro subscription · Stripe checkout</p>
          <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:18, padding:"20px 18px" }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
              <div style={{ color:T.g200, fontSize:13.5, lineHeight:1.6 }}>
                See plan tiers and buy credits in one place — or open billing from your dashboard after sign-in.
              </div>
              <button type="button" className="bp" onClick={() => setPage(isLoggedIn ? 'artist' : 'subscriptions')} style={{ padding:"11px 18px", fontSize:13.5, borderRadius:11 }}>
                View pricing →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding:"80px 0", background:T.bg }}>
        <div className="se-shell">
          <SectionLabel>Results</SectionLabel>
          <h2 style={{ fontSize:"clamp(22px,4vw,38px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:14 }}>Track outcomes over time</h2>
          <p style={{ color:T.g200, fontSize:14.5, maxWidth:560, lineHeight:1.7 }}>
            Once you start submitting, StreamEngine will show your submission history and curator responses here and in your dashboard.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding:"80px 0", background:T.bg1, borderTop:"1px solid rgba(255,255,255,.05)" }}>
        <div className="se-shell" style={{ maxWidth:680 }}>
          <SectionLabel>FAQ</SectionLabel>
          <h2 style={{ fontSize:"clamp(22px,4vw,36px)", fontWeight:900, letterSpacing:"-.03em", marginBottom:38 }}>Common questions</h2>
          {FAQS_DATA.map((f, i) => (
            <div key={i} style={{ borderBottom:"1px solid rgba(255,255,255,.05)" }}>
              <button style={{ width:"100%", textAlign:"left", background:"none", padding:"18px 0", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", color:T.w, fontSize:15, fontWeight:600, transition:"color .15s" }}
                onClick={() => setOpenFaq(openFaq===i?null:i)}
                onMouseEnter={e=>e.currentTarget.style.color=T.gn} onMouseLeave={e=>e.currentTarget.style.color=T.w}>
                <span>{f.q}</span>
                <span style={{ fontSize:20, color:T.g300, transform:openFaq===i?"rotate(45deg)":"none", transition:"transform .2s", flexShrink:0 }}>+</span>
              </button>
              {openFaq===i && <div style={{ fontSize:14, color:T.g200, lineHeight:1.75, paddingBottom:18, animation:"fadeUp .2s ease" }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding:"90px 0", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:600, height:400, background:"radial-gradient(ellipse,rgba(127,255,0,.08) 0%,transparent 65%)", pointerEvents:"none" }} />
        <div className="se-shell" style={{ maxWidth:580, position:"relative" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 14px", borderRadius:20, background:T.gnGl, border:`1px solid ${T.gnB}`, marginBottom:24 }}>
            <Dot size={5} /><span style={{ fontSize:12, color:T.gn, fontWeight:700 }}>Join 18,000+ artists</span>
          </div>
          <h2 style={{ fontSize:"clamp(28px,6vw,56px)", fontWeight:900, letterSpacing:"-.04em", lineHeight:1.05, marginBottom:18 }}>
            Ready to grow on<br /><span style={{ color:T.gn }}>Spotify?</span>
          </h2>
          <p style={{ color:T.g200, fontSize:15.5, marginBottom:32, lineHeight:1.7 }}>Paste your track and submit to real curators in minutes.</p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", maxWidth:360, margin:"0 auto" }}>
            <button className="bp" onClick={continueFromHero} style={{ flex:1, padding:"15px 20px", fontSize:16, minWidth:140 }}>Get Started Free <span className="arr">→</span></button>
            <button type="button" className="bs" onClick={goPricingPage} style={{ flex:1, padding:"15px 20px", fontSize:16, minWidth:110 }}>Pricing</button>
          </div>
          <div style={{ marginTop:16, fontSize:13, color:T.g400 }}>No subscription · Credits never expire · Free to browse</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop:"1px solid rgba(255,255,255,.05)", padding:"32px 0" }}>
        <div className="se-shell">
          <div className="se-footer-row">
            <BrandMark onClick={() => setPage("home")} size={28} />
            <div className="se-footer-links">
              {[
                { l:"Pricing", p:"subscriptions" },
                { l:"How It Works", p:"how-it-works" },
                { l:"FAQ",          p:"faq" },
                { l:"Contact",      p:"contact" },
                { l:"Terms",        p:"terms" },
                { l:"Privacy",      p:"privacy" },
              ].map(x => (
                <button
                  key={x.l}
                  onClick={() => setPage(x.p)}
                  style={{ color:T.g300, fontSize:13.5, background:"none", border:"none", cursor:"pointer", padding:0, transition:"color .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.color=T.w}
                  onMouseLeave={e=>e.currentTarget.style.color=T.g300}
                >
                  {x.l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,.05),transparent)", marginBottom:18 }} />
          <div className="se-footer-bottom">
            <div style={{ fontSize:13, color:T.g400 }}>© 2025 Stream Engine Inc. All rights reserved.</div>
            <div style={{ display:"flex", gap:16, alignItems:"center" }}>
              <span style={{ fontSize:13, color:T.g400 }}>Stripe-powered · Spotify-only</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
