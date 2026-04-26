import { useState, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../tokens.js'
import { SpotifyBadge, CreditPill, SongArt, StatusBadge, TypeBadge, VerifiedMark, SpotifyMiniPlayer } from '../common/Atoms.jsx'
import AssistantPanel from '../ai/AssistantPanel.jsx'
import { GENRES, ALL_TAGS, CREDIT_PACKS } from '../../data/index.js'
import { fetchSpotifyTrack, isSpotifyTrackUrl, accentFromGenre, formatDuration } from '../../lib/spotify.js'
import { creditsToUsd } from '../../lib/stripe.js'
import { isDemo, supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { getPendingSubmission } from '../../lib/pendingSubmission.js'
import { isDev } from '../../lib/env.js'
import { hasBlockingActiveCampaignForSong } from '../../lib/dedupeRules.js'
import { FREE_WEEKLY_SUBMISSION_CAP, PRO_WEEKLY_SUBMISSION_CAP } from '../../lib/submissionQuota.js'

/* ── SongSquare ── */
export function SongSquare({ entry, size = 58, r = 11 }) {
  return <SongArt song={entry} size={size} r={r} />;
}

const MOOD_OPTIONS = [
  'High Energy',
  'Emotional',
  'Chill',
  'Dark',
  'Feel-Good',
  'Late Night',
  'Club Ready',
  'Melodic',
  'Cinematic',
  'Romantic',
]

/* ── AddSongModal ── */
const GENRE_OPTIONS = ["Hip-Hop","R&B","Electronic","Indie","Pop","Lo-Fi","Latin","Afrobeats","Soul","Reggaeton"];
const ACCENT_MAP    = { "Hip-Hop":"#7fff00","R&B":"#ec4899","Electronic":"#a78bfa","Indie":"#38bdf8","Pop":"#f59e0b","Lo-Fi":"#f59e0b","Latin":"#ff6b35","Afrobeats":"#ff6b35","Soul":"#ec4899","Reggaeton":"#10b981" };

const SPOTIFY_RE = /^https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+/;

function validateSpotify(url) {
  if (!url) return null; // optional — empty is fine
  if (SPOTIFY_RE.test(url)) return null;
  return "Must be a Spotify track URL: open.spotify.com/track/…";
}

export function AddSongModal({ onClose, onAdd, onAddAndPromote }) {
  const [title,      setTitle]      = useState("");
  const [artist,     setArtist]     = useState("");
  const [spotUrl,    setSpotUrl]    = useState("");
  const [genre,      setGenre]      = useState("Hip-Hop");
  // Full imported track metadata — all set atomically
  const [imported,   setImported]   = useState(null); // { artworkUrl, previewUrl, duration, albumName, releaseDate }
  const [importMsg,  setImportMsg]  = useState(null); // { type:"ok"|"err", text }
  const [errors,     setErrors]     = useState({});
  const [phase,      setPhase]      = useState("idle"); // idle | importing | loading | success

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape" && phase === "idle") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose, phase]);

  /* ── Spotify import — ATOMIC: clears all prior imported metadata first ── */
  const handleSpotifyImport = async () => {
    const url = spotUrl.trim();
    if (!isSpotifyTrackUrl(url)) {
      setImportMsg({ type:"err", text:"Paste a Spotify track URL first (open.spotify.com/track/…)" });
      return;
    }
    // Clear all stale imported metadata immediately
    setImported(null);
    setTitle("");
    setArtist("");
    setImportMsg(null);
    setPhase("importing");
    try {
      const track = await fetchSpotifyTrack(url);
      if (track) {
        // Set all fields together from fresh import
        setTitle(track.title  || "");
        setArtist(track.artist || "");
        setImported({
          id:          track.id         || null,
          artworkUrl:  track.artworkUrl  || null,
          previewUrl:  track.previewUrl  || null,
          duration:    track.duration    || null,
          albumName:   track.albumName   || null,
          releaseDate: track.releaseDate || null,
        });
        setImportMsg({ type:"ok", text:`✓ ${track.title} · ${track.artist}` });
      } else {
        setImportMsg({ type:"err", text:"Couldn't fetch track info — fill in details below" });
      }
    } catch (e) {
      setImportMsg({ type:"err", text: e?.message || "Import failed — check the URL and try again" });
    } finally {
      setPhase("idle");
    }
  };

  const validate = () => {
    const errs = {};
    if (!title.trim())  errs.title  = "Song title is required";
    if (!artist.trim()) errs.artist = "Artist name is required";
    if (spotUrl.trim() && !isSpotifyTrackUrl(spotUrl.trim())) errs.spotUrl = "Must be a Spotify track URL: open.spotify.com/track/…";
    return errs;
  };

  const buildSong = () => ({
    id:          imported?.id ? `song-${imported.id}` : `s${Date.now()}`,
    trackId:     imported?.id || null,
    spotifyId:   imported?.id || null,
    title:       title.trim(),
    artist:      artist.trim(),
    genre,
    platform:    "spotify",
    bpm:         Math.floor(Math.random() * 60) + 80,
    bg:          "#050506",
    ac:          accentFromGenre(genre),
    artworkUrl:  imported?.artworkUrl  || null,
    previewUrl:  imported?.previewUrl  || null,
    duration:    imported?.duration    || null,
    albumName:   imported?.albumName   || null,
    releaseDate: imported?.releaseDate || null,
    spotifyUrl:  spotUrl.trim()        || null,
    submissions: 0,
    addedAt:     new Date().toISOString(),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setPhase("loading");
    setTimeout(() => {
      onAdd(buildSong());
      setPhase("success");
      setTimeout(onClose, 1500);
    }, 600);
  };

  const handleAddAndPromote = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    const song = buildSong();
    onAdd(song);
    onClose();
    if (onAddAndPromote) onAddAndPromote(song);
  };

  const inpStyle = (field) => ({
    background: "rgba(255,255,255,.05)",
    border: `1.5px solid ${errors[field] ? T.red : T.b1}`,
    borderRadius: 11,
    padding: "11px 14px",
    fontSize: 14,
    color: T.w,
    width: "100%",
    outline: "none",
    transition: "border-color .15s, box-shadow .15s",
    fontFamily: "inherit",
  });

  const modal = (
    <div
      style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center",
               background:"rgba(0,0,0,.75)", backdropFilter:"blur(10px)", animation:"fadeIn .18s ease" }}
      onClick={e => { if (e.target === e.currentTarget && phase === "idle") onClose(); }}
    >
      <div style={{ background:"linear-gradient(160deg,#16161e,#0d0d13)", border:`1px solid ${T.b1}`,
                    borderRadius:22, padding:"28px 26px", width:"min(480px,95vw)",
                    animation:"scaleIn .22s cubic-bezier(.34,1.56,.64,1)",
                    boxShadow:"0 40px 100px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.04)" }}>

        {/* ── Success state ── */}
        {phase === "success" ? (
          <div style={{ textAlign:"center", padding:"20px 0 12px" }}>
            <div style={{ width:68, height:68, borderRadius:"50%", background:T.gnGl, border:`1.5px solid ${T.gnB}`,
                          display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px",
                          animation:"successBounce .5s ease" }}>
              <svg width="30" height="30" viewBox="0 0 28 28" fill="none">
                <path d="M5 14l6 6 12-12" stroke={T.gn} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontWeight:800, fontSize:18, color:T.w, marginBottom:6 }}>Song added!</div>
            <div style={{ fontSize:13, color:T.g300 }}>
              <span style={{ color:T.gn, fontWeight:600 }}>{title}</span> is now in your library
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:19, letterSpacing:"-.02em", marginBottom:3 }}>Add Song</div>
                <div style={{ fontSize:12.5, color:T.g300 }}>Paste a Spotify link to auto-fill details</div>
              </div>
              <button type="button" onClick={onClose} disabled={phase !== "idle"}
                style={{ width:32, height:32, borderRadius:9, background:"rgba(255,255,255,.06)", border:`1px solid ${T.b0}`,
                         color:T.g100, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center",
                         flexShrink:0, transition:"background .15s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.11)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.06)"}>✕</button>
            </div>

            {/* ── Artwork preview (shown after import) ── */}
            {imported?.artworkUrl && (
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px", background:"rgba(30,215,96,.05)",
                            border:"1px solid rgba(30,215,96,.18)", borderRadius:13, marginBottom:18 }}>
                <img src={imported.artworkUrl} alt="Album art" style={{ width:56, height:56, borderRadius:9, objectFit:"cover", flexShrink:0 }} />
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:2, color:T.w, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{title}</div>
                  <div style={{ fontSize:12.5, color:T.g300, marginBottom:6 }}>{artist}{imported.duration ? ` · ${formatDuration(imported.duration)}` : ""}</div>
                  <SpotifyMiniPlayer previewUrl={imported.previewUrl} spotifyUrl={spotUrl.trim()} />
                </div>
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
              {/* ── Spotify Link (first — enables auto-fill) ── */}
              <div>
                <label style={{ fontSize:10.5, fontWeight:700, color:errors.spotUrl?T.red:"#1DB954", letterSpacing:".07em", textTransform:"uppercase", display:"block", marginBottom:7 }}>
                  Spotify Link <span style={{ color:T.g400, fontWeight:500, textTransform:"none", letterSpacing:0 }}>(auto-fills below)</span>
                </label>
                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ position:"relative", flex:1 }}>
                    <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={errors.spotUrl?"#ff4060":"rgba(30,215,96,.6)"}>
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </div>
                    <input
                      autoFocus
                      style={{ ...inpStyle("spotUrl"), paddingLeft:34 }}
                      placeholder="https://open.spotify.com/track/…"
                      value={spotUrl}
                      onChange={e => { setSpotUrl(e.target.value); setImportMsg(null); if (errors.spotUrl) setErrors(p=>({...p,spotUrl:""})); }}
                      onFocus={e => e.target.style.borderColor = errors.spotUrl ? T.red : "#1DB954"}
                      onBlur={e  => e.target.style.borderColor = errors.spotUrl ? T.red : T.b1}
                    />
                  </div>
                  <button type="button" onClick={handleSpotifyImport}
                    disabled={phase === "importing" || !spotUrl.trim()}
                    style={{ padding:"0 16px", borderRadius:11, border:"1.5px solid rgba(30,215,96,.4)", background:"rgba(30,215,96,.08)",
                             color:"#1DB954", fontWeight:700, fontSize:13, cursor:"pointer", flexShrink:0,
                             opacity: (!spotUrl.trim() || phase==="importing") ? .45 : 1,
                             transition:"all .15s", whiteSpace:"nowrap" }}
                    onMouseEnter={e=>{ if(spotUrl.trim() && phase!=="importing") e.currentTarget.style.background="rgba(30,215,96,.16)" }}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(30,215,96,.08)"}>
                    {phase === "importing" ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation:"spin .7s linear infinite", display:"block" }}>
                        <circle cx="12" cy="12" r="10" stroke="rgba(30,215,96,.3)" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    ) : "Import"}
                  </button>
                </div>
                {errors.spotUrl  && <div style={{ fontSize:11.5, color:T.red,    marginTop:5, fontWeight:500 }}>⚠ {errors.spotUrl}</div>}
                {importMsg && (
                  <div style={{ fontSize:12, marginTop:6, fontWeight:600,
                                color: importMsg.type === "ok" ? "#1DB954" : T.red }}>
                    {importMsg.text}
                  </div>
                )}
              </div>

              {/* Song Name */}
              <div>
                <label style={{ fontSize:10.5, fontWeight:700, color:errors.title?T.red:T.g200, letterSpacing:".07em", textTransform:"uppercase", display:"block", marginBottom:7 }}>
                  Song Name *
                </label>
                <input
                  style={inpStyle("title")}
                  placeholder="Song title"
                  value={title}
                  onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(p=>({...p,title:""})); }}
                  onFocus={e => e.target.style.borderColor = errors.title ? T.red : T.gn}
                  onBlur={e  => e.target.style.borderColor = errors.title ? T.red : T.b1}
                />
                {errors.title && <div style={{ fontSize:11.5, color:T.red, marginTop:5, fontWeight:500 }}>⚠ {errors.title}</div>}
              </div>

              {/* Artist Name */}
              <div>
                <label style={{ fontSize:10.5, fontWeight:700, color:errors.artist?T.red:T.g200, letterSpacing:".07em", textTransform:"uppercase", display:"block", marginBottom:7 }}>
                  Artist Name *
                </label>
                <input
                  style={inpStyle("artist")}
                  placeholder="e.g. FOF Records"
                  value={artist}
                  onChange={e => { setArtist(e.target.value); if (errors.artist) setErrors(p=>({...p,artist:""})); }}
                  onFocus={e => e.target.style.borderColor = errors.artist ? T.red : T.gn}
                  onBlur={e  => e.target.style.borderColor = errors.artist ? T.red : T.b1}
                />
                {errors.artist && <div style={{ fontSize:11.5, color:T.red, marginTop:5, fontWeight:500 }}>⚠ {errors.artist}</div>}
              </div>

              {/* Genre */}
              <div>
                <label style={{ fontSize:10.5, fontWeight:700, color:T.g200, letterSpacing:".07em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Genre</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {GENRE_OPTIONS.map(g => (
                    <button type="button" key={g} onClick={() => setGenre(g)}
                      style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer",
                               border:`1px solid ${genre===g ? T.gn : T.b1}`,
                               background:genre===g ? T.gnGl : "transparent",
                               color:genre===g ? T.gn : T.g200,
                               transition:"all .12s" }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button type="button" className="bs" onClick={onClose} disabled={phase !== "idle"} style={{ flex:1, padding:"12px 0", fontSize:13 }}>
                Cancel
              </button>
              {onAddAndPromote && imported && (
                <button type="button" onClick={handleAddAndPromote}
                  disabled={phase !== "idle"}
                  style={{ flex:2, padding:"12px 0", fontSize:14, borderRadius:11, background:"linear-gradient(135deg,#7fff00,#5fdf00)", color:"#000", fontWeight:800, border:"none", cursor:"pointer" }}>
                  Add & Promote Now 🚀
                </button>
              )}
              <button type="submit" className="bp" disabled={phase === "loading" || phase === "importing"} style={{ flex: onAddAndPromote && imported ? 1 : 2, padding:"12px 0", fontSize:14 }}>
                {phase === "loading" ? (
                  <span style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation:"spin .7s linear infinite" }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.3)" strokeWidth="3"/>
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Adding…
                  </span>
                ) : (
                  <>Save <span className="arr">→</span></>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  // Portal to document.body — escapes any parent overflow/stacking context
  return createPortal(modal, document.body);
}

