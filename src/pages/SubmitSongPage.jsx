import { useEffect, useState } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { SpotifySearchBar } from '../components/common/Atoms.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { fetchSpotifyTrack, isSpotifyTrackUrl } from '../lib/spotify.js'
import { setPendingSubmission, normalizePendingSong } from '../lib/pendingSubmission.js'
import { isDemo } from '../lib/supabase.js'

export default function SubmitSongPage({ setPage }) {
  const { isLoggedIn } = useAuth()
  const toast = useToast()
  const [scrolled, setScrolled] = useState(false)
  const [query, setQuery] = useState('')
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const isUrl = isSpotifyTrackUrl(query.trim()) || query.includes('spotify:track')

  const submit = async () => {
    const spotifyUrl = query.trim()
    setError('')
    if (!isUrl) { setError('Paste a Spotify track link to continue.'); return }
    setFetching(true)
    try {
      const track = await fetchSpotifyTrack(spotifyUrl)
      if (!track) {
        setError('Could not load metadata. Run npm run dev (backend on port 3333) and try again.')
        return
      }
      const song = normalizePendingSong(track)
      setPendingSubmission({
        source: 'submit-song',
        intent: 'playlist_push',
        resumeAfterAuth: true,
        status: 'metadata-ready',
        song,
      })
      toast.success('Track loaded', 'Ready for Playlist Push')
      setPage(isLoggedIn ? 'artist' : 'auth')
    } catch (e) {
      setError(e?.message || 'Could not load track metadata')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />
      <div style={{ maxWidth:900, margin:'0 auto', padding:'110px 24px 80px' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'6px 12px', borderRadius:999, background:'rgba(255,255,255,.04)', border:`1px solid ${T.b0}`, color:T.g200, fontWeight:900, fontSize:11.5, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:16 }}>
          Submit song
          {isDemo && <span style={{ color:T.gold }}>Demo</span>}
        </div>
        <h1 style={{ fontSize:'clamp(26px,4.4vw,40px)', fontWeight:900, letterSpacing:'-.03em', marginBottom:10 }}>Paste a Spotify track link</h1>
        <p style={{ color:T.g200, fontSize:15, marginBottom:22, maxWidth:640, lineHeight:1.7 }}>
          This is the single source of truth for submissions. We’ll fetch metadata, save it, and continue you into Playlist Push.
        </p>

        <div style={{ background:`linear-gradient(145deg,${T.card},#0d0d10)`, border:`1px solid ${T.b0}`, borderRadius:18, padding:'18px 18px' }}>
          <form onSubmit={(e) => { e.preventDefault(); submit() }}>
            <SpotifySearchBar
              value={query}
              onChange={v => setQuery(v)}
              placeholder="https://open.spotify.com/track/…"
              focused={false}
              setFocused={() => {}}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
              <button className="bp" type="submit" disabled={fetching} style={{ padding:'11px 16px', borderRadius:12, fontSize:14, opacity: fetching ? 0.7 : 1 }}>
                {fetching ? 'Loading…' : 'Start'}
              </button>
            </div>
          </form>
          {error && (
            <div style={{ marginTop:12, padding:'10px 12px', borderRadius:12, background:'rgba(255,64,96,.08)', border:'1px solid rgba(255,64,96,.22)', color:T.red, fontSize:13, fontWeight:800 }}>
              ⚠ {error}
            </div>
          )}
          <div style={{ marginTop:12, fontSize:12.5, color:T.g400, lineHeight:1.6 }}>
            {isLoggedIn ? 'You’ll continue into your dashboard to select curators and submit.' : 'You’ll be prompted to sign up or sign in to save your track and continue.'}
          </div>
        </div>
      </div>
    </div>
  )
}

