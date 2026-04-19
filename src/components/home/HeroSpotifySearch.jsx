import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../tokens.js'
import { SpotifyBadge, SpotifyIcon, SpotifyMiniPlayer } from '../common/Atoms.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  fetchSpotifyTrack,
  isSpotifyTrackUrl,
  searchSpotifyTracks,
  accentFromGenre,
} from '../../lib/spotify.js'
import { setPendingSubmission, normalizePendingSong } from '../../lib/pendingSubmission.js'
import {
  EXCLUSIVE_DIRECT_BASE_USD,
  exclusiveDirectQuote,
  saveExclusiveQuoteIntent,
} from '../../lib/exclusiveSubmissionPricing.js'

function SearchIcon({ size = 20, color = 'rgba(255,255,255,.45)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm9 2-4.35-4.35"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function commitLoadedTrack(track, spotifyUrl, toast, setHeroPreview, setHeroSuccess) {
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
  const artistBit = track.artist ? ` · ${track.artist}` : ''
  setHeroSuccess(`Loaded “${track.title || 'Track'}”${artistBit}.`)
  setHeroPreview({
    title: track.title || 'Track',
    artist: track.artist || '',
    artworkUrl: track.artworkUrl || null,
    previewUrl: track.previewUrl || null,
    spotifyUrl: track.spotifyUrl || spotifyUrl,
  })
  toast.success(`${track.title || 'Track'} is ready for Playlist Push`, 'Track loaded')
}

/**
 * Hero: type artist/song (live search) or paste a Spotify track link; optional paste-only field.
 */
export default function HeroSpotifySearch({ setPage, isLoggedIn }) {
  const toast = useToast()
  const loggedInRef = useRef(isLoggedIn)
  useEffect(() => {
    loggedInRef.current = isLoggedIn
  }, [isLoggedIn])

  const [query, setQuery] = useState('')
  const [pasteLink, setPasteLink] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchHint, setSearchHint] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [heroError, setHeroError] = useState('')
  const [heroSuccess, setHeroSuccess] = useState('')
  const [heroPreview, setHeroPreview] = useState(null)
  const [loadingTrack, setLoadingTrack] = useState(false)
  const [exclusiveOpen, setExclusiveOpen] = useState(false)
  const [exclusiveQty, setExclusiveQty] = useState(1)

  const exclusiveQuote = useMemo(() => exclusiveDirectQuote(exclusiveQty), [exclusiveQty])

  const debounceRef = useRef(null)
  const blurTimer = useRef(null)
  const trimmed = query.trim()
  const isUrl = isSpotifyTrackUrl(trimmed)

  const runSearch = useCallback(async (q) => {
    if (isSpotifyTrackUrl(q)) {
      setResults([])
      setSearchHint('')
      return
    }
    if (q.length < 2) {
      setResults([])
      setSearchHint('')
      return
    }
    setSearching(true)
    setSearchHint('')
    try {
      const { tracks, searchConfigured, hint } = await searchSpotifyTracks(q, 12)
      setResults(tracks)
      if (!searchConfigured && hint) setSearchHint(hint)
      else if (!searchConfigured) setSearchHint('Live search needs Spotify credentials on your API server.')
      else setSearchHint('')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (isSpotifyTrackUrl(trimmed)) {
      setResults([])
      setSearchHint('')
      return
    }
    if (!focused || !trimmed) {
      if (!trimmed) setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed)
    }, 320)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, focused, runSearch])

  /** While the main field is focused, show the panel (search results + paste link), like Daily Playlists. */
  const showDropdown = focused

  const loadFromUrl = async (raw) => {
    const u = String(raw || '').trim()
    if (!isSpotifyTrackUrl(u)) {
      setHeroError('Paste a valid Spotify track link.')
      return
    }
    setHeroError('')
    setHeroSuccess('')
    setHeroPreview(null)
    setLoadingTrack(true)
    try {
      const track = await fetchSpotifyTrack(u)
      if (!track) {
        setHeroError('Could not read that Spotify link.')
        return
      }
      commitLoadedTrack(track, u, toast, setHeroPreview, setHeroSuccess)
    } catch (e) {
      setHeroError(e?.message || 'Could not load that track.')
    } finally {
      setLoadingTrack(false)
    }
  }

  const selectSearchResult = async (t) => {
    setFocused(false)
    setResults([])
    setActiveIdx(-1)
    setHeroError('')
    setHeroSuccess('')
    setHeroPreview(null)
    setLoadingTrack(true)
    try {
      let track = {
        id: t.id,
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl,
        spotifyUrl: t.spotifyUrl,
        previewUrl: t.previewUrl || null,
        duration: t.durationMs ?? null,
      }
      try {
        const enriched = await fetchSpotifyTrack(t.spotifyUrl)
        if (enriched) {
          track = {
            ...track,
            ...enriched,
            previewUrl: enriched.previewUrl ?? track.previewUrl,
          }
        }
      } catch {
        /* keep search payload */
      }
      commitLoadedTrack(track, t.spotifyUrl, toast, setHeroPreview, setHeroSuccess)
      setQuery(`${t.title}${t.artist ? ` — ${t.artist}` : ''}`)
    } catch (e) {
      setHeroError(e?.message || 'Could not use that result.')
    } finally {
      setLoadingTrack(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (activeIdx >= 0 && results[activeIdx]) {
      void selectSearchResult(results[activeIdx])
      return
    }
    if (isUrl) void loadFromUrl(trimmed)
  }

  const onKeyDown = (e) => {
    if (!showDropdown || !results.length) {
      if (e.key === 'Enter' && isUrl) void loadFromUrl(trimmed)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      void selectSearchResult(results[activeIdx])
    }
  }

  const proceedAfterHero = () => {
    setHeroPreview(null)
    setHeroSuccess('')
    if (loggedInRef.current) setPage('artist')
    else setPage('auth')
  }

  const exclusiveBtnStyle = {
    flex: 1,
    padding: '14px 18px',
    fontSize: 14,
    minWidth: 118,
    background: '#fff',
    color: '#0a0a0b',
    border: '1px solid rgba(255,255,255,.95)',
    borderRadius: 12,
    fontWeight: 900,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 8px 28px rgba(0,0,0,.25)',
    transition: 'transform .12s ease, box-shadow .12s ease',
  }

  const confirmExclusive = () => {
    saveExclusiveQuoteIntent({
      kind: 'exclusive_direct',
      ...exclusiveQuote,
      baseUsd: EXCLUSIVE_DIRECT_BASE_USD,
    })
    setExclusiveOpen(false)
    toast.success(
      `${exclusiveQuote.qty} exclusive slot${exclusiveQuote.qty === 1 ? '' : 's'} · $${exclusiveQuote.youPayUsd.toFixed(2)} saved to your session. Continue in Billing to pay.`,
      'Exclusive',
    )
    setPage('subscriptions')
  }

  const clearBlurTimer = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
  }

  const scheduleBlur = () => {
    clearBlurTimer()
    blurTimer.current = setTimeout(() => {
      setFocused(false)
    }, 180)
  }

  const exclusiveModal =
    exclusiveOpen &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exclusive-modal-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 400,
          background: 'rgba(0,0,0,.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
        onClick={() => setExclusiveOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setExclusiveOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 18,
            background: 'linear-gradient(145deg,#141418,#0c0c10)',
            border: `1px solid ${T.b0}`,
            boxShadow: '0 32px 80px rgba(0,0,0,.65)',
            padding: '24px 22px 22px',
          }}
        >
          <div id="exclusive-modal-title" style={{ fontSize: 11, fontWeight: 800, color: T.gn, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Exclusive lane
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: T.w, letterSpacing: '-.03em', marginBottom: 10, lineHeight: 1.15 }}>
            Direct submissions — ${EXCLUSIVE_DIRECT_BASE_USD} each
          </h2>
          <p style={{ fontSize: 13.5, color: T.g200, lineHeight: 1.6, marginBottom: 18 }}>
            Priority direct curator submissions. Order more and your <strong style={{ color: T.w }}>per-slot price drops automatically</strong> (up to 25% off at 25+).
          </p>
          <div style={{ fontSize: 11.5, color: T.g300, marginBottom: 14, lineHeight: 1.5 }}>
            Volume: <span style={{ color: T.gn }}>3+</span> −5% · <span style={{ color: T.gn }}>5+</span> −10% · <span style={{ color: T.gn }}>10+</span> −15% · <span style={{ color: T.gn }}>15+</span> −20% · <span style={{ color: T.gn }}>25+</span> −25%
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 8 }}>How many direct submissions?</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              className="bt"
              onClick={() => setExclusiveQty((q) => Math.max(1, q - 1))}
              style={{ padding: '10px 14px', fontSize: 16, fontWeight: 800 }}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={50}
              value={exclusiveQty}
              onChange={(e) => setExclusiveQty(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 800,
                padding: '10px 8px',
                borderRadius: 10,
                border: `1px solid ${T.b1}`,
                background: T.card,
                color: T.w,
              }}
            />
            <button
              type="button"
              className="bt"
              onClick={() => setExclusiveQty((q) => Math.min(50, q + 1))}
              style={{ padding: '10px 14px', fontSize: 16, fontWeight: 800 }}
            >
              +
            </button>
          </div>
          <div
            style={{
              borderRadius: 12,
              padding: '14px 16px',
              background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.b0}`,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.g300, marginBottom: 6 }}>
              <span>List ({exclusiveQuote.qty} × ${EXCLUSIVE_DIRECT_BASE_USD})</span>
              <span className="mono" style={{ textDecoration: exclusiveQuote.savedUsd > 0 ? 'line-through' : 'none', color: T.g200 }}>
                ${exclusiveQuote.listSubtotalUsd.toFixed(2)}
              </span>
            </div>
            {exclusiveQuote.savedUsd > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.gn, marginBottom: 6 }}>
                <span>Volume savings ({exclusiveQuote.discountPct}%)</span>
                <span className="mono">−${exclusiveQuote.savedUsd.toFixed(2)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: T.w, paddingTop: 8, borderTop: `1px solid ${T.b0}` }}>
              <span>You pay</span>
              <span className="mono" style={{ color: T.gn }}>
                ${exclusiveQuote.youPayUsd.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: T.g400, marginTop: 8, lineHeight: 1.45 }}>
              ≈ ${exclusiveQuote.unitUsd.toFixed(2)} per submission after discount.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="bt" onClick={() => setExclusiveOpen(false)} style={{ flex: 1, padding: '12px 14px', fontSize: 14, justifyContent: 'center' }}>
              Cancel
            </button>
            <button type="button" className="bp" onClick={confirmExclusive} style={{ flex: 1.2, padding: '12px 14px', fontSize: 14, justifyContent: 'center' }}>
              Continue → Billing
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <div style={{ width: '100%', maxWidth: 620, margin: '0 auto', position: 'relative' }}>
      {exclusiveModal}
      <form
        onSubmit={onSubmit}
        style={{
          position: 'relative',
          padding: 14,
          borderRadius: 18,
          background: 'linear-gradient(145deg,rgba(16,16,19,.92),rgba(8,8,10,.75))',
          border: `1px solid ${focused ? T.gnB : 'rgba(255,255,255,.08)'}`,
          boxShadow: focused ? `0 0 0 1px ${T.gnB}, 0 20px 60px rgba(0,0,0,.55)` : '0 20px 60px rgba(0,0,0,.45)',
          transition: 'border-color .2s, box-shadow .2s',
        }}
      >
        <div style={{ position: 'relative', width: '100%' }}>
          <div
            style={{
              position: 'absolute',
              left: 18,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              zIndex: 2,
              display: 'flex',
            }}
          >
            {isUrl ? (
              <SpotifyIcon size={20} color={focused ? '#1ed760' : 'rgba(30,215,96,.55)'} />
            ) : (
              <SearchIcon size={20} color={focused ? 'rgba(127,255,0,.75)' : 'rgba(255,255,255,.4)'} />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHeroError('')
              setHeroSuccess('')
              setHeroPreview(null)
              setActiveIdx(-1)
            }}
            onFocus={() => {
              clearBlurTimer()
              setFocused(true)
            }}
            onBlur={scheduleBlur}
            onKeyDown={onKeyDown}
            placeholder="Search song, artist, or paste a Spotify track link…"
            style={{
              width: '100%',
              padding: '16px 96px 16px 48px',
              fontSize: 16,
              background: focused ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.045)',
              border: `1.5px solid ${focused ? 'rgba(30,215,96,.45)' : 'rgba(255,255,255,.1)'}`,
              borderRadius: 16,
              color: T.w,
              outline: 'none',
              transition: 'border-color .2s, background .2s, box-shadow .2s',
              boxShadow: focused ? '0 0 0 3px rgba(30,215,96,.1), 0 8px 32px rgba(0,0,0,.3)' : '0 4px 20px rgba(0,0,0,.2)',
              fontFamily: "'Outfit', sans-serif",
              letterSpacing: '-.01em',
              lineHeight: 1.4,
            }}
          />
          {trimmed ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setResults([])
                setHeroPreview(null)
                setHeroError('')
                setHeroSuccess('')
              }}
              style={{
                position: 'absolute',
                right: 88,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,.1)',
                border: 'none',
                borderRadius: '50%',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: T.g200,
                fontSize: 15,
              }}
            >
              ×
            </button>
          ) : null}
          <button
            type="submit"
            disabled={loadingTrack || searching}
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              background: `linear-gradient(135deg,${T.gn},#5ac800)`,
              border: 'none',
              borderRadius: 10,
              padding: '8px 12px',
              fontWeight: 900,
              fontSize: 13,
              color: '#000',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              opacity: loadingTrack ? 0.7 : 1,
            }}
          >
            {loadingTrack ? '…' : 'Go'} →
          </button>
        </div>

        {showDropdown ? (
          <div
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              top: 'calc(100% + 6px)',
              zIndex: 50,
              borderRadius: 14,
              background: '#f4f4f7',
              border: '1px solid rgba(0,0,0,.08)',
              boxShadow: '0 24px 60px rgba(0,0,0,.45)',
              maxHeight: typeof window !== 'undefined' ? Math.min(360, window.innerHeight * 0.42) : 360,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                padding: '6px 0',
              }}
            >
              {isUrl ? (
                <div style={{ padding: '12px 14px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                  <strong style={{ color: '#111' }}>Spotify link detected.</strong> Press <strong>Go</strong> or{' '}
                  <strong>Enter</strong> to load artwork and details.
                </div>
              ) : null}
              {!isUrl && trimmed.length < 2 ? (
                <div style={{ padding: '12px 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  Type a <strong style={{ color: '#111' }}>song</strong> or <strong style={{ color: '#111' }}>artist</strong> name to search, or paste a track link below.
                </div>
              ) : null}
              {searching ? (
                <div style={{ padding: '14px 16px', fontSize: 13, color: '#6b7280' }}>Searching Spotify…</div>
              ) : null}
              {!searching && !isUrl && trimmed.length >= 2 && results.length === 0 && !searchHint ? (
                <div style={{ padding: '14px 16px', fontSize: 13, color: '#6b7280' }}>No tracks found. Try other words or paste a link below.</div>
              ) : null}
              {searchHint ? (
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#7c3aed', lineHeight: 1.45, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                  {searchHint}
                </div>
              ) : null}
              {results.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  onClick={() => void selectSearchResult(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    border: 'none',
                    background: i === activeIdx ? 'rgba(124,58,237,.12)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(0,0,0,.05)',
                  }}
                >
                  {t.artworkUrl ? (
                    <img src={t.artworkUrl} alt="" width={48} height={48} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: '#e5e7eb',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                      }}
                    >
                      🎵
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <SpotifyBadge />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#111', marginBottom: 2 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: '#4b5563' }}>By {t.artist || 'Unknown artist'}</div>
                  </div>
                </button>
              ))}
            </div>

            <div
              style={{
                padding: '12px 14px 14px',
                borderTop: '1px solid rgba(0,0,0,.08)',
                background: '#ececf0',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginBottom: 8 }}>
                Can&apos;t find your song? Paste your link here.
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <SpotifyIcon size={16} color="#1ed760" />
                </div>
                <input
                  type="text"
                  value={pasteLink}
                  onChange={(e) => setPasteLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const p = pasteLink.trim()
                      if (!p) return
                      void loadFromUrl(p)
                      setQuery(p)
                    }
                  }}
                  onMouseDown={clearBlurTimer}
                  onFocus={clearBlurTimer}
                  placeholder="Paste your Spotify song link here"
                  style={{
                    width: '100%',
                    padding: '11px 12px 11px 40px',
                    fontSize: 13,
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,.12)',
                    background: '#fff',
                    color: '#111',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                type="button"
                className="bp"
                onClick={() => {
                  void loadFromUrl(pasteLink)
                  if (pasteLink.trim()) setQuery(pasteLink.trim())
                }}
                style={{ width: '100%', marginTop: 10, padding: '10px 14px', fontSize: 13, borderRadius: 10, justifyContent: 'center' }}
              >
                Load pasted link →
              </button>
            </div>
          </div>
        ) : null}
      </form>

      {heroSuccess && !heroPreview && !heroError ? (
        <div style={{ marginTop: 12, fontSize: 13, color: T.gn, fontWeight: 600, textAlign: 'center' }}>{heroSuccess}</div>
      ) : null}

      {heroError ? (
        <div
          style={{
            marginTop: 14,
            fontSize: 13,
            color: T.red,
            fontWeight: 600,
            lineHeight: 1.55,
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {heroError}
        </div>
      ) : null}

      {heroPreview && !heroError ? (
        <div
          style={{
            marginTop: 18,
            padding: '16px 18px',
            borderRadius: 16,
            background: 'linear-gradient(145deg,rgba(127,255,0,.08),rgba(16,16,19,.95))',
            border: `1px solid ${T.gnB}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {heroPreview.artworkUrl ? (
              <img
                src={heroPreview.artworkUrl}
                alt=""
                width={72}
                height={72}
                style={{ borderRadius: 12, objectFit: 'cover', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,.06)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                🎵
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.gn, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Track loaded
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.w, lineHeight: 1.25, marginBottom: 2 }}>{heroPreview.title}</div>
              {heroPreview.artist ? <div style={{ fontSize: 14, color: T.g200 }}>{heroPreview.artist}</div> : null}
            </div>
          </div>
          {heroPreview.previewUrl || heroPreview.spotifyUrl ? (
            <div style={{ paddingTop: 4 }}>
              <SpotifyMiniPlayer previewUrl={heroPreview.previewUrl} spotifyUrl={heroPreview.spotifyUrl} size="small" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22, width: '100%' }}>
        {heroPreview ? (
          <button type="button" className="bp" onClick={proceedAfterHero} style={{ flex: 1, padding: '14px 22px', fontSize: 15.5, minWidth: 140 }}>
            Continue{isLoggedIn ? ' to dashboard' : ' to sign in'} <span className="arr">→</span>
          </button>
        ) : (
          <button
            type="button"
            className="bp"
            onClick={() => {
              if (isUrl) void loadFromUrl(trimmed)
              else setPage('get-started')
            }}
            style={{ flex: 1, padding: '14px 22px', fontSize: 15.5, minWidth: 130 }}
          >
            {isUrl ? 'Load track & continue' : 'Get Started'} <span className="arr">→</span>
          </button>
        )}
        <button type="button" onClick={() => setExclusiveOpen(true)} style={exclusiveBtnStyle}>
          Exclusive
        </button>
        <button type="button" className="bs" onClick={() => setPage('subscriptions')} style={{ flex: 1, padding: '14px 22px', fontSize: 15.5, minWidth: 100 }}>
          Pricing
        </button>
      </div>
    </div>
  )
}
