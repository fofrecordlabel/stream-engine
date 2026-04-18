import React from 'react'
import { T } from '../../tokens.js'

export function Dot({ size = 7, pulse = false, color = "#7fff00" }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: color, flexShrink: 0, boxShadow: `0 0 ${size * 1.5}px ${color}55`,
      animation: pulse ? "pulse 2.5s ease infinite" : "none"
    }} />
  );
}

export function SectionLabel({ children, color = T.gn }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
      <Dot pulse color={color} size={6} />
      <span style={{ fontSize: 10.5, fontWeight: 800, color, letterSpacing: ".12em", textTransform: "uppercase" }}>{children}</span>
    </div>
  );
}

export function VerifiedMark({ size = 15 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: T.gn, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * .6} height={size * .6} viewBox="0 0 10 10" fill="none">
        <path d="M1.8 5l2.2 2.2 4.2-4.4" stroke="#000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function SpotifyBadge() {
  return (
    <span className="chip" style={{ background: "rgba(30,215,96,.1)", color: "#1ed760", border: "1px solid rgba(30,215,96,.22)", fontSize: 10.5, padding: "2px 8px" }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="#1ed760" style={{ flexShrink: 0 }}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
      Spotify
    </span>
  );
}

export function CreditPill({ n, large = false }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
      <span className="mono" style={{ fontSize: large ? 26 : 15, fontWeight: 500, color: T.gn, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: large ? 10 : 9, fontWeight: 800, color: "rgba(127,255,0,.6)", marginLeft: 1 }}>CR</span>
    </span>
  );
}

