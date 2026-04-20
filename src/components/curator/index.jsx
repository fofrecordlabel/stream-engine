import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../tokens.js'
import { SpotifyBadge, StatusBadge, TypeBadge, VerifiedMark, SpotifyMiniPlayer } from '../common/Atoms.jsx'
import { GENRES } from '../../data/index.js'
import { fetchSpotifyPlaylist, fetchPlaylistAPI, insertTrackToPlaylist, fetchUserPlaylists, trackUri, isSpotifyPlaylistUrl, extractPlaylistId, formatDuration } from '../../lib/spotify.js'
import { isSpotifyConnected, getSpotifyAccessToken, startSpotifyAuth, clearSpotifyToken, fetchSpotifyProfile, hasSpotifyClientId, SPOTIFY_TOKEN_UPDATED_EVENT, SPOTIFY_TOKEN_CLEARED_EVENT } from '../../lib/spotifyAuth.js'

/* ── shared helpers ── */
const lbl = (text) => ({
  fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".07em",
  textTransform:"uppercase", display:"block", marginBottom:6,
});
const inp = (focus="#7fff00") => ({
  width:"100%", background:"rgba(255,255,255,.05)", border:`1px solid ${T.b1}`,
  borderRadius:10, padding:"10px 13px", fontSize:13.5, color:T.w, outline:"none", transition:"border-color .15s",
});
const card = (extra={}) => ({
  background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`,
  borderRadius:14, transition:"border-color .2s", ...extra,
});

function SongThumb({ item }) {
  const [imgErr, setImgErr] = useState(false);
  const art = item.artworkUrl || item.artwork_url;
  const ac  = item.ac || "#7fff00";
  const bg  = item.bg || "#050506";
  if (art && !imgErr) {
    return (
      <div style={{ width:48, height:48, borderRadius:11, flexShrink:0, overflow:"hidden" }}>
        <img src={art} alt="" onError={() => setImgErr(true)} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
      </div>
    );
  }
  return (
    <div style={{ width:48, height:48, borderRadius:11, background:`linear-gradient(135deg,${bg},${ac}28)`, border:`1px solid ${ac}28`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:ac, flexShrink:0, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle at 30% 30%,${ac}18,transparent 65%)` }} />
      <span style={{ position:"relative" }}>{(item.songTitle||"SE").slice(0,2).toUpperCase()}</span>
    </div>
  );
}

function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width:40, height:22, borderRadius:11, background:on?T.gn:"rgba(255,255,255,.1)", cursor:"pointer", position:"relative", transition:"all .2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:3, left:on?20:3, width:16, height:16, borderRadius:"50%", background:on?"#000":"rgba(255,255,255,.6)", transition:"left .2s" }} />
    </div>
  );
}

