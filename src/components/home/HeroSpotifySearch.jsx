import { useState, useEffect, useRef, useCallback } from 'react'
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
import ExclusiveLaneOffer from './ExclusiveLaneOffer.jsx'

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
export default function HeroSpotifySearch({ setPage, isLoggedIn, maxWidth = 620 }) {
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
  /** Prefetched artwork for pasted Spotify URL (hero dropdown). */
  const [urlPeek, setUrlPeek] = useState(null)
  const urlPeekRef = useRef(null)

  const debounceRef = useRef(null)
  const blurTimer = useRef(null)
  const trimmed = query.trim()
  const isUrl = isSpotifyTrackUrl(trimmed)
  const pasteTrimmed = pasteLink.trim()
  const pasteIsTrackUrl = isSpotifyTrackUrl(pasteTrimmed)

  useEffect(() => {
    urlPeekRef.current = urlPeek
  }, [urlPeek])

  useEffect(() => {
    if (!isUrl || !trimmed) {
      setUrlPeek(null)
      return
    }
    setUrlPeek({ loading: true, artworkUrl: null, title: '', artist: '' })
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const track = await fetchSpotifyTrack(trimmed)
        if (!cancelled) {
          if (track) {
            setUrlPeek({
              loading: false,
              artworkUrl: track.artworkUrl || null,
              title: track.title || '',
              artist: track.artist || '',
            })
          } else {
            setUrlPeek({ loading: false, artworkUrl: null, title: '', artist: '' })
          }
        }
      } catch {
        if (!cancelled) setUrlPeek({ loading: false, artworkUrl: null, title: '', artist: '' })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [trimmed, isUrl])

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
      if (hint) setSearchHint(hint)
      else if (!searchConfigured) {
        setSearchHint('Live search needs SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET on your API server (e.g. Render → your web service → Environment).')
      } else setSearchHint('')
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

  const queueUrlAndAuth = (u) => {
    const raw = String(u || '').trim()
    if (!isSpotifyTrackUrl(raw)) return
    const peek = urlPeekRef.current
    setHeroError('')
    setFocused(false)
    setPendingSubmission({
      source: 'home-hero',
      intent: 'playlist_push',
      resumeAfterAuth: true,
      status: 'pending-metadata',
      song: normalizePendingSong({
        spotifyUrl: raw,
        title: peek?.title || '',
        artist: peek?.artist || '',
        artworkUrl: peek?.artworkUrl || null,
      }),
    })
    setPage('auth')
  }

  const runUrlAction = (raw) => {
    const u = String(raw || '').trim()
    if (!isSpotifyTrackUrl(u)) return
    if (isLoggedIn) void loadFromUrl(u)
    else queueUrlAndAuth(u)
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
    if (isUrl) runUrlAction(trimmed)
  }

  const onKeyDown = (e) => {
    if (!showDropdown || !results.length) {
      if (e.key === 'Enter' && isUrl) {
        e.preventDefault()
        runUrlAction(trimmed)
      }
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

  const clearBlurTimer = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
  }

  const scheduleBlur = () => {
    clearBlurTimer()
    blurTimer.current = setTimeout(() => {
      setFocused(false)
    }, 180)
  }

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto', position: 'relative', zIndex: 1, isolation: 'isolate' }}>
      <form
        onSubmit={onSubmit}
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 14,
          borderRadius: 18,
          background: 'linear-gradient(145deg,rgba(16,16,19,.92),rgba(8,8,10,.75))',
          border: `1px solid ${focused ? T.gnB : 'rgba(255,255,255,.08)'}`,
          boxShadow: focused ? `0 0 0 1px ${T.gnB}, 0 20px 60px rgba(0,0,0,.55)` : '0 20px 60px rgba(0,0,0,.45)',
          transition: 'border-color .2s, box-shadow .2s',
          overflow: 'visible',
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
              borderRadius: showDropdown ? '16px 16px 0 0' : 16,
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
            {loadingTrack ? '…' : isUrl ? 'Submit' : 'Go'} →
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
              top: '100%',
              marginTop: -1.5,
              zIndex: 2000,
              borderRadius: '0 0 16px 16px',
              background: '#fff',
              border: `1.5px solid ${focused ? 'rgba(30,215,96,.45)' : 'rgba(255,255,255,.1)'}`,
              borderTop: 'none',
              boxShadow: '0 20px 50px rgba(0,0,0,.45)',
              maxHeight: typeof window !== 'undefined' ? Math.min(380, window.innerHeight * 0.48) : 380,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              isolation: 'isolate',
            }}
          >
            <div
              className="hero-search-results-scroll"
              style={{
                overflowY: 'auto',
                flex: 1,
                padding: '4px 0',
              }}
            >
              {isUrl ? (
                <button
                  type="button"
                  disabled={loadingTrack}
                  aria-label={isLoggedIn ? 'Submit track and continue' : 'Submit track and sign in to continue'}
                  onClick={() => runUrlAction(trimmed)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 16px',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,0,0,.06)',
                    background: '#fff',
                    cursor: loadingTrack ? 'wait' : 'pointer',
                    transition: 'background .15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!loadingTrack) e.currentTarget.style.background = 'rgba(124,58,237,.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#fff'
                  }}
                >
                  {urlPeek?.loading ? (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: '#e5e7eb', flexShrink: 0 }} />
                  ) : urlPeek?.artworkUrl ? (
                    <img
                      src={urlPeek.artworkUrl}
                      alt=""
                      width={56}
                      height={56}
                      style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: '#e8e4f0',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                      }}
                    >
                      🎵
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Paste Spotify link
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#3d2266', marginBottom: 2, lineHeight: 1.25 }}>
                      {urlPeek?.title?.trim() || 'Track preview'}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#5c6570' }}>
                      {urlPeek?.artist?.trim()
                        ? `By ${urlPeek.artist} · `
                        : ''}
                      {isLoggedIn ? 'Click anywhere here or Submit to load into Playlist Push.' : 'Click anywhere here or Submit to sign in and continue.'}
                    </div>
                  </div>
                </button>
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
                    gap: 14,
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 16px',
                    border: 'none',
                    background: i === activeIdx ? 'rgba(124,58,237,.1)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(0,0,0,.06)',
                    transition: 'background .12s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (i !== activeIdx) e.currentTarget.style.background = 'rgba(124,58,237,.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = i === activeIdx ? 'rgba(124,58,237,.1)' : 'transparent'
                  }}
                >
                  {t.artworkUrl ? (
                    <img src={t.artworkUrl} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,.12)' }} />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 6,
                        background: '#e5e7eb',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                      }}
                    >
                      🎵
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <SpotifyBadge />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#3d2266', marginBottom: 2, letterSpacing: '-.01em' }}>{t.title}</div>
                    <div style={{ fontSize: 12.5, color: '#5c6570' }}>By {t.artist || 'Unknown artist'}</div>
                  </div>
                </button>
              ))}
            </div>

            <div
              style={{
                padding: '12px 16px 14px',
                borderTop: '1px solid rgba(0,0,0,.07)',
                background: 'linear-gradient(180deg, #ebe4f8 0%, #e4dcf5 100%)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>
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
                      setQuery(p)
                      runUrlAction(p)
                    }
                  }}
                  onMouseDown={clearBlurTimer}
                  onFocus={clearBlurTimer}
                  placeholder="Paste Spotify link"
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
                  const p = pasteLink.trim()
                  if (!p) return
                  setQuery(p)
                  runUrlAction(p)
                }}
                style={{ width: '100%', marginTop: 10, padding: '10px 14px', fontSize: 13, borderRadius: 10, justifyContent: 'center' }}
              >
                {pasteIsTrackUrl
                  ? isLoggedIn
                    ? 'Submit pasted link →'
                    : 'Submit to continue →'
                  : isLoggedIn
                    ? 'Load pasted link →'
                    : 'Continue with link →'}
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
              if (isUrl) runUrlAction(trimmed)
              else setPage('get-started')
            }}
            style={{ flex: 1, padding: '14px 22px', fontSize: 15.5, minWidth: 130 }}
          >
            {isUrl ? (isLoggedIn ? 'Submit & continue' : 'Submit & sign in') : 'Get Started'}{' '}
            <span className="arr">→</span>
          </button>
        )}
        <ExclusiveLaneOffer setPage={setPage} isLoggedIn={isLoggedIn} />
        <button type="button" className="bs" onClick={() => setPage('subscriptions')} style={{ flex: 1, padding: '14px 22px', fontSize: 15.5, minWidth: 100 }}>
          Pricing
        </button>
      </div>
    </div>
  )
}