/* ── SongsSection ── */
export function SongsSection({ songs, campaigns = [], onSubmit, onAddSong, onAddAndPromote, onDeleteSong }) {
  const toast = useToast()
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const displaySongs = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of songs) {
      const k = String(s.spotifyId || s.spotify_id || '').trim()
      if (k) {
        if (seen.has(k)) continue
        seen.add(k)
      }
      out.push(s)
    }
    return out
  }, [songs])

  const songLink = (s) => s.spotifyUrl || s.spotify_url || (s.spotifyId || s.spotify_id ? `https://open.spotify.com/track/${s.spotifyId || s.spotify_id}` : null)

  const trySubmit = (song, { closeDetail = false } = {}) => {
    if (hasBlockingActiveCampaignForSong(song, campaigns)) {
      toast.error('This song already has an active submission.', 'Already submitted')
      return
    }
    if (closeDetail) setDetail(null)
    onSubmit(song)
  }

  return (
    <div>
      {showModal && <AddSongModal onClose={() => setShowModal(false)} onAdd={onAddSong} onAddAndPromote={onAddAndPromote ? (song) => { setShowModal(false); onAddAndPromote(song); } : undefined} />}
      {detail && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        >
          <div style={{ width:'100%', maxWidth:520, borderRadius:18, border:`1px solid ${T.b1}`, background:`linear-gradient(145deg,${T.card},#0d0d10)`, boxShadow:'0 30px 90px rgba(0,0,0,.75)', padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, minWidth:0 }}>
                <SongArt song={detail} size={54} r={12} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:900, fontSize:15, color:T.w, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{detail.title}</div>
                  <div style={{ color:T.g300, fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{detail.artist}</div>
                </div>
              </div>
              <button className="bt" onClick={() => setDetail(null)} style={{ padding:'7px 10px' }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div style={{ border:`1px solid ${T.b0}`, borderRadius:14, padding:'12px 12px', background:'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize:10.5, fontWeight:900, letterSpacing:'.08em', textTransform:'uppercase', color:T.g400, marginBottom:6 }}>Album</div>
                <div style={{ fontSize:13, color:T.g100 }}>{detail.albumName || detail.album_name || '—'}</div>
              </div>
              <div style={{ border:`1px solid ${T.b0}`, borderRadius:14, padding:'12px 12px', background:'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize:10.5, fontWeight:900, letterSpacing:'.08em', textTransform:'uppercase', color:T.g400, marginBottom:6 }}>Release</div>
                <div style={{ fontSize:13, color:T.g100 }}>{(detail.releaseDate || detail.release_date || '—').toString().slice(0, 10)}</div>
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <SpotifyBadge />
                {songLink(detail) && (
                  <a href={songLink(detail)} target="_blank" rel="noreferrer" style={{ color:T.gn, fontWeight:800, fontSize:12.5, textDecoration:'none' }}>
                    Open in Spotify →
                  </a>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" className="bt" disabled={hasBlockingActiveCampaignForSong(detail, campaigns)} onClick={() => trySubmit(detail, { closeDetail: true })} style={{ padding:'9px 12px', opacity: hasBlockingActiveCampaignForSong(detail, campaigns) ? 0.45 : 1 }}>
                  Submit
                </button>
                <button className="bt" onClick={() => { setConfirmDel(detail); setDetail(null) }} style={{ padding:'9px 12px', color:T.red, borderColor:'rgba(255,64,96,.25)', background:'rgba(255,64,96,.06)' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDel(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', zIndex:1500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        >
          <div style={{ width:'100%', maxWidth:440, borderRadius:18, border:`1px solid ${T.b1}`, background:'#0f0f14', boxShadow:'0 30px 90px rgba(0,0,0,.75)', padding:16 }}>
            <div style={{ fontWeight:900, fontSize:15, color:T.w, marginBottom:8 }}>Delete this song?</div>
            <div style={{ fontSize:13, color:T.g200, lineHeight:1.6, marginBottom:14 }}>
              This removes it from your saved songs. It won’t affect any existing curator reviews already sent.
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="bt" onClick={() => setConfirmDel(null)} style={{ padding:'9px 12px' }}>Cancel</button>
              <button
                className="bp"
                onClick={() => { onDeleteSong?.(confirmDel.id); setConfirmDel(null) }}
                style={{ padding:'9px 14px', background:'#ff4060', borderColor:'#ff4060' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:3 }}>My Songs</h1>
          <p style={{ color:T.g200, fontSize:13 }}>{displaySongs.length} track{displaySongs.length!==1?"s":""} ready to promote</p>
        </div>
        <button className="bs" onClick={() => setShowModal(true)} style={{ padding:"9px 16px", fontSize:13 }}>+ Add Song</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {displaySongs.length === 0 && (
          <div style={{ textAlign:"center", padding:"48px 20px", border:`1px dashed ${T.b1}`, borderRadius:16, color:T.g300 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🎵</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>No songs added yet</div>
            <div style={{ fontSize:13, marginBottom:18 }}>Paste your Spotify link to add your first song and launch Playlist Push.</div>
            <button className="bp" onClick={() => setShowModal(true)} style={{ padding:"10px 22px", fontSize:13 }}>+ Add Song</button>
          </div>
        )}
        {displaySongs.map((song, i) => {
          const statusColor = song.submissions > 0 ? T.gn : T.g300;
          const statusLabel = song.submissions > 0 ? `${song.submissions} campaigns` : "Ready to submit";
          return (
            <div key={song.id} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:16, padding:"16px 18px", animation:`fadeUp .4s ${i*.05}s ease both`, transition:"border-color .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.b1}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.b0}
            >
              <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", justifyContent:"space-between", width:"100%" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", flex:1, minWidth:0, justifyContent:"center" }}>
                  <SongArt song={song} size={52} />
                  <div style={{ flex:1, minWidth:100, textAlign:"left" }}>
                    <div style={{ fontWeight:700, fontSize:15, marginBottom:5 }}>{song.title}</div>
                    <div style={{ fontSize:12.5, color:T.g300, marginBottom:6 }}>{song.artist}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", justifyContent:"flex-start" }}>
                      <SpotifyBadge />
                      <span className="chip cb" style={{ fontSize:10.5, padding:"2px 8px" }}>{song.genre}</span>
                      <span style={{ fontSize:11, color:statusColor, fontWeight:600 }}>● {statusLabel}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <button type="button" className="bt" onClick={() => setDetail(song)} style={{ padding:"10px 12px", fontSize:13.5, borderRadius:10 }}>
                    Details
                  </button>
                  <button type="button" className="bp" disabled={hasBlockingActiveCampaignForSong(song, campaigns)} title={hasBlockingActiveCampaignForSong(song, campaigns) ? 'This song already has an active submission' : undefined} onClick={() => trySubmit(song)} style={{ padding:"10px 18px", fontSize:13.5, borderRadius:10, opacity: hasBlockingActiveCampaignForSong(song, campaigns) ? 0.45 : 1 }}>
                    Submit <span className="arr">→</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── CuratorGridCard ── */
export function CuratorGridCard({ c, selected, onToggle }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={() => onToggle(c)}
      style={{ background:selected?`linear-gradient(145deg,#0d1a0a,#0b120a)`:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${selected?"rgba(127,255,0,.45)":hov?T.b1:T.b0}`, borderRadius:14, padding:"15px 14px 13px", cursor:"pointer", position:"relative", overflow:"hidden", transition:"all .2s", transform:selected||hov?"translateY(-2px)":"none", boxShadow:selected?`0 0 0 2px ${T.gn},0 8px 32px rgba(127,255,0,.1)`:hov?"0 10px 36px rgba(0,0,0,.5)":"none", animation:selected?"borderGlow 2.5s ease infinite":"none" }}>
      {selected && <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"65%", height:1, background:`linear-gradient(90deg,transparent,${T.gn},transparent)` }} />}
      <div style={{ position:"absolute", top:11, right:11 }}>
        <div style={{ width:20, height:20, borderRadius:6, border:`1.5px solid ${selected?T.gn:"rgba(255,255,255,.2)"}`, background:selected?T.gn:"rgba(255,255,255,.04)", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
          {selected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:12 }}>
        <div style={{ width:44, height:44, borderRadius:11, background:`linear-gradient(135deg,${c.color}22,${c.color}40)`, border:`1px solid ${c.color}28`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{c.artwork}</div>
        <div style={{ flex:1, minWidth:0, paddingRight:22 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
            <span style={{ fontWeight:700, fontSize:13.5, color:T.w, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</span>
            {c.verified && <VerifiedMark size={13} />}
          </div>
          <div style={{ display:"flex", gap:4 }}><SpotifyBadge /></div>
        </div>
      </div>
      <div style={{ fontSize:11.5, color:T.g100, marginBottom:11 }}>{c.sub}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, padding:"10px 0", borderTop:`1px solid ${T.b0}`, borderBottom:`1px solid ${T.b0}`, marginBottom:10 }}>
        {[{l:"Response",v:`${c.responseRate}%`,g:c.responseRate>=90},{l:"Replies in",v:c.avgTime},{l:"Approved",v:c.approved>=1000?`${(c.approved/1000).toFixed(1)}K`:String(c.approved)}].map(s => (
          <div key={s.l} style={{ textAlign:"center" }}>
            <div className="mono" style={{ fontSize:12, fontWeight:500, color:s.g?T.gn:T.w, marginBottom:2 }}>{s.v}</div>
            <div style={{ fontSize:9.5, color:T.g300 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
        <div style={{ fontSize:11.5, color:T.g300 }}>{c.followers} followers</div>
        <div style={{ textAlign:"right" }}>
          <CreditPill n={c.credits} />
          <div style={{ fontSize:9, fontWeight:800, color:"rgba(127,255,0,.5)", letterSpacing:".04em", marginTop:1 }}>CREDITS</div>
        </div>
      </div>
    </div>
  );
}

/* ── CampaignBar ── */
export function CampaignBar({ selected, onClear, onContinue }) {
  if (!selected.length) return null;
  const total = selected.reduce((a, c) => a + c.credits, 0);
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:300, padding:"10px 16px 16px", background:"linear-gradient(180deg,transparent,rgba(5,5,6,.98) 30%)" }}>
      <div style={{ maxWidth:640, margin:"0 auto", background:"linear-gradient(135deg,rgba(12,12,16,.98),rgba(9,9,12,.98))", backdropFilter:"blur(24px)", border:"1px solid rgba(255,255,255,.14)", borderRadius:18, padding:"13px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 -4px 40px rgba(0,0,0,.6),0 0 0 1px rgba(127,255,0,.08)", animation:"barRise .3s cubic-bezier(.34,1.56,.64,1) both" }}>
        <div style={{ display:"flex", flexDirection:"row-reverse", flexShrink:0 }}>
          {selected.slice(0,5).map((c, i) => (
            <div key={c.id} style={{ width:28, height:28, borderRadius:"50%", background:`${c.color}22`, border:"2px solid rgba(9,9,12,.98)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, color:c.color, marginLeft:i>0?-7:0, position:"relative", zIndex:5-i }}>{c.avatar}</div>
          ))}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:1 }}>{selected.length} curator{selected.length>1?"s":""} selected</div>
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span className="mono" style={{ fontSize:13, color:T.gn }}>{total}</span>
            <span style={{ fontSize:11, color:T.g300, fontWeight:600 }}>credits total</span>
          </div>
        </div>
        <button className="bt" onClick={onClear} style={{ padding:"7px 11px", borderRadius:8, border:"1px solid rgba(255,255,255,.08)", background:"rgba(255,255,255,.04)", fontSize:12.5, flexShrink:0 }}>Clear</button>
        <button className="bp" onClick={onContinue} style={{ padding:"11px 22px", fontSize:14, borderRadius:11 }}>Next <span className="arr">→</span></button>
      </div>
    </div>
  );
}

/* ── BuyCreditsModal ── */
export function BuyCreditsModal({ onClose, onBuy, currentCredits, needed, userId, invite }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [validating, setValidating] = useState(false)
  const [disc, setDisc] = useState(null)
  const [discErr, setDiscErr] = useState('')

  const applyCode = async (subtotalUsd) => {
    setDiscErr('')
    setDisc(null)
    const c = code.trim()
    if (!c) return
    setValidating(true)
    try {
      const { validateDiscountCode } = await import('../../lib/stripe.js')
      const res = await validateDiscountCode({ code: c, userId, subtotalUsd })
      if (!res?.ok) setDiscErr(res?.error || 'Invalid code')
      else setDisc(res)
    } catch (e) {
      setDiscErr(e?.message || 'Code validation failed')
    } finally {
      setValidating(false)
    }
  }

  const buy = async (pack) => {
    try {
      const { isStripeConfigured, getStripe, createCheckoutSession } = await import('../../lib/stripe.js')
      if (!isStripeConfigured()) {
        toast.error(
          isDev ? 'Add VITE_STRIPE_PUBLISHABLE_KEY to your root .env.' : 'Stripe is not configured (add VITE_STRIPE_PUBLISHABLE_KEY in Netlify and redeploy).',
          'Stripe not configured',
        )
        return
      }
      if (!userId) {
        toast.error('Sign in to purchase credits.', 'Billing')
        return
      }
      const session = await createCheckoutSession({
        credits: pack.credits,
        priceUsd: pack.price,
        userId,
        packId: pack.id,
        discountCode: code.trim() || null,
        invite: invite || null,
      })
      const stripe = await getStripe()
      if (!stripe || !session?.sessionId) {
        toast.error(
          isDev ? 'Could not start checkout. Is the backend running on PORT 3333?' : 'Could not start checkout. Confirm your API is live and VITE_API_ORIGIN matches it.',
          'Stripe',
        )
        return
      }
      await stripe.redirectToCheckout({ sessionId: session.sessionId })
    } catch (e) {
      toast.error(e?.message || 'Checkout failed', 'Billing')
    }
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", backdropFilter:"blur(14px)", zIndex:600, display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fadeIn .2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b1}`, borderRadius:22, maxWidth:420, width:"100%", padding:"28px 22px", animation:"scaleIn .25s cubic-bezier(.34,1.56,.64,1)" }}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>💳</div>
          <h2 style={{ fontSize:19, fontWeight:800, marginBottom:6 }}>Top up credits</h2>
          {needed && <p style={{ fontSize:13.5, color:T.g200 }}>Have <strong style={{ color:T.gn }}>{currentCredits}cr</strong> · Need <strong style={{ color:T.w }}>{needed}cr</strong></p>}
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value); setDisc(null); setDiscErr('') }}
            placeholder="Promo code (optional)"
            style={{ flex:1, background:'rgba(255,255,255,.06)', border:`1px solid ${T.b0}`, borderRadius:11, padding:'11px 12px', color:T.w, outline:'none' }}
          />
          <button className="bt" disabled={validating || !code.trim()}
            onClick={() => applyCode(null)}
            style={{ padding:'10px 12px', opacity: (validating || !code.trim()) ? 0.6 : 1 }}>
            {validating ? 'Checking…' : 'Apply'}
          </button>
        </div>
        {discErr && <div style={{ marginBottom:12, fontSize:12.5, color:T.red, fontWeight:700 }}>⚠ {discErr}</div>}
        {disc?.ok && (
          <div style={{ marginBottom:12, fontSize:12.5, color:T.gn, fontWeight:800 }}>
            ✓ Code applied {disc?.amountOffUsd != null ? `(−$${Number(disc.amountOffUsd).toFixed(2)})` : ''}
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
          {CREDIT_PACKS.map(p => (
            <div key={p.id} onClick={() => buy(p)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px", background:p.bestValue?T.gnGl:"rgba(255,255,255,.03)", border:`1px solid ${p.bestValue?T.gnB:T.b0}`, borderRadius:11, cursor:"pointer" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{p.credits} Credits {p.bestValue&&<span className="chip cg" style={{ fontSize:9.5, padding:"1px 7px", marginLeft:5 }}>BEST</span>}{p.popular&&!p.bestValue&&<span className="chip co" style={{ fontSize:9.5, padding:"1px 7px", marginLeft:5 }}>POP</span>}</div>
                <div style={{ fontSize:12, color:T.g300 }}>${p.perCredit.toFixed(2)}/credit</div>
              </div>
              <div className="mono" style={{ fontSize:20, color:p.bestValue?T.gn:T.w }}>${p.price}</div>
            </div>
          ))}
        </div>
        <button className="bt" onClick={onClose} style={{ width:"100%", textAlign:"center", justifyContent:"center", marginTop:14, fontSize:13 }}>Cancel</button>
      </div>
    </div>
  );
}

/* ── SuccessScreen ── */
export function SuccessScreen({ song, selected, total, onReset }) {
  return (
    <div style={{ maxWidth:500, margin:"0 auto", textAlign:"center", padding:"60px 20px 40px" }}>
      <div style={{ width:80, height:80, borderRadius:"50%", background:"rgba(127,255,0,.12)", border:"2px solid rgba(127,255,0,.38)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px", animation:"successBounce .55s cubic-bezier(.34,1.56,.64,1) both" }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M8 18l7 7 13-14" stroke="#7fff00" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h2 style={{ fontSize:26, fontWeight:900, letterSpacing:"-.02em", marginBottom:8 }}>Campaign Launched! 🚀</h2>
      <p style={{ color:T.g200, fontSize:15, lineHeight:1.7, marginBottom:6 }}><strong style={{ color:T.w }}>{song.title}</strong> submitted to <strong style={{ color:T.gn }}>{selected.length} curators</strong>.</p>
      <p style={{ color:T.g300, fontSize:14, marginBottom:28 }}><span className="mono" style={{ color:T.gn }}>{total}</span> credits spent · Responses arrive within 18–72 hours.</p>
      <div style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${T.b0}`, borderRadius:14, padding:"14px 16px", marginBottom:22, textAlign:"left" }}>
        <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:10 }}>Submitted to</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {selected.map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"rgba(255,255,255,.04)", border:`1px solid ${T.b0}`, borderRadius:8 }}>
              <span style={{ fontSize:13 }}>{c.artwork}</span>
              <span style={{ fontSize:12.5, fontWeight:600 }}>{c.name}</span>
              <CreditPill n={c.credits} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
        <button className="bp" onClick={onReset} style={{ padding:"12px 24px", fontSize:14 }}>Submit Another</button>
      </div>
    </div>
  );
}

/* ── ReviewPage ── */
export function ReviewPage({
  song,
  selected,
  wallet,
  onBack,
  onSubmit,
  pitchText,
  setPitchText,
  moodTags,
  setMoodTags,
  addCredits,
  userId,
  invite,
}) {
  const [submitted, setSubmitted] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [moodInput, setMoodInput] = useState('');
  const total = selected.reduce((a, c) => a + c.credits, 0);
  const canAfford = wallet >= total;

  if (submitted) return <SuccessScreen song={song} selected={selected} total={total} onReset={() => setSubmitted(false)} />;

  return (
    <div style={{ flex:1, overflow:"auto", padding:"20px 16px 100px" }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <button className="bt" onClick={onBack} style={{ marginBottom:20 }}>← Back to Curators</button>
        <div style={{ fontSize:11, fontWeight:700, color:T.gn, letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>Step 2 of 2 · Playlist Push</div>
        <h2 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Review Playlist Push</h2>
        <p style={{ color:T.g200, fontSize:13.5, marginBottom:22 }}>Submitting <strong style={{ color:T.w }}>{song.title}</strong> to {selected.length} curator{selected.length>1?"s":""}.</p>
        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:14, padding:"14px 16px", marginBottom:18, display:"flex", alignItems:"center", gap:13 }}>
          <SongArt song={song} size={54} r={11} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{song.title}</div>
            {song.artist && <div style={{ fontSize:12.5, color:T.g200, marginBottom:4 }}>{song.artist}</div>}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              <SpotifyBadge />
              {song.genre && <span className="chip cb" style={{ fontSize:10.5, padding:"2px 8px" }}>{song.genre}</span>}
              {song.duration && <span style={{ fontSize:11, color:T.g300 }}>{formatDuration(song.duration)}</span>}
              {song.albumName && <span style={{ fontSize:11, color:T.g300 }}>{song.albumName}</span>}
            </div>
            {(song.previewUrl || song.spotifyUrl) && (
              <div style={{ marginTop:8 }}>
                <SpotifyMiniPlayer previewUrl={song.previewUrl} spotifyUrl={song.spotifyUrl} />
              </div>
            )}
            {song.spotifyUrl && (
              <div style={{ marginTop:8 }}>
                <a href={song.spotifyUrl} target="_blank" rel="noreferrer" style={{ fontSize:11.5, color:"#1ed760", textDecoration:'none', fontWeight:700 }}>
                  Open on Spotify ↗
                </a>
              </div>
            )}
          </div>
          <button className="bt" onClick={onBack} style={{ fontSize:12, flexShrink:0 }}>Change →</button>
        </div>
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:10 }}>Curators ({selected.length})</div>
          <div style={{ display:"flex", flexDirection:"column", gap:7, maxHeight:200, overflow:"auto" }}>
            {selected.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 13px", background:"rgba(255,255,255,.03)", border:`1px solid ${T.b0}`, borderRadius:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:`${c.color}20`, border:`1px solid ${c.color}25`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{c.artwork}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{c.name}</div>
                  <div style={{ fontSize:11.5, color:T.g300 }}>{c.genre} · {c.avgTime} · {c.responseRate}%</div>
                </div>
                <CreditPill n={c.credits} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ background:'rgba(255,255,255,.02)', border:`1px solid ${T.b0}`, borderRadius:14, padding:'15px 18px', marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:900, color:T.g400, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:12 }}>
            Pitch + Mood Tags
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12.5, fontWeight:800, color:T.w, marginBottom:8 }}>Mood / tags</div>
            <div className="scroll-x" style={{ display:'flex', gap:6, marginBottom:10 }}>
              {MOOD_OPTIONS.map(m => {
                const on = moodTags?.includes(m)
                return (
                  <button
                    key={m}
                    onClick={() => setMoodTags(p => (p.includes(m) ? p.filter(x => x !== m) : [...p, m].slice(0, 8)))}
                    className={`chip ${on ? 'csel' : 'cb'}`}
                    style={{ flexShrink:0 }}
                    type="button"
                  >
                    {m}
                  </button>
                )
              })}
            </div>

            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input
                value={moodInput}
                onChange={e => setMoodInput(e.target.value)}
                placeholder="Add a custom tag…"
                style={{
                  flex: '1 1 220px',
                  minWidth: 180,
                  background:'linear-gradient(145deg,#101013,#0d0d10)',
                  border:`1px solid ${T.b1}`,
                  borderRadius:10,
                  padding:'10px 13px',
                  color:T.w,
                  fontSize:13.5,
                  outline:'none',
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const v = moodInput.trim()
                  if (!v) return
                  setMoodTags(p => (p.includes(v) ? p : [...p, v].slice(0, 8)))
                  setMoodInput('')
                }}
              />
              <button
                className="bs"
                onClick={() => {
                  const v = moodInput.trim()
                  if (!v) return
                  setMoodTags(p => (p.includes(v) ? p : [...p, v].slice(0, 8)))
                  setMoodInput('')
                }}
                type="button"
                style={{ padding:'10px 14px', fontSize:13.5, fontWeight:800 }}
              >
                Add
              </button>
            </div>

            {moodTags?.length > 0 && (
              <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                {moodTags.map((t, idx) => (
                  <button
                    key={`${t}-${idx}`}
                    type="button"
                    className="chip cb"
                    onClick={() => setMoodTags(p => p.filter(x => x !== t))}
                    style={{ fontSize:11, padding:'2px 8px' }}
                  >
                    {t} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12.5, fontWeight:800, color:T.w, marginBottom:8 }}>Artist pitch</div>
            <textarea
              value={pitchText}
              onChange={(e) => setPitchText(e.target.value)}
              placeholder="Write a short pitch (2–3 sentences)…"
              rows={4}
              style={{
                width:'100%',
                background:'rgba(255,255,255,.04)',
                border:`1px solid ${T.b1}`,
                borderRadius:12,
                padding:'12px 13px',
                color:T.w,
                fontSize:13.5,
                outline:'none',
                resize:'vertical',
                lineHeight:1.6,
                fontFamily:'inherit',
              }}
            />
          </div>

          <AssistantPanel
            compact={true}
            cardTitle="AI Assistant"
            cardSubtitle="Rewrite pitch + improve submission copy"
            context={{
              songTitle: song?.title,
              artistName: song?.artist,
              playlistGenre: song?.genre,
              moodHint: moodTags?.join(', '),
              curators: selected.map(c => c.name),
              campaignType: 'Playlist Push',
            }}
            initialText={pitchText}
            onApply={(text) => setPitchText(text)}
            applyLabel="Apply to Pitch"
          />
        </div>
        <div style={{ background:canAfford?T.gnGl3:"rgba(255,64,96,.04)", border:`1px solid ${canAfford?"rgba(127,255,0,.2)":"rgba(255,64,96,.2)"}`, borderRadius:14, padding:"15px 18px", marginBottom:20 }}>
          {[{l:"Your wallet",v:<CreditPill n={wallet}/>},{l:"Campaign cost",v:<span className="mono" style={{ color:T.w }}>−{total}cr</span>}].map((r, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <span style={{ fontSize:13.5, color:T.g200 }}>{r.l}</span>{r.v}
            </div>
          ))}
          <div style={{ height:1, background:"rgba(255,255,255,.06)", marginBottom:12 }} />
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Remaining</span>
            <span className="mono" style={{ fontSize:22, fontWeight:500, color:canAfford?T.gn:T.red }}>{wallet-total}<span style={{ fontSize:10, marginLeft:3, fontWeight:800, color:canAfford?"rgba(127,255,0,.55)":"rgba(255,64,96,.6)" }}>CR</span></span>
          </div>
          {!canAfford && (
            <div style={{ marginTop:12, padding:"10px 13px", background:"rgba(255,64,96,.07)", border:"1px solid rgba(255,64,96,.18)", borderRadius:9, fontSize:13, color:T.red }}>
              ⚠ You need {total-wallet} more credits. <button onClick={() => setShowBuy(true)} style={{ background:"none", border:"none", color:T.red, textDecoration:"underline", cursor:"pointer", fontSize:13, fontWeight:700 }}>Buy now →</button>
            </div>
          )}
        </div>
        {canAfford ? (
          <button className="bp" onClick={() => { onSubmit(total); setSubmitted(true); }} style={{ width:"100%", padding:"14px 0", fontSize:16, borderRadius:12 }}>
            🚀 Submit Campaign — {total} Credits
          </button>
        ) : (
          <button className="bp" onClick={() => setShowBuy(true)} style={{ width:"100%", padding:"14px 0", fontSize:16, borderRadius:12, background:"linear-gradient(135deg,#ff6b35,#ff4060)" }}>
            Buy Credits & Continue →
          </button>
        )}
      </div>
      {showBuy && (
        <BuyCreditsModal
          onClose={() => setShowBuy(false)}
          onBuy={async (p) => {
            try {
              if (typeof addCredits === 'function') {
                await addCredits(p.credits, 'purchase', null)
              }
              setShowBuy(false)
            } catch {
              setShowBuy(false)
            }
          }}
          currentCredits={wallet}
          needed={total}
          userId={userId}
          invite={invite}
        />
      )}
    </div>
  );
}

/* ── SubmissionBuilder ── */
const PLAYLIST_CAMPAIGN = { id:"playlist", icon:"🎵", label:"Playlist Push", desc:"Get added to curated Spotify playlists", color:"#7fff00" };
/** Default “no max price” cap — slider at this value does not count as an active filter. */
const MAX_CREDITS_SLIDER_CAP = 50;

export function SubmissionBuilder({ song, campaigns = [], onBack, wallet, setWallet, onComplete, addCredits, userId, invite }) {
  const toast = useToast()
  const [selected,    setSelected]    = useState([]);
  const [showReview,  setShowReview]  = useState(false);
  const [filterG,     setFilterG]     = useState([]);
  const [filterTags,  setFilterTags]  = useState([]);
  const [maxCr,       setMaxCr]       = useState(MAX_CREDITS_SLIDER_CAP);
  const [minResp,     setMinResp]     = useState(0);
  const [minFollowers,setMinFollowers]= useState(0);
  const [verifiedOnly,setVerifiedOnly]= useState(false);
  const [sort,        setSort]        = useState("bestfit");
  const [search,      setSearch]      = useState("");
  const [showFilter,  setShowFilter]  = useState(false);

  // Artist submission copy (used for AI refinement + demo storage)
  const [pitchText, setPitchText] = useState('');
  const [moodTags,  setMoodTags]  = useState([]);

  const toggle = useCallback(c => setSelected(p => p.find(x => x.id===c.id) ? p.filter(x => x.id!==c.id) : [...p,c]), []);
  const resetFilters = () => { setFilterG([]); setFilterTags([]); setMaxCr(MAX_CREDITS_SLIDER_CAP); setMinResp(0); setMinFollowers(0); setVerifiedOnly(false); setSearch(""); };

  // No seeded curator inventory. Live inventory must come from backend.
  const liveCurators = []
  const filtered = useMemo(() => liveCurators.filter(c => {
    if (filterG.length && !filterG.includes(c.genre)) return false;
    if (c.credits > maxCr) return false;
    if (c.responseRate < minResp) return false;
    if (filterTags.length && !filterTags.every(x => c.tags.includes(x))) return false;
    if (verifiedOnly && !c.verified) return false;
    if (c.followersN < minFollowers * 1000) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sort==="bestfit")    return (b.responseRate * 0.5 + (1/b.credits)*30 + (b.verified?10:0)) - (a.responseRate * 0.5 + (1/a.credits)*30 + (a.verified?10:0));
    if (sort==="response")   return b.responseRate - a.responseRate;
    if (sort==="time")       return a.avgTimeH - b.avgTimeH;
    if (sort==="credits_lo") return a.credits - b.credits;
    if (sort==="approved")   return b.approved - a.approved;
    if (sort==="reach")      return b.followersN - a.followersN;
    return 0;
  }), [liveCurators, filterG, filterTags, maxCr, minResp, minFollowers, verifiedOnly, sort, search]);

  const activeFilterCount = filterG.length + filterTags.length + (maxCr < MAX_CREDITS_SLIDER_CAP ? 1 : 0) + (minResp>0?1:0) + (minFollowers>0?1:0) + (verifiedOnly?1:0);

  // Step 2: Review
  if (showReview) return (
    <ReviewPage song={song} selected={selected} wallet={wallet}
      pitchText={pitchText}
      setPitchText={setPitchText}
      moodTags={moodTags}
      setMoodTags={setMoodTags}
      addCredits={addCredits}
      userId={userId}
      invite={invite}
      onBack={() => setShowReview(false)}
      onSubmit={cost => {
        if (hasBlockingActiveCampaignForSong(song, campaigns)) {
          toast.error('This song already has an active submission.', 'Already submitted')
          return
        }
        setWallet(w => w - cost);
        onComplete(song, selected, PLAYLIST_CAMPAIGN, { pitchText, moodTags });
      }} />
  );

  // Step 1: Curator picker
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", minHeight:0 }}>
      {/* Toolbar */}
      <div style={{ background:"rgba(5,5,6,.97)", backdropFilter:"blur(18px)", borderBottom:"1px solid rgba(255,255,255,.05)", padding:"10px 16px", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:11, flexWrap:"wrap" }}>
          <button className="bt" onClick={onBack}>← Back to Songs</button>
          <SongArt song={song} size={34} r={8} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>{song.title}</div>
            <div style={{ fontSize:11.5, color:T.g300 }}>{song.artist || PLAYLIST_CAMPAIGN.label}</div>
          </div>
          {/* Step progress */}
          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:T.g400 }}>
            <span style={{ color:T.gn, fontWeight:700 }}>Step 1</span><span>/</span><span>2</span>
          </div>
          {selected.length > 0 && (
            <button type="button" className="bp" disabled={hasBlockingActiveCampaignForSong(song, campaigns)} onClick={() => setShowReview(true)} style={{ padding:"9px 18px", fontSize:13.5, borderRadius:10, opacity: hasBlockingActiveCampaignForSong(song, campaigns) ? 0.45 : 1 }}>
              Review ({selected.length}) <span className="arr">→</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:"14px 16px 160px" }}>
        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:14, padding:"14px 16px", marginBottom:14, display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <SongArt song={song} size={58} r={12} />
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:11, fontWeight:800, color:T.gn, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:5 }}>Playlist Push</div>
            <div style={{ fontWeight:800, fontSize:16, color:T.w, marginBottom:4 }}>{song.title}</div>
            <div style={{ fontSize:13, color:T.g200, marginBottom:8 }}>{song.artist}</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
              <SpotifyBadge />
              {song.genre && <span className="chip cb" style={{ fontSize:10.5, padding:'2px 8px' }}>{song.genre}</span>}
              {song.spotifyUrl && <a href={song.spotifyUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#1ed760', fontWeight:700, textDecoration:'none' }}>Spotify ↗</a>}
            </div>
          </div>
        </div>
        {/* Search + Sort row */}
        <div style={{ display:"flex", gap:8, marginBottom:11, flexWrap:"wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search curators…"
            style={{ flex:1, minWidth:150, background:T.card, border:`1px solid ${T.b0}`, color:T.w, padding:"9px 13px", borderRadius:10, fontSize:13.5 }}
            onFocus={e => e.target.style.borderColor="rgba(127,255,0,.35)"} onBlur={e => e.target.style.borderColor=T.b0} />
          <button onClick={() => setShowFilter(f => !f)} className="bs" style={{ padding:"9px 14px", fontSize:13, position:"relative" }}>
            ⚙ Filters {activeFilterCount > 0 && <span style={{ position:"absolute", top:-5, right:-5, width:16, height:16, borderRadius:"50%", background:T.gn, color:"#000", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{activeFilterCount}</span>}
          </button>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ background:T.card, border:`1px solid ${T.b0}`, color:T.w, padding:"9px 12px", borderRadius:10, fontSize:13, cursor:"pointer" }}>
            <option value="bestfit"    style={{background:T.bg}}>⭐ Best Fit</option>
            <option value="response"   style={{background:T.bg}}>📈 Response Rate</option>
            <option value="time"       style={{background:T.bg}}>⚡ Fastest Reply</option>
            <option value="credits_lo" style={{background:T.bg}}>💰 Lowest Price</option>
            <option value="approved"   style={{background:T.bg}}>✓ Most Approved</option>
            <option value="reach"      style={{background:T.bg}}>👥 Highest Reach</option>
          </select>
        </div>

        {/* Expanded filter panel */}
        {showFilter && (
          <div style={{ background:T.bg1, border:`1px solid ${T.b0}`, borderRadius:14, padding:"18px 20px", marginBottom:14, animation:"fadeUp .22s ease both" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontWeight:700, fontSize:13 }}>Filters</span>
              <button className="bt" onClick={resetFilters} style={{ fontSize:12, color:T.red }}>Reset all</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:20 }}>
              {/* Genre */}
              <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9 }}>Genre</div>
                {GENRES.filter(g => g!=="All").map(g => (
                  <label key={g} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7, cursor:"pointer" }}>
                    <input type="checkbox" checked={filterG.includes(g)} onChange={() => setFilterG(p => p.includes(g)?p.filter(x=>x!==g):[...p,g])} />
                    <span style={{ fontSize:13, color:filterG.includes(g)?T.w:T.g200 }}>{g}</span>
                  </label>
                ))}
              </div>
              {/* Sliders */}
              <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9 }}>Response Rate</div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ fontSize:12, color:T.g300 }}>Minimum</span><span className="mono" style={{ fontSize:12, color:T.gn }}>{minResp}%</span></div>
                <input type="range" min={0} max={95} step={5} value={minResp} onChange={e => setMinResp(+e.target.value)} />
                <div style={{ marginTop:18, fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9 }}>Max Price</div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ fontSize:12, color:T.g300 }}>Credits</span><span className="mono" style={{ fontSize:12, color:T.gn }}>{maxCr >= MAX_CREDITS_SLIDER_CAP ? 'Any' : `${maxCr}cr max`}</span></div>
                <input type="range" min={1} max={MAX_CREDITS_SLIDER_CAP} step={1} value={maxCr} onChange={e => setMaxCr(+e.target.value)} />
                <div style={{ marginTop:18, fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9 }}>Min Followers</div>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ fontSize:12, color:T.g300 }}>Thousands</span><span className="mono" style={{ fontSize:12, color:T.gn }}>{minFollowers > 0 ? `${minFollowers}K` : "Any"}</span></div>
                <input type="range" min={0} max={500} step={50} value={minFollowers} onChange={e => setMinFollowers(+e.target.value)} />
              </div>
              {/* Toggles + Tags */}
              <div>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9 }}>Options</div>
                <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, cursor:"pointer" }}>
                  <span style={{ fontSize:13, color:T.g200 }}>Verified Only</span>
                  <input type="checkbox" checked={verifiedOnly} onChange={() => setVerifiedOnly(v=>!v)} />
                </label>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:9, marginTop:16 }}>Tags</div>
                {ALL_TAGS.map(t => (
                  <label key={t} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7, cursor:"pointer" }}>
                    <input type="checkbox" checked={filterTags.includes(t)} onChange={() => setFilterTags(p => p.includes(t)?p.filter(x=>x!==t):[...p,t])} />
                    <span style={{ fontSize:13, color:filterTags.includes(t)?T.w:T.g200 }}>{t}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Genre chips */}
        <div className="scroll-x" style={{ display:"flex", gap:6, marginBottom:12 }}>
          {["All",...GENRES.filter(g=>g!=="All")].map(g => (
            <button key={g} type="button" className={`chip ${g==="All" ? "cb" : filterG.includes(g) ? "csel" : "cb"}`}
              onClick={() => g==="All" ? setFilterG([]) : setFilterG(p => p.includes(g)?p.filter(x=>x!==g):[...p,g])} style={{ flexShrink:0 }}>{g}</button>
          ))}
          {verifiedOnly && <span className="chip cg" style={{ flexShrink:0 }}>✓ Verified</span>}
        </div>

        <div style={{ fontSize:12, color:T.g300, marginBottom:12 }}>{filtered.length} curators {activeFilterCount>0&&`· ${activeFilterCount} filter${activeFilterCount>1?"s":""} active`}</div>

        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"50px 20px", color:T.g300 }}>
            <div style={{ fontSize:34, marginBottom:11 }}>🎯</div>
            <div style={{ fontWeight:600, fontSize:14.5, marginBottom:6 }}>
              No curators match
            </div>
            <div style={{ fontSize:12.5, color:T.g400, marginBottom:10 }}>
              Try widening your filters or reset to browse the full list.
            </div>
            <button className="bt" onClick={resetFilters}>Reset all filters</button>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
            {filtered.map(c => <CuratorGridCard key={c.id} c={c} selected={!!selected.find(x => x.id===c.id)} onToggle={toggle} />)}
          </div>
        )}
      </div>
      <CampaignBar selected={selected} onClear={() => setSelected([])} onContinue={() => setShowReview(true)} />
    </div>
  );
}

/* ── ArtistSubmissionsPage ── */
export function ArtistSubmissionsPage({ onSubmitAgain, campaigns = [], loading = false, error = '' }) {
  const [expanded, setExpanded] = useState({});
  const [autoAddByCampaign, setAutoAddByCampaign] = useState({})
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const loadAutoAdds = async (campaignId) => {
    if (isDemo || !supabase || !campaignId) return
    if (autoAddByCampaign[campaignId]) return
    const { data } = await supabase
      .from('spotify_auto_add_attempts')
      .select('id, curator_id, playlist_id, spotify_playlist_id, spotify_track_id, status, reason, created_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50)
    setAutoAddByCampaign((p) => ({ ...p, [campaignId]: data || [] }))
  }
  if (loading) {
    return (
      <div>
        <div style={{ marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Campaign History</h1>
          <p style={{ color:T.g200, fontSize:13 }}>Loading your submissions…</p>
        </div>
        <div style={{ textAlign:"center", padding:"56px 24px", border:`1px dashed ${T.b1}`, borderRadius:16, color:T.g300 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Fetching campaigns</div>
          <div style={{ fontSize:13 }}>This can take a moment on first load.</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div style={{ marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Campaign History</h1>
          <p style={{ color:T.g200, fontSize:13 }}>We couldn’t load your campaigns.</p>
        </div>
        <div style={{ textAlign:"center", padding:"56px 24px", border:`1px dashed ${T.b1}`, borderRadius:16, color:T.g300 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⚠</div>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:6 }}>Error loading submissions</div>
          <div style={{ fontSize:13, color:T.g400, maxWidth:520, margin:"0 auto" }}>{error}</div>
        </div>
      </div>
    )
  }

  if (!campaigns.length) {
    return (
      <div>
        <div style={{ marginBottom:22 }}>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Campaign History</h1>
          <p style={{ color:T.g200, fontSize:13 }}>All your Playlist Push campaigns will appear here.</p>
        </div>
        <div style={{ textAlign:"center", padding:"56px 24px", border:`1px dashed ${T.b1}`, borderRadius:16, color:T.g300 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>No campaigns yet</div>
          <div style={{ fontSize:13 }}>Add a song and submit your first Playlist Push to start tracking results.</div>
        </div>
      </div>
    )
  }
  const all = campaigns;
  const totalSpend = campaigns.reduce((a,d) => a + (d.total_credits || 0), 0);
  const allSubs = campaigns.flatMap(c => (Array.isArray(c.submissions) ? c.submissions : []))
  const countBy = (st) => allSubs.filter(s => (s.status || 'new') === st).length

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Campaign History</h1>
        <p style={{ color:T.g200, fontSize:13 }}>All your curator submissions, tracked in one place</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:10, marginBottom:24 }}>
        {[
          {l:"Total Sent",  v:all.length,                                           ic:"📤"},
          {l:"Accepted",    v:countBy("accepted") + countBy("completed"), g:true,   ic:"✓"},
          {l:"Pending",     v:countBy("new") + countBy("pending"),  y:true,   ic:"⏳"},
          {l:"Declined",    v:countBy("declined"), r:true,   ic:"✗"},
          {l:"Credits Spent",v:totalSpend,                                           ic:"💳"},
        ].map(s => (
          <div key={s.l} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${s.g?"rgba(127,255,0,.2)":s.y?"rgba(255,199,64,.14)":s.o?"rgba(249,115,22,.14)":s.r?"rgba(255,64,96,.14)":T.b0}`, borderRadius:12, padding:"13px 15px" }}>
            <div style={{ fontSize:18, marginBottom:6 }}>{s.ic}</div>
            <div className="mono" style={{ fontSize:22, color:s.g?T.gn:s.y?T.gold:s.o?'#fb923c':s.r?T.red:T.w, marginBottom:2 }}>{s.v}</div>
            <div style={{ fontSize:11, color:T.g300 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {campaigns.map(entry => {
          const isOpen = expanded[entry.id];
          const spend = entry.total_credits || 0;
          const songTitle = entry.songs?.title || entry.song || 'Untitled'
          const artistName = entry.songs?.artist_name || entry.artist || 'Artist'
          const submittedAt = entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : (entry.submitted || 'Recent campaign')
          const subs = Array.isArray(entry.submissions) ? entry.submissions : []
          const curatorNames = subs.map(s => s.curator_profiles?.display_name).filter(Boolean)
          return (
            <div key={entry.id} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:16, overflow:"hidden", transition:"border-color .2s" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=T.b1} onMouseLeave={e=>e.currentTarget.style.borderColor=T.b0}>
              <div style={{ padding:"16px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  <SongArt song={{ title: songTitle, artist: artistName, artworkUrl: entry.songs?.artwork_url, artwork_url: entry.songs?.artwork_url, bg:'#050506', ac:T.gn }} size={54} r={11} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, flexWrap:"wrap" }}>
                      <span style={{ fontWeight:700, fontSize:15, color:T.w }}>{songTitle}</span>
                      <SpotifyBadge />
                    </div>
                    <div style={{ fontSize:12, color:T.g300 }}>{artistName} · {submittedAt}</div>
                    <div style={{ fontSize:11.5, color:T.g400, marginTop:2 }}>
                      <span className="mono" style={{ color:T.gn }}>{spend}cr</span> spent · {subs.length} curator{subs.length!==1?'s':''}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:14 }}>
                    <StatusBadge status={(entry.status || 'pending')} />
                  </div>
                  <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                    <button className="bp" onClick={() => onSubmitAgain({ songId: entry.song_id || entry.songId || entry.songs?.id, song: songTitle, artist: artistName, bg:'#050506', ac:T.gn })} style={{ padding:"9px 16px", fontSize:13, borderRadius:9 }}>Submit Again <span className="arr">→</span></button>
                    <button className="bs" onClick={() => { toggleExpand(entry.id); if (!isOpen) void loadAutoAdds(entry.id) }} style={{ padding:"9px 12px", fontSize:13, borderRadius:9 }}>{isOpen?"↑":"↓"}</button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop:`1px solid ${T.b0}`, padding:"12px 18px 16px", animation:"fadeUp .22s ease both" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:10 }}>Campaign Details</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 13px", background:"rgba(255,255,255,.03)", border:`1px solid ${T.b0}`, borderRadius:10, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:120 }}>
                        <div style={{ fontWeight:600, fontSize:13.5, color:T.w, marginBottom:2 }}>Playlist Push</div>
                        <div style={{ fontSize:11.5, color:T.g300 }}>{curatorNames.join(', ') || 'No curators yet'}</div>
                      </div>
                      <TypeBadge type="free" />
                      <StatusBadge status={entry.status || 'pending'} small />
                      <CreditPill n={entry.total_credits || 0} />
                    </div>
                    {subs.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:6 }}>
                        {subs.map(s => (
                          <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 13px', background:'rgba(255,255,255,.03)', border:`1px solid ${T.b0}`, borderRadius:10, flexWrap:'wrap' }}>
                            <div style={{ minWidth: 180 }}>
                              <div style={{ fontWeight:800, fontSize:13, color:T.w }}>
                                {s.curator_profiles?.display_name || 'Curator'}
                              </div>
                              <div style={{ fontSize:11.5, color:T.g400 }}>
                                <span className="mono" style={{ color:T.gn }}>{s.credits}cr</span> · {(s.created_at || '').toString().slice(0,10)}
                              </div>
                            </div>
                            <StatusBadge status={s.status || 'pending'} small />
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize:10, fontWeight:800, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:8 }}>Auto-add to curator playlists</div>
                      {(autoAddByCampaign[entry.id]?.length ?? 0) === 0 ? (
                        <div style={{ fontSize: 12.5, color: T.g400, lineHeight: 1.55 }}>
                          No auto-add activity logged yet. (Curators must connect Spotify and enable auto-add on their playlists.)
                        </div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {autoAddByCampaign[entry.id].slice(0, 12).map((a) => (
                            <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 13px', background:'rgba(255,255,255,.03)', border:`1px solid ${T.b0}`, borderRadius:10, flexWrap:'wrap' }}>
                              <div style={{ minWidth: 200 }}>
                                <div style={{ fontWeight:800, fontSize:12.5, color:T.w }}>
                                  {String(a.status || 'queued').toUpperCase()}
                                </div>
                                <div style={{ fontSize:11.5, color:T.g400 }}>
                                  {a.reason ? a.reason : (a.status === 'success' ? 'Added to playlist.' : '')}
                                </div>
                              </div>
                              <div style={{ fontSize:11.5, color:T.g400 }}>
                                {(a.created_at || '').toString().slice(0, 19).replace('T', ' ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── BillingSection ── */
export function BillingSection({ wallet, setWallet }) {
  const [showBuy, setShowBuy] = useState(false);
  const [subBusy, setSubBusy] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')

  useEffect(() => {
    if (isDemo || !user?.id || !supabase) return
    let cancelled = false
    const run = async () => {
      setOrdersLoading(true)
      setOrdersError('')
      try {
        const { data, error } = await supabase
          .from('playlist_push_orders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10)
        if (error) throw error
        if (!cancelled) setOrders(data || [])
      } catch (e) {
        if (!cancelled) setOrdersError(e?.message || 'Failed to load billing history')
      } finally {
        if (!cancelled) setOrdersLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [user?.id])

  const startSubscriptionCheckout = async () => {
    if (!user?.id) {
      toast.error('Sign in to start a subscription.', 'Billing')
      return
    }
    setSubBusy(true)
    try {
      const m = await import('../../lib/stripe.js')
      if (!m.isStripeConfigured()) {
        toast.error(
          isDev ? 'Add VITE_STRIPE_PUBLISHABLE_KEY to your .env.' : 'Stripe is not configured (add VITE_STRIPE_PUBLISHABLE_KEY in Netlify and redeploy).',
          'Stripe',
        )
        return
      }
      const out = await m.createSubscriptionCheckoutSession({ userId: user.id })
      const stripe = await m.getStripe()
      if (!stripe || !out?.sessionId) {
        toast.error(
          out?.error || (isDev ? 'Could not start checkout. Is the backend running?' : 'Could not start checkout. Confirm the API is live and billing env vars are set on Render.'),
          'Billing',
        )
        return
      }
      await stripe.redirectToCheckout({ sessionId: out.sessionId })
    } catch (e) {
      toast.error(e?.message || 'Subscription checkout failed', 'Billing')
    } finally {
      setSubBusy(false)
    }
  }

  const planRows = [
    { label: 'Playlist Push campaigns', free: `${FREE_WEEKLY_SUBMISSION_CAP} / week (Free)`, paid: `${PRO_WEEKLY_SUBMISSION_CAP} / week (Pro)` },
    { label: 'Buy extra credits', free: 'Yes (pay-as-you-go)', paid: 'Yes + member perks' },
    { label: 'Curator marketplace', free: 'Full access', paid: 'Full access' },
    { label: 'Support', free: 'Standard', paid: 'Priority' },
  ]

  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:4 }}>Pricing</h1>
      <p style={{ fontSize:13, color:T.g300, marginBottom:18, lineHeight:1.55, maxWidth:640 }}>
        Credit packs for campaigns and an optional Pro subscription — same checkout, same wallet.
      </p>

      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:10 }}>
          Plans & subscriptions
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12, marginBottom:14 }}>
          <div style={{ background:"rgba(255,255,255,.03)", border:`1px solid ${T.b0}`, borderRadius:16, padding:"16px 16px", textAlign:"center" }}>
            <div style={{ fontSize:10.5, fontWeight:800, color:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6 }}>Free</div>
            <div style={{ fontSize:22, fontWeight:900, color:T.w, marginBottom:4 }}>$0</div>
            <div style={{ fontSize:12.5, color:T.g200, lineHeight:1.55, marginBottom:12 }}>
              Start with weekly free submissions and purchase credits when you need more reach.
            </div>
            <div style={{ fontSize:11.5, color:T.g400 }}>No card required to browse and save tracks.</div>
          </div>
          <div style={{ background:T.gnGl, border:`1px solid ${T.gnB}`, borderRadius:16, padding:"16px 16px 14px", textAlign:"center" }}>
            <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"center", gap:"6px 10px", marginBottom:8 }}>
              <div style={{ fontSize:10.5, fontWeight:800, color:T.gn, letterSpacing:".08em", textTransform:"uppercase" }}>StreamEngine Pro</div>
              <span
                style={{
                  fontSize:7,
                  fontWeight:900,
                  letterSpacing:".08em",
                  textTransform:"uppercase",
                  padding:"2px 6px",
                  borderRadius:999,
                  background:"rgba(127,255,0,.18)",
                  color:T.gn,
                  border:`1px solid ${T.gnB}`,
                  lineHeight:1.25,
                }}
              >
                7-day trial
              </span>
            </div>
            <div style={{ fontSize:22, fontWeight:900, color:T.w, marginBottom:4 }}>Upgrade</div>
            <div style={{ fontSize:12.5, color:T.g200, lineHeight:1.55, marginBottom:14 }}>
              Paid subscription after trial. {PRO_WEEKLY_SUBMISSION_CAP} weekly campaigns and priority support.
            </div>
            <button type="button" className="bp" disabled={subBusy} onClick={startSubscriptionCheckout}
              style={{ width:"100%", padding:"11px 14px", fontSize:13, borderRadius:11, opacity: subBusy ? 0.75 : 1 }}>
              {subBusy ? "Starting checkout…" : "Start 7-day free trial →"}
            </button>
            <div style={{ fontSize:10.5, color:T.g400, marginTop:10, lineHeight:1.45 }}>
              Server needs <span className="mono">STRIPE_SUBSCRIPTION_PRICE_ID</span>. Credit packs below are separate one-time purchases.
            </div>
          </div>
        </div>
        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0, fontSize:11.5, fontWeight:800, color:T.g300, textTransform:"uppercase", letterSpacing:".06em", borderBottom:`1px solid ${T.b0}`, padding:"10px 14px", textAlign:"center" }}>
            <span>Benefit</span>
            <span>Free</span>
            <span>Pro</span>
          </div>
          {planRows.map((row) => (
            <div key={row.label} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0, padding:"10px 14px", borderBottom:`1px solid ${T.b0}`, fontSize:13, color:T.g100, alignItems:"center", textAlign:"center" }}>
              <span style={{ color:T.w, fontWeight:600, textAlign:"center" }}>{row.label}</span>
              <span>{row.free}</span>
              <span style={{ color:T.gn, fontWeight:700 }}>{row.paid}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:T.gnGl, border:`1px solid ${T.gnB}`, borderRadius:16, padding:"20px 18px", marginBottom:22, display:"flex", alignItems:"center", justifyContent:"center", flexWrap:"wrap", gap:14, textAlign:"center" }}>
        <div>
          <div style={{ fontSize:10.5, fontWeight:800, color:"rgba(127,255,0,.65)", letterSpacing:".08em", textTransform:"uppercase", marginBottom:6 }}>Current Balance</div>
          <CreditPill n={wallet} large />
          <div style={{ fontSize:12.5, color:T.g300, marginTop:6 }}>Credits never expire</div>
        </div>
        <button className="bp" onClick={() => setShowBuy(true)} style={{ padding:"11px 22px", fontSize:14 }}>Buy Credits →</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:12, marginBottom:22 }}>
        {CREDIT_PACKS.map(p => (
          <div key={p.id} onClick={() => setShowBuy(true)} style={{ background:p.bestValue?T.gnGl:"rgba(255,255,255,.03)", border:`1px solid ${p.bestValue?T.gnB:T.b0}`, borderRadius:14, padding:"18px 16px", cursor:"pointer", position:"relative", transition:"all .2s" }}>
            {p.bestValue && <div style={{ position:"absolute", top:-10, left:14, background:T.gn, color:"#000", fontSize:9.5, fontWeight:800, padding:"3px 10px", borderRadius:18 }}>★ BEST</div>}
            <div style={{ fontSize:10.5, fontWeight:700, color:p.bestValue?T.gn:T.g300, letterSpacing:".08em", textTransform:"uppercase", marginBottom:8 }}>{p.label}</div>
            <div className="mono" style={{ fontSize:28, color:T.w, marginBottom:3 }}>${p.price}</div>
            <div style={{ fontSize:12.5, color:T.g300, marginBottom:12 }}>{p.credits} credits</div>
            <button className={p.bestValue?"bp":"bs"} style={{ width:"100%", padding:"9px 0", fontSize:12.5, borderRadius:9 }}>Buy {p.credits} Credits</button>
          </div>
        ))}
      </div>

      <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:16, padding:"16px 18px", marginBottom:22 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.g300, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10 }}>
          Order history
        </div>
        {isDemo ? (
          <div style={{ fontSize:13, color:T.g300, lineHeight:1.6 }}>
            Order history loads from your account after Supabase is configured and you complete a purchase.
          </div>
        ) : (
          <>
        {ordersLoading && <div style={{ fontSize:13, color:T.g300 }}>Loading…</div>}
        {ordersError && <div style={{ fontSize:13, color:T.red, fontWeight:700 }}>⚠ {ordersError}</div>}
        {!ordersLoading && !ordersError && orders.length === 0 && (
          <div style={{ fontSize:13, color:T.g300, lineHeight:1.6 }}>No purchases yet.</div>
        )}
        {orders.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {orders.map(o => (
              <div key={o.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 12px', borderRadius:12, border:`1px solid ${T.b0}`, background:'rgba(255,255,255,.03)' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:13, color:T.w }}>
                    {o.status || 'created'} · {o.currency ? o.currency.toUpperCase() : 'USD'}
                  </div>
                  <div style={{ fontSize:11.5, color:T.g300 }}>
                    {(o.created_at || '').slice(0, 10)} · session {o.stripe_session_id ? String(o.stripe_session_id).slice(0, 10) + '…' : '—'}
                  </div>
                </div>
                <div className="mono" style={{ fontWeight:800, color:T.gn }}>
                  {o.amount_total != null ? `$${(Number(o.amount_total) / 100).toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>

      {showBuy && (
        <BuyCreditsModal
          onClose={() => setShowBuy(false)}
          onBuy={p => { setWallet(w => w+p.credits); setShowBuy(false); }}
          currentCredits={wallet}
          userId={user?.id || null}
          invite={getPendingSubmission()?.invite || null}
        />
      )}
    </div>
  );
}