/* ── AcceptAssignModal ── */
// insertionStatus: null | "inserting" | { ok: true, snapshotId } | { ok: false, error }
export function AcceptAssignModal({ submission, playlists, onAccept, onClose }) {
  const [chosen,          setChosen]          = useState(null);
  const [inserting,       setInserting]        = useState(false);
  const [insertionResult, setInsertionResult]  = useState(null); // { ok, msg }

  const chosenPlaylist = chosen ? playlists.find(p => p.id === chosen) : null;

  const handleConfirm = async () => {
    if (!chosenPlaylist) {
      // Accept without insertion
      onAccept(submission, null);
      return;
    }

    // Try Spotify insertion if track has a spotifyUrl and curator is connected
    const spotifyUrl = submission.spotifyUrl || submission.spotifyTrackUrl;
    const uri        = trackUri(spotifyUrl || "");

    if (uri && isSpotifyConnected()) {
      setInserting(true);
      setInsertionResult(null);
      try {
        const accessToken = await getSpotifyAccessToken();
        if (accessToken && chosenPlaylist.id) {
          const result = await insertTrackToPlaylist(chosenPlaylist.id, uri, accessToken, 0);
          if (result.error) {
            setInsertionResult({ ok: false, msg: `Couldn't insert into Spotify: ${result.error}` });
          } else {
            setInsertionResult({ ok: true, msg: `✓ Added to "${chosenPlaylist.name}" on Spotify` });
          }
        } else {
          setInsertionResult({ ok: false, msg: "Spotify session expired — reconnect in Profile" });
        }
      } catch (e) {
        setInsertionResult({ ok: false, msg: `Insert error: ${e.message}` });
      } finally {
        setInserting(false);
      }
    }

    // Always call onAccept regardless of insertion result
    onAccept(submission, chosenPlaylist);
  };

  const modal = (
    <div onClick={inserting ? undefined : onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", backdropFilter:"blur(14px)", zIndex:900, display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fadeIn .2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b1}`, borderRadius:22, maxWidth:440, width:"100%", padding:"28px 22px", animation:"scaleIn .25s cubic-bezier(.34,1.56,.64,1)" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ width:52, height:52, borderRadius:"50%", background:T.gnGl, border:`1px solid ${T.gnB}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
            {submission.artworkUrl
              ? <img src={submission.artworkUrl} alt="" style={{ width:52, height:52, borderRadius:"50%", objectFit:"cover" }} />
              : <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l4.5 4.5 9.5-9" stroke={T.gn} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            }
          </div>
          <h2 style={{ fontSize:18, fontWeight:800, marginBottom:5 }}>Accept Track</h2>
          <p style={{ fontSize:13.5, color:T.g200 }}><strong style={{ color:T.w }}>{submission.songTitle}</strong> by {submission.artist}</p>
          <p style={{ fontSize:12, color:T.gn, marginTop:6, fontWeight:600 }}>+${submission.payout?.toFixed(2) || "—"} to your earnings</p>
        </div>

        {/* Insertion result banner */}
        {insertionResult && (
          <div style={{ padding:"10px 13px", borderRadius:9, marginBottom:14,
                        background: insertionResult.ok ? "rgba(30,215,96,.08)" : "rgba(255,64,96,.08)",
                        border: `1px solid ${insertionResult.ok ? "rgba(30,215,96,.25)" : "rgba(255,64,96,.2)"}`,
                        fontSize:13, color: insertionResult.ok ? "#1ed760" : T.red }}>
            {insertionResult.msg}
          </div>
        )}

        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10.5, fontWeight:700, color:T.g300, letterSpacing:".07em", textTransform:"uppercase", marginBottom:11 }}>
            Add to Spotify playlist
            {isSpotifyConnected() && <span style={{ color:"#1DB954", marginLeft:6, fontWeight:600, textTransform:"none" }}>· Auto-insert enabled</span>}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {playlists.map(pl => (
              <div key={pl.id} onClick={() => setChosen(chosen===pl.id?null:pl.id)}
                style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 14px", background:chosen===pl.id?"rgba(127,255,0,.08)":"rgba(255,255,255,.03)", border:`1px solid ${chosen===pl.id?"rgba(127,255,0,.28)":T.b0}`, borderRadius:10, cursor:"pointer", transition:"all .15s" }}>
                {pl.artworkUrl
                  ? <img src={pl.artworkUrl} alt="" style={{ width:34, height:34, borderRadius:7, objectFit:"cover", flexShrink:0 }} />
                  : <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${chosen===pl.id?T.gn:"rgba(255,255,255,.2)"}`, background:chosen===pl.id?T.gn:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {chosen===pl.id && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                }
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13.5, fontWeight:600 }}>{pl.name}</div>
                  {pl.genre && <div style={{ fontSize:11, color:T.g300, marginTop:1 }}>{pl.genre} · {pl.followers || "—"} followers</div>}
                </div>
                {chosen===pl.id && pl.artworkUrl && (
                  <div style={{ width:18, height:18, borderRadius:"50%", background:T.gn, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
              </div>
            ))}
            <div onClick={() => setChosen(null)} style={{ display:"flex", alignItems:"center", gap:11, padding:"11px 14px", background:!chosen?"rgba(127,255,0,.05)":"rgba(255,255,255,.02)", border:`1px solid ${!chosen?"rgba(127,255,0,.2)":T.b0}`, borderRadius:10, cursor:"pointer" }}>
              <div style={{ width:18, height:18, borderRadius:5, border:`1.5px solid ${!chosen?T.gn:"rgba(255,255,255,.2)"}`, background:!chosen?T.gn:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {!chosen && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ fontSize:13.5, color:T.g200 }}>Accept without playlist assignment</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="bs" onClick={onClose} disabled={inserting} style={{ flex:1, padding:"12px 0", fontSize:14 }}>Cancel</button>
          <button className="bp" onClick={handleConfirm} disabled={inserting} style={{ flex:2, padding:"12px 0", fontSize:14 }}>
            {inserting
              ? <span style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation:"spin .7s linear infinite" }}><circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.3)" strokeWidth="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#000" strokeWidth="3" strokeLinecap="round"/></svg>
                  Adding to Spotify…
                </span>
              : "Confirm Accept →"
            }
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

/* ── RequestChangesModal ── */
export function RequestChangesModal({ submission, onRequest, onClose }) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    const trimmed = feedback.trim();
    if (!trimmed) return
    setSubmitting(true)
    try {
      await onRequest(submission, trimmed)
    } finally {
      setSubmitting(false)
    }
  };

  const modal = (
    <div onClick={submitting ? undefined : onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", backdropFilter:"blur(14px)", zIndex:920, display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fadeIn .2s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b1}`, borderRadius:22, maxWidth:480, width:"100%", padding:"28px 22px", animation:"scaleIn .25s cubic-bezier(.34,1.56,.64,1)" }}>
        <div style={{ textAlign:"center", marginBottom:18 }}>
          <div style={{ width:52, height:52, borderRadius:"50%", background:T.gold ? `rgba(249,115,22,.12)` : "rgba(249,115,22,.12)", border:`1px solid rgba(249,115,22,.25)`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
            ↻
          </div>
          <h2 style={{ fontSize:18, fontWeight:800, marginBottom:5 }}>Request Changes</h2>
          <p style={{ fontSize:13.5, color:T.g200 }}>
            For <strong style={{ color:T.w }}>{submission.songTitle}</strong> · {submission.artist}
          </p>
        </div>

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:900, color:T.g400, letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>
            What should the artist fix?
          </div>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            rows={5}
            placeholder="Be specific: tighten the hook, clarify genre/mood, mention release timing, etc."
            style={{
              width:"100%",
              background:"rgba(255,255,255,.03)",
              border:`1px solid rgba(249,115,22,.25)`,
              borderRadius:12,
              padding:"12px 13px",
              color:T.w,
              fontSize:13.5,
              outline:"none",
              resize:"vertical",
              lineHeight:1.6,
              fontFamily:"inherit",
            }}
          />
          <div style={{ fontSize:12, color:T.g300, marginTop:8 }}>
            {Math.min(600, feedback.length)}/600
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button className="bs" onClick={onClose} disabled={submitting} style={{ flex:1, padding:"12px 0", fontSize:14 }}>
            Cancel
          </button>
          <button
            className="bp"
            onClick={confirm}
            disabled={submitting || !feedback.trim()}
            style={{ flex:2, padding:"12px 0", fontSize:14, opacity: !feedback.trim() ? 0.7 : 1 }}
          >
            {submitting ? 'Saving…' : 'Request Changes →'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body);
}

/* ── CuratorInboxSection ── */
const TABS = [
  { k:"new",       l:"New",       dot:"#38bdf8" },
  { k:"pending",   l:"Pending",   dot:"#ffc740" },
  { k:"changes_requested", l:"Changes", dot:"#fb923c" },
  { k:"accepted",  l:"Accepted",  dot:T.gn      },
  { k:"completed", l:"Completed", dot:"#10b981" },
  { k:"declined",  l:"Declined",  dot:"#ff4060" },
];

export function CuratorInboxSection() {
  const [submissions] = useState([]);
  const [tab,         setTab]         = useState("new");
  const [acceptModal, setAcceptModal] = useState(null);
  const [changesModal, setChangesModal] = useState(null);
  const [expanded,    setExpanded]    = useState(null);

  const myPlaylists = [
    { id:"pl1", name:"Hip-Hop Essentials", genre:"Hip-Hop",    followers:"8.2K" },
    { id:"pl2", name:"Late Night Vibes",   genre:"R&B",        followers:"4.1K" },
    { id:"pl3", name:"Friday Bangers",     genre:"Pop",        followers:"12K"  },
  ];

  const updateStatus = (id, status, playlist = null, notes = null) =>
    setSubmissions(p => p.map(s => {
      if (s.id !== id) return s
      return {
        ...s,
        status,
        ...(playlist ? { playlist: playlist.name } : {}),
        ...(notes ? { notes } : {}),
      }
    }));

  const counts = Object.fromEntries(TABS.map(t => [t.k, submissions.filter(s=>s.status===t.k).length]));
  const filtered = submissions.filter(s => s.status === tab);
  const totalEarnings = submissions.filter(s=>s.status==="completed").reduce((a,s)=>a+s.payout,0);
  const pendingEarnings = submissions.filter(s=>s.status==="accepted").reduce((a,s)=>a+s.payout,0);

  if (submissions.length === 0) {
    return (
      <div style={{ ...card({ padding: 18 }), textAlign:'center' }}>
        <div style={{ fontSize:34, marginBottom:10 }}>📥</div>
        <div style={{ fontWeight:900, fontSize:15, marginBottom:6 }}>No submissions yet</div>
        <div style={{ fontSize:13, color:T.g300, lineHeight:1.6 }}>
          Your inbox will populate once your curator account is approved and artists submit to your playlists.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:3 }}>Submission Inbox</h1>
          <p style={{ color:T.g200, fontSize:13 }}>{counts.new + counts.pending} waiting for review</p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ padding:"9px 14px", background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#10b981", textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Completed</div>
            <div className="mono" style={{ fontSize:16, color:"#10b981" }}>${totalEarnings.toFixed(2)}</div>
          </div>
          <div style={{ padding:"9px 14px", background:"rgba(255,199,64,.08)", border:"1px solid rgba(255,199,64,.2)", borderRadius:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.gold, textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Pending Payout</div>
            <div className="mono" style={{ fontSize:16, color:T.gold }}>${pendingEarnings.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, marginBottom:20, overflowX:"auto", paddingBottom:2 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:9, fontWeight:700, fontSize:12.5, cursor:"pointer", border:"none", background:tab===t.k?"rgba(255,255,255,.09)":"transparent", color:tab===t.k?T.w:T.g300, transition:"all .15s", whiteSpace:"nowrap", flexShrink:0 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:t.dot, flexShrink:0, opacity:tab===t.k?1:.4 }} />
            {t.l}
            {counts[t.k] > 0 && (
              <span style={{ minWidth:18, height:18, borderRadius:9, background:tab===t.k?t.dot:"rgba(255,255,255,.1)", color:tab===t.k?"#000":T.g200, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 5px" }}>{counts[t.k]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"48px 20px", border:`1px dashed ${T.b1}`, borderRadius:14, color:T.g300 }}>
            <div style={{ fontSize:32, marginBottom:10 }}>✓</div>
            <div style={{ fontWeight:600, fontSize:14 }}>Nothing here</div>
            <div style={{ fontSize:12.5, marginTop:4 }}>Check another tab or come back later</div>
          </div>
        )}
        {filtered.map(sub => {
          const isOpen = expanded === sub.id;
          return (
            <div key={sub.id} style={{ ...card({ overflow:"hidden" }) }}
              onMouseEnter={e => { if(!isOpen) e.currentTarget.style.borderColor=T.b1; }}
              onMouseLeave={e => { if(!isOpen) e.currentTarget.style.borderColor=T.b0; }}>

              {/* Main row */}
              <div style={{ padding:"15px 17px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", cursor:"pointer" }}
                onClick={() => setExpanded(isOpen ? null : sub.id)}>
                <SongThumb item={sub} />
                <div style={{ flex:1, minWidth:120 }}>
                  <div style={{ fontWeight:700, fontSize:14.5, marginBottom:2 }}>{sub.songTitle}</div>
                  <div style={{ fontSize:12.5, color:T.g200, marginBottom:5 }}>{sub.artist}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <span className="chip cb" style={{ fontSize:10, padding:"2px 8px" }}>{sub.genre}</span>
                    <TypeBadge type={sub.type} />
                    {sub.playlist && <span style={{ fontSize:11, color:T.gn, fontWeight:600 }}>✦ {sub.playlist}</span>}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                  <div className="mono" style={{ fontSize:15, fontWeight:700, color:T.gn }}>${sub.payout.toFixed(2)}</div>
                  <div style={{ fontSize:11, color:T.g400 }}>Due {sub.dueDate}</div>
                  <div style={{ fontSize:11, color:T.g400 }}>{sub.date}</div>
                </div>

                {/* Actions */}
                <div style={{ display:"flex", gap:7, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  {(sub.status === "new" || sub.status === "pending") && <>
                    <button onClick={() => setAcceptModal(sub)}
                      style={{ padding:"8px 14px", background:"rgba(127,255,0,.1)", border:"1px solid rgba(127,255,0,.28)", borderRadius:9, color:T.gn, fontWeight:700, fontSize:12.5, cursor:"pointer", whiteSpace:"nowrap" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,255,0,.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(127,255,0,.1)"}>
                      ✓ Accept
                    </button>
                    <button onClick={() => setChangesModal(sub)}
                      style={{ padding:"8px 12px", background:"rgba(249,115,22,.08)", border:"1px solid rgba(249,115,22,.25)", borderRadius:9, color:"#fb923c", fontWeight:700, fontSize:12.5, cursor:"pointer", whiteSpace:"nowrap" }}>
                      ↻ Request changes
                    </button>
                    <button onClick={() => updateStatus(sub.id,"declined")}
                      style={{ padding:"8px 10px", background:"rgba(255,64,96,.08)", border:"1px solid rgba(255,64,96,.22)", borderRadius:9, color:T.red, fontWeight:700, fontSize:12.5, cursor:"pointer" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,64,96,.18)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,64,96,.08)"}>
                      ✗
                    </button>
                  </>}
                  {sub.status === "accepted" && (
                    <button onClick={() => updateStatus(sub.id,"completed")}
                      style={{ padding:"8px 14px", background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.3)", borderRadius:9, color:"#10b981", fontWeight:700, fontSize:12.5, cursor:"pointer", whiteSpace:"nowrap" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(16,185,129,.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(16,185,129,.1)"}>
                      ✓ Complete
                    </button>
                  )}
                  {(sub.status === "completed" || sub.status === "declined" || sub.status === "changes_requested") && (
                    <StatusBadge
                      status={sub.status === "completed" ? "accepted" : sub.status}
                      small
                    />
                  )}
                </div>
              </div>

              {/* Expanded notes */}
              {isOpen && (sub.notes || sub.spotifyUrl || sub.previewUrl) && (
                <div style={{ padding:"12px 17px 15px", borderTop:`1px solid ${T.b0}`, background:"rgba(255,255,255,.02)" }}>
                  {sub.notes && <>
                    <div style={{ fontSize:10.5, fontWeight:700, color:T.g400, letterSpacing:".07em", textTransform:"uppercase", marginBottom:6 }}>Artist Note</div>
                    <p style={{ fontSize:13, color:T.g100, lineHeight:1.6, marginBottom:12 }}>{sub.notes}</p>
                  </>}
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    {(sub.previewUrl || sub.spotifyUrl) && (
                      <SpotifyMiniPlayer previewUrl={sub.previewUrl} spotifyUrl={sub.spotifyUrl} size="small" />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {acceptModal && (
        <AcceptAssignModal
          submission={acceptModal}
          playlists={myPlaylists}
          onAccept={(sub, playlist) => { updateStatus(sub.id, "accepted", playlist); setAcceptModal(null); }}
          onClose={() => setAcceptModal(null)}
        />
      )}
      {changesModal && (
        <RequestChangesModal
          submission={changesModal}
          onRequest={(sub, feedback) => { updateStatus(sub.id, "changes_requested", null, feedback); setChangesModal(null); }}
          onClose={() => setChangesModal(null)}
        />
      )}
    </div>
  );
}

/* ── Gate system ── */
const GATE_TYPE_OPTS = [
  { type:"follow_playlist",  label:"Follow Playlist",      icon:"🎵", color:"#1ed760" },
  { type:"follow_artist",    label:"Follow Artist",         icon:"🎤", color:"#7fff00" },
  { type:"follow_instagram", label:"Follow on Instagram",   icon:"📸", color:"#e040fb" },
  { type:"visit_website",    label:"Visit Website",         icon:"🌐", color:"#38bdf8" },
  { type:"join_mailing",     label:"Join Mailing List",     icon:"📧", color:"#ffc740" },
  { type:"custom",           label:"Custom Task",           icon:"✏️", color:"#a78bfa" },
];

const blankGate = () => ({
  id: `gate-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
  type:"follow_playlist", title:"", link:"", instructions:"", enabled:true,
});

function GateBuilder({ gates, onChange }) {
  const addGate = () => onChange([...gates, blankGate()]);
  const removeGate = (id) => onChange(gates.filter(g => g.id !== id));
  const updateGate = (id, key, val) => onChange(gates.map(g => g.id===id ? {...g, [key]:val} : g));

  const inpS = { width:"100%", background:"rgba(255,255,255,.05)", border:`1px solid ${T.b1}`,
                 borderRadius:8, padding:"8px 11px", fontSize:12.5, color:T.w, outline:"none",
                 transition:"border .15s", fontFamily:"inherit" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:T.g200 }}>Submission Gates</div>
          <div style={{ fontSize:11, color:T.g400, marginTop:2 }}>Artists must complete these before submitting</div>
        </div>
        <button type="button" onClick={addGate}
          style={{ padding:"6px 12px", borderRadius:8, background:T.gnGl, border:`1px solid ${T.gnB}`,
                   color:T.gn, fontSize:12, fontWeight:700, cursor:"pointer" }}>
          + Add Gate
        </button>
      </div>

      {gates.length === 0 && (
        <div style={{ padding:"16px 14px", border:`1px dashed ${T.b1}`, borderRadius:10,
                      textAlign:"center", color:T.g400, fontSize:12 }}>
          No gates — artists can submit without any prerequisites
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {gates.map((gate, idx) => {
          const meta = GATE_TYPE_OPTS.find(g => g.type === gate.type) || GATE_TYPE_OPTS[0];
          return (
            <div key={gate.id}
              style={{ padding:"13px 14px", background:`${meta.color}07`,
                       border:`1px solid ${gate.enabled ? `${meta.color}25` : T.b0}`,
                       borderRadius:11, opacity: gate.enabled ? 1 : .5, transition:"all .15s" }}>
              {/* Gate header row */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:11 }}>
                {/* Type select */}
                <div style={{ width:32, height:32, borderRadius:8, background:`${meta.color}15`,
                              border:`1px solid ${meta.color}30`, display:"flex", alignItems:"center",
                              justifyContent:"center", fontSize:16, flexShrink:0 }}>
                  {meta.icon}
                </div>
                <select value={gate.type} onChange={e => updateGate(gate.id, "type", e.target.value)}
                  style={{ flex:1, background:"rgba(255,255,255,.06)", border:`1px solid ${T.b1}`,
                           borderRadius:8, padding:"7px 10px", fontSize:12.5, color:T.w,
                           cursor:"pointer", outline:"none", fontFamily:"inherit" }}>
                  {GATE_TYPE_OPTS.map(o => (
                    <option key={o.type} value={o.type} style={{ background:T.bg }}>{o.label}</option>
                  ))}
                </select>
                {/* Enable/disable toggle */}
                <Toggle on={gate.enabled} onToggle={() => updateGate(gate.id, "enabled", !gate.enabled)} />
                {/* Remove */}
                <button type="button" onClick={() => removeGate(gate.id)}
                  style={{ width:26, height:26, borderRadius:7, background:"rgba(255,64,96,.08)",
                           border:"1px solid rgba(255,64,96,.2)", color:T.red, fontSize:13,
                           cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  ×
                </button>
              </div>
              {/* Gate fields */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <input value={gate.title} onChange={e => updateGate(gate.id, "title", e.target.value)}
                    placeholder={`Title, e.g. "${meta.label} before submitting"`}
                    style={inpS}
                    onFocus={e=>e.target.style.borderColor=meta.color}
                    onBlur={e=>e.target.style.borderColor=T.b1} />
                </div>
                <div>
                  <input value={gate.link} onChange={e => updateGate(gate.id, "link", e.target.value)}
                    placeholder="https://…"
                    style={inpS}
                    onFocus={e=>e.target.style.borderColor=meta.color}
                    onBlur={e=>e.target.style.borderColor=T.b1} />
                </div>
                <div>
                  <input value={gate.instructions} onChange={e => updateGate(gate.id, "instructions", e.target.value)}
                    placeholder="Short instruction for artists"
                    style={inpS}
                    onFocus={e=>e.target.style.borderColor=meta.color}
                    onBlur={e=>e.target.style.borderColor=T.b1} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── CuratorPlaylistsSection ── */
const TURNAROUND = ["24h","48h","72h","5 days","7 days"];
const PLATFORMS  = ["Spotify","Apple Music","TikTok","Instagram","YouTube"];

const BLANK_FORM = {
  name:"", url:"", genre:"Hip-Hop", followers:"", artworkUrl:"",
  credits:2, platform:"Spotify", turnaround:"48h", rules:"", gates:[],
};

export function CuratorPlaylistsSection() {
  const [playlists, setPlaylists] = useState([
    { id:"pl1", name:"Hip-Hop Essentials", url:"https://open.spotify.com/playlist/1", genre:"Hip-Hop",  followers:"8.2K", active:true,  credits:2, platform:"Spotify", turnaround:"48h", rules:"Hip-hop and trap only. Must have 1K+ monthly listeners.", gates:[{ id:"g1", type:"follow_playlist", title:"Follow Hip-Hop Essentials", link:"https://open.spotify.com/playlist/1", instructions:"Required before submitting", enabled:true }] },
    { id:"pl2", name:"Late Night Vibes",   url:"https://open.spotify.com/playlist/2", genre:"R&B",      followers:"4.1K", active:true,  credits:2, platform:"Spotify", turnaround:"24h", rules:"R&B, soul, neo-soul. No explicit lyrics.", gates:[] },
    { id:"pl3", name:"Friday Bangers",     url:"https://open.spotify.com/playlist/3", genre:"Pop",      followers:"12K",  active:false, credits:3, platform:"Spotify", turnaround:"72h", rules:"Feel-good pop only. Upbeat BPM.", gates:[] },
  ]);
  const [adding,      setAdding]      = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState({ ...BLANK_FORM });
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlMsg,      setUrlMsg]      = useState(null);

  const setF = (k, v) => setForm(p => ({...p, [k]:v}));
  const toggleActive = id => setPlaylists(p => p.map(x => x.id===id ? {...x,active:!x.active} : x));

  /* Optional Spotify auto-fill when URL is pasted */
  const handlePlaylistUrl = async (url) => {
    setF("url", url);
    setUrlMsg(null);
    if (!isSpotifyPlaylistUrl(url)) return;
    setUrlFetching(true);
    try {
      const accessToken = await getSpotifyAccessToken();
      let meta = null;
      if (accessToken) {
        const id = extractPlaylistId(url);
        if (id) meta = await fetchPlaylistAPI(id, accessToken);
      }
      if (!meta) meta = await fetchSpotifyPlaylist(url);
      if (meta) {
        setForm(p => ({
          ...p, url,
          name:       p.name       || meta.name       || "",
          artworkUrl: p.artworkUrl || meta.artworkUrl || "",
          followers:  p.followers  || (meta.followers != null
            ? (meta.followers >= 1000 ? `${(meta.followers/1000).toFixed(1)}K` : String(meta.followers))
            : ""),
        }));
        setUrlMsg({ type:"ok", text:`✓ Auto-filled from Spotify` });
      } else {
        setUrlMsg({ type:"info", text:"Couldn't fetch — fill in manually below" });
      }
    } catch {
      setUrlMsg({ type:"info", text:"Import failed — fill in manually" });
    } finally {
      setUrlFetching(false);
    }
  };

  const savePlaylist = () => {
    if (!form.name.trim()) return;
    if (editing) {
      setPlaylists(p => p.map(x => x.id===editing ? {...form, id:editing} : x));
      setEditing(null);
    } else {
      setPlaylists(p => [...p, {...form, id:`pl${Date.now()}`, active:true}]);
    }
    setForm({ ...BLANK_FORM });
    setUrlMsg(null);
    setAdding(false);
  };

  const startEdit = (pl) => {
    setForm({...BLANK_FORM, ...pl, gates: pl.gates || []});
    setEditing(pl.id);
    setAdding(true);
  };

  const deletePlaylist = (id) => setPlaylists(p => p.filter(x => x.id !== id));

  const inpS = { ...inp(), marginBottom:0 };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:3 }}>Playlist Inventory</h1>
          <p style={{ color:T.g200, fontSize:13 }}>{playlists.filter(p=>p.active).length} active · {playlists.length} total</p>
        </div>
        <button className="bp"
          onClick={() => { setEditing(null); setForm({...BLANK_FORM}); setUrlMsg(null); setAdding(a=>!a); }}
          style={{ padding:"9px 18px", fontSize:13 }}>
          {adding && !editing ? "✕ Cancel" : "+ Add Playlist"}
        </button>
      </div>

      {/* Form */}
      {adding && (
        <div style={{ ...card({ padding:"22px 20px", marginBottom:20, border:`1px solid ${T.gnB}`, animation:"fadeUp .22s ease both" }) }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:T.gn, letterSpacing:".06em", textTransform:"uppercase", marginBottom:20 }}>
            {editing ? "Edit Playlist" : "New Playlist"}
          </div>

          {/* ── Artwork preview ── */}
          {form.artworkUrl && (
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 13px",
                          background:"rgba(30,215,96,.05)", border:"1px solid rgba(30,215,96,.15)",
                          borderRadius:10, marginBottom:18 }}>
              <img src={form.artworkUrl} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:"cover" }} />
              <div>
                <div style={{ fontWeight:700, fontSize:13.5 }}>{form.name}</div>
                {form.followers && <div style={{ fontSize:12, color:T.g300, marginTop:2 }}>{form.followers} followers</div>}
                <div style={{ fontSize:11, color:"#1DB954", fontWeight:600 }}>✓ Auto-filled from Spotify</div>
              </div>
            </div>
          )}

          {/* ── Required: Playlist Name ── */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl("Playlist Name *")}>Playlist Name <span style={{ color:"#ff4060" }}>*</span></label>
            <input style={inpS} value={form.name} placeholder="e.g. Hip-Hop Essentials"
              onChange={e => setF("name", e.target.value)}
              onFocus={e=>e.target.style.borderColor=T.gn} onBlur={e=>e.target.style.borderColor=T.b1} />
          </div>

          {/* ── Optional Spotify URL ── */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl("Spotify Link (optional — auto-fills details)")}>Spotify Playlist URL <span style={{ color:T.g400, fontSize:10.5, textTransform:"none" }}>(optional)</span></label>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{ ...inpS, flex:1 }} value={form.url} placeholder="https://open.spotify.com/playlist/…"
                onChange={e => handlePlaylistUrl(e.target.value)}
                onFocus={e=>e.target.style.borderColor="#1DB954"} onBlur={e=>e.target.style.borderColor=T.b1} />
              {urlFetching && (
                <div style={{ display:"flex", alignItems:"center", padding:"0 12px", color:"#1DB954" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation:"spin .7s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" stroke="rgba(30,215,96,.3)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#1DB954" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
            </div>
            {urlMsg && (
              <div style={{ fontSize:11.5, marginTop:5, fontWeight:600,
                            color: urlMsg.type==="ok" ? "#1DB954" : T.g300 }}>{urlMsg.text}</div>
            )}
          </div>

          {/* ── Grid: Genre, Platform, Followers, Turnaround, Credits ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:14, marginBottom:14 }}>
            <div>
              <label style={lbl("Genre")}>Genre</label>
              <select value={form.genre} onChange={e => setF("genre", e.target.value)}
                style={{ ...inpS, cursor:"pointer" }}>
                {GENRES.filter(g=>g!=="All").map(g => <option key={g} value={g} style={{background:T.bg}}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl("Platform")}>Platform</label>
              <select value={form.platform} onChange={e => setF("platform", e.target.value)}
                style={{ ...inpS, cursor:"pointer" }}>
                {PLATFORMS.map(p => <option key={p} value={p} style={{background:T.bg}}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl("Followers")}>Followers</label>
              <input style={inpS} value={form.followers} placeholder="e.g. 8.2K"
                onChange={e => setF("followers", e.target.value)}
                onFocus={e=>e.target.style.borderColor=T.gn} onBlur={e=>e.target.style.borderColor=T.b1} />
            </div>
            <div>
              <label style={lbl("Turnaround")}>Turnaround</label>
              <select value={form.turnaround} onChange={e => setF("turnaround", e.target.value)}
                style={{ ...inpS, cursor:"pointer" }}>
                {TURNAROUND.map(t => <option key={t} value={t} style={{background:T.bg}}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* ── Credits ── */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl("Price (credits)")}>Price per Submission (credits)</label>
            <div style={{ display:"flex", gap:6 }}>
              {[1,2,3,4,5].map(n => (
                <button type="button" key={n} onClick={() => setF("credits", n)}
                  style={{ flex:1, padding:"9px 0", borderRadius:9,
                           border:`1px solid ${form.credits===n?T.gn:T.b1}`,
                           background:form.credits===n?T.gnGl:"transparent",
                           color:form.credits===n?T.gn:T.g200, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* ── Rules ── */}
          <div style={{ marginBottom:20 }}>
            <label style={lbl("Submission Rules")}>Submission Rules <span style={{ color:T.g400, textTransform:"none", fontSize:11 }}>(shown to artists)</span></label>
            <textarea rows={2} style={{ ...inpS, resize:"vertical" }} value={form.rules}
              placeholder="e.g. Hip-hop only, minimum 1K monthly listeners. No explicit content."
              onChange={e => setF("rules", e.target.value)}
              onFocus={e=>e.target.style.borderColor=T.gn} onBlur={e=>e.target.style.borderColor=T.b1} />
          </div>

          {/* ── Gate Builder ── */}
          <div style={{ marginBottom:20, padding:"16px 16px", background:"rgba(255,255,255,.02)", border:`1px solid ${T.b0}`, borderRadius:12 }}>
            <GateBuilder gates={form.gates || []} onChange={gates => setF("gates", gates)} />
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button className="bp" onClick={savePlaylist} disabled={!form.name.trim()} style={{ padding:"10px 22px", fontSize:14 }}>
              {editing ? "Save Changes →" : "Add Playlist →"}
            </button>
            <button className="bs" onClick={() => { setAdding(false); setEditing(null); }} style={{ padding:"10px 18px", fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {playlists.map(pl => {
          const activeGates = (pl.gates || []).filter(g => g.enabled);
          return (
            <div key={pl.id} style={{ ...card({ padding:"15px 17px", opacity:pl.active?1:.55 }) }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=T.b1} onMouseLeave={e=>e.currentTarget.style.borderColor=T.b0}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:14, flexWrap:"wrap" }}>
                {/* Artwork or icon */}
                {pl.artworkUrl
                  ? <img src={pl.artworkUrl} alt="" style={{ width:44, height:44, borderRadius:11, objectFit:"cover", flexShrink:0 }} />
                  : <div style={{ width:44, height:44, borderRadius:11, background:"rgba(30,215,96,.1)", border:"1px solid rgba(30,215,96,.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    </div>
                }
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14.5, marginBottom:5 }}>{pl.name}</div>
                  <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center", marginBottom:4 }}>
                    <span className="chip cb" style={{ fontSize:10.5, padding:"2px 8px" }}>{pl.genre}</span>
                    <span className="chip cb" style={{ fontSize:10.5, padding:"2px 8px" }}>{pl.platform}</span>
                    {pl.followers && <span style={{ fontSize:12, color:T.g300 }}>{pl.followers} followers</span>}
                    <span style={{ fontSize:12, color:T.g300 }}>⏱ {pl.turnaround}</span>
                    <span style={{ fontSize:12, color:T.gn, fontWeight:700 }}>{pl.credits}cr</span>
                    {activeGates.length > 0 && (
                      <span style={{ fontSize:11, color:"#ffc740", fontWeight:700 }}>⚡ {activeGates.length} gate{activeGates.length!==1?"s":""}</span>
                    )}
                  </div>
                  {pl.rules && <div style={{ fontSize:12, color:T.g400, fontStyle:"italic" }}>"{pl.rules}"</div>}
                </div>
                {/* Controls */}
                <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                  <Toggle on={pl.active} onToggle={() => toggleActive(pl.id)} />
                  <span style={{ fontSize:11.5, color:pl.active?T.gn:T.g300, fontWeight:700, width:44 }}>{pl.active?"Live":"Off"}</span>
                  <button className="bt" onClick={() => startEdit(pl)} style={{ fontSize:12 }}>Edit</button>
                  <button className="bt" onClick={() => deletePlaylist(pl.id)} style={{ fontSize:12, color:T.red }}>Del</button>
                  {pl.url && <a href={pl.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:T.blue, textDecoration:"none" }}>↗</a>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── CuratorProfileSection ── */
const GENRE_OPTS = ["Hip-Hop","R&B","Electronic","Indie","Pop","Lo-Fi","Latin","Afrobeats","Soul"];

export function CuratorProfileSection() {
  const [profile, setProfile] = useState({
    displayName:  "VibeCheck Radio",
    bio:          "Hip-hop and trap curator with 12 years of playlist experience. Fast responses, honest feedback.",
    genres:       ["Hip-Hop","Trap"],
    platforms:    ["Spotify"],
    turnaround:   "24h",
    price:        2,
    openForSubs:  true,
    instagramUrl: "",
    twitterUrl:   "",
    spotifyUrl:   "",
    rules:        "Must be hip-hop or trap. No mumble rap. Min 1K monthly listeners.",
  });
  const [saved,          setSaved]          = useState(false);
  const [spotifyProfile, setSpotifyProfile] = useState(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(() => isSpotifyConnected());

  const syncSpotifyFromStorage = () => {
    setSpotifyConnected(isSpotifyConnected());
  };

  useEffect(() => {
    syncSpotifyFromStorage();
    const onUpdated = () => syncSpotifyFromStorage();
    const onCleared = () => {
      setSpotifyConnected(false);
      setSpotifyProfile(null);
    };
    const onFocus = () => syncSpotifyFromStorage();
    window.addEventListener(SPOTIFY_TOKEN_UPDATED_EVENT, onUpdated);
    window.addEventListener(SPOTIFY_TOKEN_CLEARED_EVENT, onCleared);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(SPOTIFY_TOKEN_UPDATED_EVENT, onUpdated);
      window.removeEventListener(SPOTIFY_TOKEN_CLEARED_EVENT, onCleared);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!spotifyConnected) return;
    getSpotifyAccessToken().then(token => {
      if (token) fetchSpotifyProfile(token).then(p => { if (p) setSpotifyProfile(p); });
    });
  }, [spotifyConnected]);

  const handleConnectSpotify = async () => {
    if (!hasSpotifyClientId()) {
      alert("Set VITE_SPOTIFY_CLIENT_ID in your .env file to enable Spotify connection.");
      return;
    }
    setSpotifyLoading(true);
    await startSpotifyAuth(); // redirects — loading state is visual only
  };

  const handleDisconnectSpotify = () => {
    clearSpotifyToken();
    setSpotifyConnected(false);
    setSpotifyProfile(null);
  };

  const setP = (k, v) => setProfile(p => ({...p, [k]:v}));

  const toggleGenre = (g) => setP("genres", profile.genres.includes(g) ? profile.genres.filter(x=>x!==g) : [...profile.genres, g]);
  const togglePlatform = (p2) => setP("platforms", profile.platforms.includes(p2) ? profile.platforms.filter(x=>x!==p2) : [...profile.platforms, p2]);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const section = (title, children) => (
    <div style={{ ...card({ padding:"18px 20px", marginBottom:14 }) }}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:16, color:T.w }}>{title}</div>
      {children}
    </div>
  );

  const field = (label, children) => (
    <div style={{ marginBottom:14 }}>
      <label style={lbl(label)}>{label}</label>
      {children}
    </div>
  );

  const inpF = { ...inp(), marginBottom:0, onFocus:e=>e.target.style.borderColor=T.gn, onBlur:e=>e.target.style.borderColor=T.b1 };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:3 }}>Curator Profile</h1>
          <p style={{ color:T.g200, fontSize:13 }}>This is what artists see when browsing the marketplace</p>
        </div>
        <button className="bp" onClick={save} style={{ padding:"9px 20px", fontSize:13 }}>
          {saved ? "✓ Saved!" : "Save Profile →"}
        </button>
      </div>

      {section("Identity", <>
        {field("Display Name", <input {...inpF} value={profile.displayName} onChange={e=>setP("displayName",e.target.value)} placeholder="e.g. VibeCheck Radio" />)}
        {field("Bio", <textarea rows={3} style={{ ...inp(), resize:"vertical" }} value={profile.bio} onChange={e=>setP("bio",e.target.value)} onFocus={e=>e.target.style.borderColor=T.gn} onBlur={e=>e.target.style.borderColor=T.b1} placeholder="Tell artists what your playlist is about…" />)}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontWeight:600, fontSize:13.5 }}>Open for Submissions</div>
            <div style={{ fontSize:12, color:T.g300, marginTop:2 }}>Artists can send you tracks</div>
          </div>
          <Toggle on={profile.openForSubs} onToggle={() => setP("openForSubs", !profile.openForSubs)} />
        </div>
      </>)}

      {section("Genres & Platforms", <>
        {field("Genres You Accept", (
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {GENRE_OPTS.map(g => (
              <button type="button" key={g} onClick={() => toggleGenre(g)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${profile.genres.includes(g)?T.gn:T.b1}`, background:profile.genres.includes(g)?T.gnGl:"transparent", color:profile.genres.includes(g)?T.gn:T.g200, transition:"all .12s" }}>
                {g}
              </button>
            ))}
          </div>
        ))}
        {field("Platforms", (
          <div style={{ display:"flex", gap:7 }}>
            {PLATFORMS.map(p2 => (
              <button type="button" key={p2} onClick={() => togglePlatform(p2)}
                style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${profile.platforms.includes(p2)?T.gn:T.b1}`, background:profile.platforms.includes(p2)?T.gnGl:"transparent", color:profile.platforms.includes(p2)?T.gn:T.g200, transition:"all .12s" }}>
                {p2}
              </button>
            ))}
          </div>
        ))}
      </>)}

      {section("Pricing & Speed", <>
        {field("Turnaround Time", (
          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {TURNAROUND.map(t => (
              <button type="button" key={t} onClick={() => setP("turnaround", t)}
                style={{ padding:"7px 14px", borderRadius:10, fontSize:12.5, fontWeight:600, cursor:"pointer", border:`1px solid ${profile.turnaround===t?T.gn:T.b1}`, background:profile.turnaround===t?T.gnGl:"transparent", color:profile.turnaround===t?T.gn:T.g200 }}>
                {t}
              </button>
            ))}
          </div>
        ))}
        {field("Price per Submission (credits)", (
          <div style={{ display:"flex", gap:8 }}>
            {[1,2,3,4,5].map(n => (
              <button type="button" key={n} onClick={() => setP("price", n)}
                style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${profile.price===n?T.gn:T.b1}`, background:profile.price===n?T.gnGl:"transparent", color:profile.price===n?T.gn:T.g200, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                {n}
              </button>
            ))}
          </div>
        ))}
      </>)}

      {section("Submission Rules", (
        field("What artists must know before submitting", (
          <textarea rows={3} style={{ ...inp(), resize:"vertical" }} value={profile.rules} onChange={e=>setP("rules",e.target.value)} onFocus={e=>e.target.style.borderColor=T.gn} onBlur={e=>e.target.style.borderColor=T.b1} placeholder="Genre requirements, follower minimums, content rules…" />
        ))
      ))}

      {/* ── Spotify Account Connection ── */}
      <div style={{ ...card({ padding:"18px 20px", marginBottom:14, border: spotifyConnected ? "1px solid rgba(30,215,96,.3)" : `1px solid ${T.b0}` }) }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:T.w, display:"flex", alignItems:"center", gap:8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          Spotify Account
        </div>
        {spotifyConnected && spotifyProfile ? (
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {spotifyProfile.avatarUrl
              ? <img src={spotifyProfile.avatarUrl} alt="" style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover" }} />
              : <div style={{ width:42, height:42, borderRadius:"50%", background:"rgba(30,215,96,.12)", border:"1px solid rgba(30,215,96,.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#1ed760" }}>{spotifyProfile.displayName?.slice(0,1)}</div>
            }
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{spotifyProfile.displayName}</div>
              <div style={{ fontSize:12, color:"#1DB954", marginTop:2 }}>✓ Connected · {spotifyProfile.email || "Spotify account linked"}</div>
              <div style={{ fontSize:11.5, color:T.g300, marginTop:1 }}>Playlist insertion enabled for accepted tracks</div>
            </div>
            <button onClick={handleDisconnectSpotify}
              style={{ padding:"7px 14px", background:"rgba(255,64,96,.07)", border:"1px solid rgba(255,64,96,.2)", borderRadius:9, color:T.red, fontWeight:600, fontSize:12.5, cursor:"pointer" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,64,96,.15)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,64,96,.07)"}>
              Disconnect
            </button>
          </div>
        ) : spotifyConnected ? (
          <div style={{ display:"flex", alignItems:"center", gap:10, color:T.g200, fontSize:13 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#1DB954" }} />
            Spotify connected — loading profile…
          </div>
        ) : (
          <div>
            <p style={{ fontSize:13, color:T.g200, marginBottom:14, lineHeight:1.6 }}>
              Connect your Spotify account to enable automatic playlist insertion when you accept a track. Requires scopes: <code style={{ fontSize:11, color:T.g300 }}>playlist-modify-public</code>, <code style={{ fontSize:11, color:T.g300 }}>playlist-modify-private</code>.
            </p>
            <button onClick={handleConnectSpotify} disabled={spotifyLoading}
              style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"11px 20px", background:"#1DB954", border:"none", borderRadius:10, color:"#000", fontWeight:700, fontSize:14, cursor:"pointer", opacity:spotifyLoading?.65:1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#000"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              {spotifyLoading ? "Connecting…" : "Connect Spotify Account"}
            </button>
            {!hasSpotifyClientId() && (
              <div style={{ fontSize:12, color:T.gold, marginTop:10 }}>⚠ Set <code>VITE_SPOTIFY_CLIENT_ID</code> in .env to enable this feature.</div>
            )}
          </div>
        )}
      </div>

      {section("Social Links", (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
          {[{k:"spotifyUrl",l:"Spotify Profile URL"},{k:"instagramUrl",l:"Instagram URL"},{k:"twitterUrl",l:"Twitter / X URL"}].map(f => (
            <div key={f.k}>
              <label style={lbl(f.l)}>{f.l}</label>
              <input {...inpF} value={profile[f.k]} onChange={e=>setP(f.k,e.target.value)} placeholder="https://…" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── CuratorHistorySection ── */
export function CuratorHistorySection() {
  const history = []
  const totalEarned = 0
  const completedCount = 0

  if (history.length === 0) {
    return (
      <div style={{ ...card({ padding: 18 }), textAlign:'center' }}>
        <div style={{ fontSize:34, marginBottom:10 }}>📋</div>
        <div style={{ fontWeight:900, fontSize:15, marginBottom:6 }}>No review history yet</div>
        <div style={{ fontSize:13, color:T.g300, lineHeight:1.6 }}>
          Completed and declined reviews will appear here once you begin reviewing submissions.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:"-.02em", marginBottom:3 }}>History</h1>
          <p style={{ color:T.g200, fontSize:13 }}>{history.length} reviewed submissions</p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ padding:"10px 14px", background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.2)", borderRadius:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#10b981", textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Total Earned</div>
            <div className="mono" style={{ fontSize:18, color:"#10b981" }}>${totalEarned.toFixed(2)}</div>
          </div>
          <div style={{ padding:"10px 14px", background:"rgba(127,255,0,.06)", border:`1px solid ${T.gnB}`, borderRadius:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.gn, textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Completed</div>
            <div className="mono" style={{ fontSize:18, color:T.gn }}>{completedCount}</div>
          </div>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {history.map(sub => (
          <div key={sub.id} style={card({ padding:"13px 16px" })}
            onMouseEnter={e=>e.currentTarget.style.borderColor=T.b1} onMouseLeave={e=>e.currentTarget.style.borderColor=T.b0}>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <SongThumb item={sub} />
              <div style={{ flex:1, minWidth:80 }}>
                <div style={{ fontWeight:700, fontSize:13.5, marginBottom:2 }}>{sub.songTitle}</div>
                <div style={{ fontSize:12, color:T.g300 }}>{sub.artist} · {sub.date}</div>
                {sub.playlist && (
                  <div style={{ fontSize:11.5, color:T.gn, fontWeight:600, marginTop:3 }}>✦ Added to {sub.playlist}</div>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <span className="mono" style={{ fontSize:14, color:sub.status==="completed"?"#10b981":T.g400 }}>
                  {sub.status==="completed" ? `+$${sub.payout.toFixed(2)}` : "—"}
                </span>
                <TypeBadge type={sub.type} />
                <span style={{ padding:"3px 11px", borderRadius:20, fontSize:11, fontWeight:700, background:sub.status==="completed"?"rgba(16,185,129,.1)":"rgba(255,64,96,.08)", color:sub.status==="completed"?"#10b981":T.red, border:`1px solid ${sub.status==="completed"?"rgba(16,185,129,.25)":"rgba(255,64,96,.2)"}` }}>
                  {sub.status==="completed"?"✓ Completed":"✗ Declined"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
