import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { dbInsert, isDemo } from '../lib/supabase.js'
import { fetchSpotifyPlaylist, isSpotifyPlaylistUrl } from '../lib/spotify.js'

const GENRE_OPTIONS = ['Hip-Hop', 'R&B', 'Electronic', 'Indie', 'Pop', 'Lo-Fi', 'Latin', 'Afrobeats', 'Soul', 'Country', 'Jazz']
const ACCENT_MAP = {
  'Hip-Hop':'#7fff00','R&B':'#ec4899','Electronic':'#a78bfa',
  'Indie':'#38bdf8','Pop':'#f59e0b','Lo-Fi':'#f59e0b',
  'Latin':'#fb923c','Afrobeats':'#f59e0b','Soul':'#ec4899',
}
const SUB_TYPES = ['Free', 'Paid', 'Invite Only']
const TYPE_DESCS = {
  Free: 'Artists can submit at no cost. Great for building volume.',
  Paid: 'Artists pay credits to submit. You earn a payout per review.',
  'Invite Only': 'Only artists you invite can submit. Private placement.',
}

/* ── Styled field wrapper ── */
function Field({ label, required, children, hint }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:700, color:T.g200, marginBottom:7 }}>
        {label} {required && <span style={{ color:T.red }}>*</span>}
        {hint && <span style={{ color:T.g400, fontWeight:400, marginLeft:6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width:'100%', background:`linear-gradient(145deg,#101013,#0d0d10)`,
  border:`1px solid rgba(255,255,255,.1)`, borderRadius:10, padding:'10px 14px',
  color:'#fff', fontSize:13.5, outline:'none', boxSizing:'border-box', transition:'border .15s',
  fontFamily:'inherit',
}

export default function SubmitPlaylistPage({ setPage }) {
  const { user } = useAuth()
  const toast = useToast()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive:true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const [spotUrl,     setSpotUrl]    = useState('')
  const [importing,   setImporting]  = useState(false)
  const [importMsg,   setImportMsg]  = useState(null)
  const [importedArt, setImportedArt] = useState(null)
  const [form, setForm] = useState({
    name: '', genre: 'Hip-Hop', platform: 'Spotify', description: '', type: 'Free', followers: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const field = (k, v) => setForm(p => ({ ...p, [k]:v }))

  const handleImport = async () => {
    const url = spotUrl.trim()
    if (!isSpotifyPlaylistUrl(url)) {
      setImportMsg({ ok:false, text:'Paste a Spotify playlist URL: open.spotify.com/playlist/…' })
      return
    }
    setImporting(true)
    setImportMsg(null)
    try {
      const meta = await fetchSpotifyPlaylist(url)
      if (meta) {
        setForm(p => ({
          ...p,
          name: meta.name || p.name,
          followers: meta.followers != null
            ? (meta.followers >= 1000 ? `${(meta.followers/1000).toFixed(1)}K` : String(meta.followers))
            : p.followers,
        }))
        if (meta.artworkUrl) setImportedArt(meta.artworkUrl)
        setImportMsg({ ok:true, text:`✓ Imported: ${meta.name || 'Playlist'}` })
      } else {
        setImportMsg({ ok:false, text:"Couldn't fetch playlist info — fill in below" })
      }
    } catch {
      setImportMsg({ ok:false, text:'Import failed — check URL or fill in manually' })
    } finally {
      setImporting(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Playlist name is required', 'Missing field')
      return
    }
    setSubmitting(true)
    try {
      if (!isDemo) {
        const row = {
          curator_id:      user?.id || null,
          name:            form.name.trim(),
          spotify_url:     spotUrl.trim() || null,
          genre:           form.genre,
          description:     form.description.trim() || null,
          submission_type: form.type,
          status:          'pending',
        }
        const { error } = await dbInsert('playlist_submissions', row)
        if (error) {
          toast.error(error.message, 'Submission failed')
          setSubmitting(false)
          return
        }
      }
      setDone(true)
      toast.success(`${form.name} submitted for review`, 'Playlist submitted!')
    } catch (e) {
      toast.error(e.message || 'Submission failed — please try again', 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />
      <div style={{ maxWidth:600, margin:'0 auto', padding:'88px 24px 60px' }}>

        {done ? (
          /* ── Success ── */
          <div style={{ textAlign:'center', padding:'60px 0', animation:'fadeUp .4s ease both' }}>
            <div style={{ width:72, height:72, borderRadius:20, background:'rgba(255,199,64,.12)',
                          border:'1.5px solid rgba(255,199,64,.3)', display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:32, margin:'0 auto 24px',
                          animation:'successBounce .5s ease both' }}>
              🎶
            </div>
            <h2 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>Playlist Submitted!</h2>
            <p style={{ fontSize:14, color:T.g300, marginBottom:32, maxWidth:380, margin:'0 auto 32px' }}>
              <strong style={{ color:T.w }}>{form.name}</strong> is now under review.
              You'll be notified once it's listed on StreamEngine.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={() => setPage('curator')} className="bp" style={{ padding:'12px 28px', fontSize:14 }}>
                Go to Dashboard <span className="arr">→</span>
              </button>
              <button onClick={() => { setDone(false); setForm({ name:'', genre:'Hip-Hop', platform:'Spotify', description:'', type:'Free', followers:'' }); setSpotUrl(''); setImportedArt(null) }}
                className="bs" style={{ padding:'12px 24px', fontSize:14 }}>
                Submit Another
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Page header */}
            <div style={{ marginBottom:32 }}>
              <button onClick={() => setPage('home')}
                style={{ display:'inline-flex', alignItems:'center', gap:6, background:'none', border:'none',
                         cursor:'pointer', color:T.g300, fontSize:13, fontWeight:600, marginBottom:20,
                         padding:0, transition:'color .15s' }}
                onMouseEnter={e => e.currentTarget.style.color = T.w}
                onMouseLeave={e => e.currentTarget.style.color = T.g300}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M13 8H3M7 12l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back to home
              </button>
              <h1 style={{ fontSize:28, fontWeight:900, letterSpacing:'-.02em', marginBottom:8 }}>
                Submit a Playlist
              </h1>
              <p style={{ fontSize:14, color:T.g300, lineHeight:1.6 }}>
                List your playlist on StreamEngine so artists can submit tracks directly to you.
                Earn credits for every track you review.
              </p>
            </div>

            {/* Spotify import (optional) */}
            <div style={{ background:'rgba(30,215,96,.04)', border:'1px solid rgba(30,215,96,.14)',
                          borderRadius:14, padding:'16px 18px', marginBottom:28 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#1ed760', marginBottom:10,
                            display:'flex', alignItems:'center', gap:6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1ed760">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                Auto-fill from Spotify (optional)
              </div>
              {importedArt && (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 13px',
                              background:'rgba(30,215,96,.06)', border:'1px solid rgba(30,215,96,.18)',
                              borderRadius:10, marginBottom:12 }}>
                  <img src={importedArt} alt="" style={{ width:40, height:40, borderRadius:7, objectFit:'cover' }} />
                  <div>
                    <div style={{ fontWeight:700, fontSize:13.5 }}>{form.name}</div>
                    {form.followers && <div style={{ fontSize:11.5, color:T.g300 }}>{form.followers} followers</div>}
                    <div style={{ fontSize:11, color:'#1DB954', fontWeight:600 }}>✓ Imported from Spotify</div>
                  </div>
                </div>
              )}
              <div style={{ display:'flex', gap:8 }}>
                <input value={spotUrl} onChange={e => setSpotUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleImport()}
                  placeholder="open.spotify.com/playlist/…"
                  style={{ flex:1, background:'rgba(255,255,255,.05)', border:`1px solid ${T.b1}`,
                           borderRadius:9, padding:'9px 13px', color:T.w, fontSize:13,
                           outline:'none', transition:'border .15s', fontFamily:'inherit' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(30,215,96,.5)'}
                  onBlur={e => e.target.style.borderColor = T.b1}
                />
                <button onClick={handleImport} disabled={importing}
                  style={{ padding:'9px 18px', borderRadius:9, background:'rgba(30,215,96,.15)',
                           border:'1px solid rgba(30,215,96,.3)', color:'#1ed760',
                           fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0, opacity: importing ? .6 : 1 }}>
                  {importing
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation:'spin .7s linear infinite', display:'block' }}>
                        <circle cx="12" cy="12" r="10" stroke="rgba(30,215,96,.3)" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#1ed760" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    : 'Import'
                  }
                </button>
              </div>
              {importMsg && (
                <div style={{ marginTop:8, fontSize:12, fontWeight:600,
                              color: importMsg.ok ? '#1ed760' : T.red }}>{importMsg.text}</div>
              )}
            </div>

            {/* Form */}
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

              <Field label="Playlist Name" required>
                <input value={form.name} onChange={e => field('name', e.target.value)}
                  placeholder="e.g. Late Night Vibes"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = T.gnB}
                  onBlur={e => e.target.style.borderColor = T.b1}
                />
              </Field>

              <Field label="Follower Count" hint="(approximate)">
                <input value={form.followers} onChange={e => field('followers', e.target.value)}
                  placeholder="e.g. 8.2K or 8200"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = T.gnB}
                  onBlur={e => e.target.style.borderColor = T.b1}
                />
              </Field>

              <Field label="Primary Genre">
                <div className="scroll-x" style={{ display:'flex', gap:6 }}>
                  {GENRE_OPTIONS.map(g => {
                    const ac = ACCENT_MAP[g] || T.gn
                    return (
                      <button key={g} onClick={() => field('genre', g)}
                        style={{ flexShrink:0, padding:'7px 14px', borderRadius:20, border:'none',
                                 cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s',
                                 background: form.genre === g ? `${ac}20` : 'rgba(255,255,255,.05)',
                                 color: form.genre === g ? ac : T.g300,
                                 boxShadow: form.genre === g ? `0 0 0 1px ${ac}50` : 'none' }}>
                        {g}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field label="Platform">
                <div style={{ display:'flex', gap:8 }}>
                  {['Spotify','Apple Music','TikTok','YouTube','Instagram'].map(pl => (
                    <button key={pl} onClick={() => field('platform', pl)}
                      style={{ padding:'8px 14px', borderRadius:10, cursor:'pointer',
                               fontSize:12.5, fontWeight:700, transition:'all .15s', flexShrink:0,
                               background: form.platform === pl ? 'rgba(127,255,0,.1)' : 'rgba(255,255,255,.04)',
                               border: form.platform === pl ? `1.5px solid ${T.gnB}` : `1px solid ${T.b0}`,
                               color: form.platform === pl ? T.gn : T.g300 }}>
                      {pl}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Description" hint="(shown to artists)">
                <textarea value={form.description} onChange={e => field('description', e.target.value)}
                  placeholder="Tell artists what kind of tracks you're looking for…"
                  rows={3}
                  style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }}
                  onFocus={e => e.target.style.borderColor = T.gnB}
                  onBlur={e => e.target.style.borderColor = T.b1}
                />
              </Field>

              <Field label="Submission Type">
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {SUB_TYPES.map(type => (
                    <button key={type} onClick={() => field('type', type)}
                      style={{ flex:1, minWidth:100, padding:'11px 12px', borderRadius:10, cursor:'pointer',
                               fontSize:13, fontWeight:700, transition:'all .15s',
                               background: form.type === type ? 'rgba(127,255,0,.1)' : 'rgba(255,255,255,.04)',
                               border: form.type === type ? `1.5px solid ${T.gnB}` : `1px solid ${T.b0}`,
                               color: form.type === type ? T.gn : T.g200 }}>
                      {type === 'Free' ? '🆓' : type === 'Paid' ? '💰' : '🔒'} {type}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:12, color:T.g300 }}>{TYPE_DESCS[form.type]}</div>
              </Field>

            </div>

            {/* Submit */}
            <div style={{ marginTop:32, paddingTop:24, borderTop:`1px solid ${T.b0}` }}>
              <button className="bp" onClick={handleSubmit} disabled={submitting || !form.name.trim()}
                style={{ padding:'14px 36px', fontSize:15 }}>
                {submitting
                  ? <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:14, height:14, border:'2px solid rgba(0,0,0,.3)',
                                     borderTop:'2px solid #000', borderRadius:'50%',
                                     animation:'spin .7s linear infinite', display:'inline-block' }} />
                      Submitting…
                    </span>
                  : <>Submit Playlist for Review <span className="arr">→</span></>
                }
              </button>
              <p style={{ fontSize:12, color:T.g400, marginTop:12 }}>
                Our team reviews all submissions within 48 hours. You'll be notified by email.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