export function SongArt({ song, size = 52, r = 12 }) {
  const [imgErr, setImgErr] = React.useState(false);
  const artworkUrl = song.artworkUrl || song.artwork_url;
  const label = (song.song || song.title || "SE").slice(0, 2).toUpperCase();
  const ac = song.ac || "#7fff00";
  const bg = song.bg || "#050506";

  if (artworkUrl && !imgErr) {
    return (
      <div style={{ width: size, height: size, borderRadius: r, flexShrink: 0, overflow: "hidden", position: "relative" }}>
        <img
          src={artworkUrl}
          alt={song.title || song.song || ""}
          onError={() => setImgErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: `linear-gradient(135deg,${bg},${ac}28)`,
      border: `1px solid ${ac}28`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * .28, fontWeight: 900, color: ac,
      flexShrink: 0, position: "relative", overflow: "hidden"
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 30%,${ac}18,transparent 65%)` }} />
      <span style={{ position: "relative" }}>{label}</span>
    </div>
  );
}

/**
 * Inline Spotify preview player.
 * Uses <audio> with previewUrl if available, otherwise shows an
 * "Open on Spotify" link (Spotify's own iframe embed is blocked cross-origin for autoplay).
 */
export function SpotifyMiniPlayer({ previewUrl, spotifyUrl, size = "small" }) {
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const audioRef = React.useRef(null);

  React.useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio && audio.duration) setProgress(audio.currentTime / audio.duration);
  };

  const onEnded = () => { setPlaying(false); setProgress(0); };

  if (!previewUrl && !spotifyUrl) return null;

  const isSmall = size === "small";
  const btnSize = isSmall ? 28 : 36;

  if (!previewUrl) {
    // No preview_url: show open-on-Spotify link
    return (
      <a href={spotifyUrl} target="_blank" rel="noreferrer"
        style={{ display:"inline-flex", alignItems:"center", gap:6, padding: isSmall ? "5px 10px" : "7px 14px",
                 background:"rgba(30,215,96,.08)", border:"1px solid rgba(30,215,96,.2)", borderRadius:8,
                 color:"#1ed760", fontSize: isSmall ? 11.5 : 13, fontWeight:600, textDecoration:"none" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
        Preview on Spotify ↗
      </a>
    );
  }

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <audio ref={audioRef} src={previewUrl} onTimeUpdate={onTimeUpdate} onEnded={onEnded} preload="none" />
      <button onClick={togglePlay}
        style={{ width:btnSize, height:btnSize, borderRadius:"50%", background:playing?"rgba(30,215,96,.2)":"rgba(30,215,96,.1)", border:"1px solid rgba(30,215,96,.35)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, transition:"all .15s" }}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(30,215,96,.25)"}
        onMouseLeave={e=>e.currentTarget.style.background=playing?"rgba(30,215,96,.2)":"rgba(30,215,96,.1)"}>
        {playing
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="#1ed760"><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="#1ed760"><path d="M2 1.5l7 3.5-7 3.5V1.5z"/></svg>
        }
      </button>
      {/* Progress bar */}
      <div style={{ flex:1, height:3, background:"rgba(255,255,255,.1)", borderRadius:2, overflow:"hidden", maxWidth: isSmall ? 60 : 100 }}>
        <div style={{ height:"100%", width:`${progress*100}%`, background:"#1ed760", borderRadius:2, transition:"width .1s linear" }} />
      </div>
      <span style={{ fontSize:10.5, color:"#1ed760", fontWeight:600, flexShrink:0 }}>30s</span>
    </div>
  );
}

export function StatusBadge({ status, small = false }) {
  const M = {
    approved: { bg: "rgba(127,255,0,.1)",  bc: "rgba(127,255,0,.25)",  c: T.gn,   l: "✓ Approved" },
    accepted: { bg: "rgba(127,255,0,.1)",  bc: "rgba(127,255,0,.25)",  c: T.gn,   l: "✓ Accepted" },
    pending:  { bg: "rgba(255,199,64,.08)",bc: "rgba(255,199,64,.2)",  c: T.gold, l: "○ Pending"  },
    changes_requested: { bg: "rgba(249,115,22,.08)", bc: "rgba(249,115,22,.24)", c: "#fb923c", l: "↻ Changes Requested" },
    declined: { bg: "rgba(255,64,96,.08)", bc: "rgba(255,64,96,.2)",   c: T.red,  l: "✗ Declined" },
  };
  const s = M[status] || M.pending;
  return (
    <span style={{
      padding: small ? "2px 9px" : "3px 11px", borderRadius: 20,
      fontSize: small ? 10.5 : 11.5, fontWeight: 700,
      background: s.bg, color: s.c, border: `1px solid ${s.bc}`,
      whiteSpace: "nowrap", flexShrink: 0
    }}>{s.l}</span>
  );
}

export function TypeBadge({ type }) {
  const isPremium = type === "premium";
  return (
    <span className={`chip ${isPremium ? "cg" : "cb"}`} style={{ fontSize: 10, padding: "2px 8px" }}>
      {isPremium ? "⭐ Premium" : "Free"}
    </span>
  );
}

export function SpotifyIcon({ size = 18, color = "#1ed760" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export function SpotifySearchBar({ value, onChange, onFocus, onBlur, focused, placeholder, large = false }) {
  const fontSize  = large ? 16 : 15;
  const padding   = large ? "16px 18px 16px 52px" : "14px 18px 14px 48px";
  const iconSize  = large ? 20 : 18;
  const iconLeft  = large ? 17 : 15;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "absolute", left: iconLeft, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", alignItems: "center", zIndex: 2 }}>
        <SpotifyIcon size={iconSize} color={focused ? "#1ed760" : "rgba(30,215,96,.55)"} />
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder || "Paste Spotify link or search artist / song…"}
        style={{
          width: "100%", padding, fontSize,
          background: focused ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.045)",
          border: `1.5px solid ${focused ? "rgba(30,215,96,.55)" : "rgba(255,255,255,.1)"}`,
          borderRadius: large ? 16 : 14, color: T.w, outline: "none",
          transition: "border-color .2s, background .2s, box-shadow .2s",
          boxShadow: focused ? "0 0 0 3px rgba(30,215,96,.1), 0 8px 32px rgba(0,0,0,.3)" : "0 4px 20px rgba(0,0,0,.2)",
          fontFamily: "'Outfit', sans-serif", letterSpacing: "-.01em", lineHeight: 1.4,
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.1)", border: "none", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.g200, fontSize: 13, transition: "background .15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.18)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
        >×</button>
      )}
    </div>
  );
}
