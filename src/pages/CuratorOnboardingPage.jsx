import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { supabase, isDemo } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { hasSpotifyClientId, isSpotifyConnected, startSpotifyAuth } from '../lib/spotifyAuth.js'
import { extractPlaylistId } from '../lib/spotify.js'

const GENRE_OPTS = ['Hip-Hop', 'R&B', 'Electronic', 'Indie', 'Pop', 'Lo-Fi', 'Latin', 'Afrobeats', 'Soul']
const PLATFORM_OPTS = ['Spotify', 'Apple Music', 'TikTok', 'Instagram', 'YouTube']
const TURNAROUND = ['24h', '48h', '72h', '5 days', '7 days']

function Chip({ on, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 12px',
        borderRadius: 999,
        border: `1px solid ${on ? T.gnB : T.b1}`,
        background: on ? T.gnGl : 'rgba(255,255,255,.03)',
        color: on ? T.gn : T.g200,
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
        transition: 'all .12s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function Card({ title, desc, children, right }) {
  return (
    <div style={{ background: `linear-gradient(145deg,${T.card},#0d0d10)`, border: `1px solid ${T.b0}`, borderRadius: 16, padding: '18px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 14.5, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12.5, color: T.g300, lineHeight: 1.55 }}>{desc}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function CuratorOnboardingPage({ setPage }) {
  const { user, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [playlistSubCount, setPlaylistSubCount] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [gate, setGate] = useState({ active: true, allowed_genres: [], min_credits: 0, max_auto_add_per_day: 50 })

  const alreadyDone = !!user?.profile?.curator_onboarded

  const [form, setForm] = useState({
    display_name: user?.profile?.display_name || '',
    bio: '',
    genres: ['Hip-Hop'],
    platforms: ['Spotify'],
    turnaround: '48h',
    price_credits: 2,
    open_for_submissions: true,
    rules: '',
    instagram_url: '',
    twitter_url: '',
    spotify_profile_url: '',
  })

  useEffect(() => {
    setForm((p) => ({ ...p, display_name: user?.profile?.display_name || p.display_name }))
  }, [user?.profile?.display_name])

  const toggleArray = (key, value) => {
    setForm((p) => {
      const arr = Array.isArray(p[key]) ? p[key] : []
      const on = arr.includes(value)
      return { ...p, [key]: on ? arr.filter((x) => x !== value) : [...arr, value] }
    })
  }

  const spotifyOk = isSpotifyConnected()
  const spotifyConfigured = hasSpotifyClientId()

  const loadPlaylistSubmissionCount = async () => {
    if (!supabase || !user?.id) return
    const { count } = await supabase
      .from('playlist_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('curator_id', user.id)
    setPlaylistSubCount(typeof count === 'number' ? count : 0)
  }

  useEffect(() => {
    if (isDemo) return
    void loadPlaylistSubmissionCount()
  }, [user?.id])

  const loadMyPlaylists = async () => {
    if (!supabase || !user?.id) return
    const { data } = await supabase
      .from('curator_playlists')
      .select('id,name,spotify_url,spotify_playlist_id,auto_add_enabled,genre,active')
      .eq('curator_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setPlaylists(data || [])
  }

  const loadGate = async () => {
    if (!supabase || !user?.id) return
    const { data } = await supabase
      .from('curator_submission_gates')
      .select('*')
      .eq('curator_id', user.id)
      .maybeSingle()
    if (data) {
      setGate({
        active: !!data.active,
        allowed_genres: Array.isArray(data.allowed_genres) ? data.allowed_genres : [],
        min_credits: Number(data.min_credits || 0),
        max_auto_add_per_day: Number(data.max_auto_add_per_day || 50),
      })
    }
  }

  useEffect(() => {
    if (isDemo) return
    if (!user?.id) return
    void loadMyPlaylists()
    void loadGate()
  }, [user?.id])

  const saveGate = async () => {
    setErr('')
    if (isDemo) return
    if (!supabase || !user?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('curator_submission_gates')
        .upsert({
          curator_id: user.id,
          active: !!gate.active,
          allowed_genres: gate.allowed_genres,
          min_credits: Number(gate.min_credits || 0),
          max_auto_add_per_day: Number(gate.max_auto_add_per_day || 50),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'curator_id' })
      if (error) { setErr(error.message || 'Could not save gates'); return }
      await loadGate()
    } finally {
      setSaving(false)
    }
  }

  const toggleAutoAdd = async (pl) => {
    setErr('')
    if (isDemo) return
    if (!supabase || !user?.id) return
    const spotifyPlaylistId = pl.spotify_playlist_id || extractPlaylistId(pl.spotify_url) || null
    const { error } = await supabase
      .from('curator_playlists')
      .update({
        auto_add_enabled: !pl.auto_add_enabled,
        spotify_playlist_id: spotifyPlaylistId,
      })
      .eq('id', pl.id)
    if (error) { setErr(error.message || 'Could not update playlist'); return }
    await loadMyPlaylists()
  }

  const progress = useMemo(() => {
    const profileOk = !!String(form.display_name || '').trim() && String(form.bio || '').trim().length >= 30
    const playlistOk = (playlistSubCount ?? 0) > 0
    const spotify = spotifyOk
    const doneCount = (profileOk ? 1 : 0) + (playlistOk ? 1 : 0) + (spotify ? 1 : 0)
    return { profileOk, playlistOk, spotify, doneCount, allDone: profileOk && playlistOk && spotify }
  }, [form.display_name, form.bio, playlistSubCount, spotifyOk])

  const saveProfile = async () => {
    setErr('')
    if (isDemo) return
    if (!supabase || !user?.id) return
    setSaving(true)
    try {
      // Ensure profile role is curator (in case they changed during signup)
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ role: 'curator', display_name: String(form.display_name || '').trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (pErr) { setErr(pErr.message || 'Could not update profile'); return }

      // Upsert curator_profiles row keyed by user id.
      const { error } = await supabase
        .from('curator_profiles')
        .upsert({
          id: user.id,
          display_name: String(form.display_name || '').trim(),
          bio: String(form.bio || '').trim() || null,
          genres: form.genres,
          platforms: form.platforms,
          turnaround: form.turnaround,
          price_credits: Number(form.price_credits) || 2,
          open_for_submissions: !!form.open_for_submissions,
          rules: String(form.rules || '').trim() || null,
          instagram_url: String(form.instagram_url || '').trim() || null,
          twitter_url: String(form.twitter_url || '').trim() || null,
          spotify_profile_url: String(form.spotify_profile_url || '').trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      if (error) { setErr(error.message || 'Could not save curator profile'); return }
      await refreshProfile()
    } finally {
      setSaving(false)
    }
  }

  const finish = async () => {
    setErr('')
    if (isDemo) { setPage('curator'); return }
    if (!supabase || !user?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ curator_onboarded: true, onboarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) { setErr(error.message || 'Could not save onboarding state'); return }
      await refreshProfile()
      setPage('curator')
    } finally {
      setSaving(false)
    }
  }

  const input = {
    width: '100%',
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${T.b1}`,
    borderRadius: 12,
    padding: '11px 13px',
    color: T.w,
    fontSize: 13.5,
    outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,5,6,.92)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${T.b0}` }}>
        <div className="se-shell" style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark onClick={() => setPage('home')} size={26} />
          <button type="button" className="bt" onClick={() => setPage('curator')} style={{ fontSize: 13 }}>Skip</button>
        </div>
      </div>

      <div className="se-shell" style={{ maxWidth: 820, padding: '28px 16px 72px' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Curator onboarding
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4.2vw,34px)', fontWeight: 950, letterSpacing: '-.03em', marginBottom: 10 }}>
            Get approved and start earning
          </h1>
          <p style={{ fontSize: 14, color: T.g200, lineHeight: 1.65, maxWidth: 620, margin: '0 auto' }}>
            Create a clean curator profile, connect Spotify for auto-insert, and submit at least one playlist for review.
          </p>
        </div>

        {alreadyDone && (
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.gnB}`, background: T.gnGl, color: T.gn, fontWeight: 800, fontSize: 13 }}>
            ✓ You’ve already completed onboarding. You can continue to your dashboard.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 12, alignItems: 'start' }}>
          <Card
            title="1) Curator profile"
            desc="Artists decide in seconds. Make your niche obvious and your rules clear."
            right={
              <div style={{ fontSize: 12, fontWeight: 900, color: progress.profileOk ? T.gn : T.g300 }}>
                {progress.profileOk ? '✓ Ready' : 'Needs info'}
              </div>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Display name</div>
                <input style={input} value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} placeholder="e.g. VibeCheck Radio" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Bio</div>
                <textarea style={{ ...input, resize: 'vertical', minHeight: 92, lineHeight: 1.55 }} value={form.bio} onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))} placeholder="What vibe do you curate? Who is it for? What do you accept/decline fast?" />
                <div style={{ fontSize: 11.5, color: T.g400, marginTop: 6 }}>
                  Tip: aim for 2–3 sentences (30+ chars).
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Turnaround</div>
                <select style={{ ...input, cursor: 'pointer' }} value={form.turnaround} onChange={(e) => setForm((p) => ({ ...p, turnaround: e.target.value }))}>
                  {TURNAROUND.map((t) => <option key={t} value={t} style={{ background: T.bg }}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Price (credits)</div>
                <select style={{ ...input, cursor: 'pointer' }} value={String(form.price_credits)} onChange={(e) => setForm((p) => ({ ...p, price_credits: parseInt(e.target.value, 10) || 2 }))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)} style={{ background: T.bg }}>{n}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Genres</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {GENRE_OPTS.map((g) => (
                    <Chip key={g} on={form.genres.includes(g)} label={g} onClick={() => toggleArray('genres', g)} />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Platforms</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {PLATFORM_OPTS.map((p2) => (
                    <Chip key={p2} on={form.platforms.includes(p2)} label={p2} onClick={() => toggleArray('platforms', p2)} />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Rules (shown to artists)</div>
                <textarea style={{ ...input, resize: 'vertical', minHeight: 70, lineHeight: 1.55 }} value={form.rules} onChange={(e) => setForm((p) => ({ ...p, rules: e.target.value }))} placeholder="Be specific: genre constraints, follower minimums, explicit content, etc." />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Instagram</div>
                <input style={input} value={form.instagram_url} onChange={(e) => setForm((p) => ({ ...p, instagram_url: e.target.value }))} placeholder="https://…" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Twitter / X</div>
                <input style={input} value={form.twitter_url} onChange={(e) => setForm((p) => ({ ...p, twitter_url: e.target.value }))} placeholder="https://…" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Spotify profile</div>
                <input style={input} value={form.spotify_profile_url} onChange={(e) => setForm((p) => ({ ...p, spotify_profile_url: e.target.value }))} placeholder="https://open.spotify.com/user/…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="bp" disabled={saving} onClick={saveProfile} style={{ padding: '10px 16px', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save curator profile →'}
              </button>
              <div style={{ fontSize: 12.5, color: T.g300 }}>
                {progress.profileOk ? 'Looks good.' : 'Add a stronger bio to get approved faster.'}
              </div>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card
              title="2) Connect Spotify"
              desc="Required for DailyPlaylists-style auto-insert. We request playlist write access."
              right={<div style={{ fontSize: 12, fontWeight: 900, color: progress.spotify ? '#1ed760' : T.g300 }}>{progress.spotify ? '✓ Connected' : 'Not connected'}</div>}
            >
              <div style={{ fontSize: 12.5, color: T.g200, lineHeight: 1.6 }}>
                Connect Spotify so submissions can auto-add to playlists you enable below.
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="bp" disabled={!spotifyConfigured} onClick={() => void startSpotifyAuth()} style={{ padding: '10px 16px', fontSize: 13, opacity: spotifyConfigured ? 1 : 0.6 }}>
                  {progress.spotify ? 'Reconnect Spotify' : 'Connect Spotify'} <span className="arr">→</span>
                </button>
                <button className="bt" onClick={loadMyPlaylists} style={{ padding: '10px 14px', fontSize: 13 }}>Refresh playlists</button>
              </div>
              {!spotifyConfigured && (
                <div style={{ marginTop: 10, fontSize: 12, color: T.gold, lineHeight: 1.55 }}>
                  Missing <span className="mono">VITE_SPOTIFY_CLIENT_ID</span>. Add it in Netlify env vars and redeploy.
                </div>
              )}

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.b0}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Auto-add eligible playlists</div>
                {playlists.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: T.g300, lineHeight: 1.6 }}>
                    No curator playlists yet. Add playlists in your Curator dashboard first.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        className="bt"
                        onClick={() => void toggleAutoAdd(pl)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: `1px solid ${T.b0}`,
                          background: pl.auto_add_enabled ? 'rgba(127,255,0,.06)' : 'rgba(255,255,255,.02)',
                          color: pl.auto_add_enabled ? T.gn : T.g200,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 13.5, color: T.w, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pl.name || 'Playlist'}
                          </div>
                          <div style={{ fontSize: 11.5, color: T.g300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pl.spotify_playlist_id ? `Spotify ID: ${pl.spotify_playlist_id}` : (pl.spotify_url || 'No Spotify URL')}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: pl.auto_add_enabled ? T.gn : T.g300 }}>
                          {pl.auto_add_enabled ? 'Enabled' : 'Disabled'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.b0}` }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Submission gates</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Min credits</div>
                    <input style={input} value={String(gate.min_credits)} onChange={(e) => setGate((p) => ({ ...p, min_credits: parseInt(e.target.value || '0', 10) || 0 }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Max auto-add/day</div>
                    <input style={input} value={String(gate.max_auto_add_per_day)} onChange={(e) => setGate((p) => ({ ...p, max_auto_add_per_day: parseInt(e.target.value || '50', 10) || 50 }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Allowed genres (empty = allow all)</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {GENRE_OPTS.map((g) => (
                        <Chip key={g} on={gate.allowed_genres.includes(g)} label={g} onClick={() => setGate((p) => ({ ...p, allowed_genres: p.allowed_genres.includes(g) ? p.allowed_genres.filter((x) => x !== g) : [...p.allowed_genres, g] }))} />
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="bp" disabled={saving} onClick={() => void saveGate()} style={{ padding: '10px 16px', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving…' : 'Save gates →'}
                  </button>
                  <div style={{ fontSize: 12.5, color: T.g300 }}>
                    Gate rules control which submissions get auto-added.
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="3) Submit a playlist"
              desc="Your playlist is reviewed before it’s listed in the marketplace."
              right={<div style={{ fontSize: 12, fontWeight: 900, color: progress.playlistOk ? T.gn : T.g300 }}>{progress.playlistOk ? '✓ Submitted' : 'Not submitted'}</div>}
            >
              <div style={{ fontSize: 12.5, color: T.g200, lineHeight: 1.6 }}>
                Submit at least one playlist so you can start receiving submissions.
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="bp" onClick={() => setPage('submit-playlist')} style={{ padding: '10px 16px', fontSize: 13 }}>
                  Submit playlist <span className="arr">→</span>
                </button>
                <button className="bt" onClick={loadPlaylistSubmissionCount} style={{ padding: '10px 14px', fontSize: 13 }}>
                  Refresh
                </button>
              </div>
            </Card>

            {err && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.22)', color: T.red, fontSize: 13 }}>
                {err}
              </div>
            )}

            <div style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${T.b0}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: T.g300, marginBottom: 10 }}>
                Progress: <span style={{ fontWeight: 950, color: T.w }}>{progress.doneCount}/3</span>
              </div>
              <button
                className="bp"
                disabled={saving || (!progress.allDone && !alreadyDone)}
                onClick={finish}
                style={{ width: '100%', padding: '12px 0', fontSize: 14, opacity: (saving || (!progress.allDone && !alreadyDone)) ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : 'Finish onboarding →'}
              </button>
              {!progress.allDone && !alreadyDone && (
                <div style={{ marginTop: 10, fontSize: 12, color: T.g400, lineHeight: 1.55 }}>
                  You can finish once your curator profile is saved, Spotify is connected, and at least one playlist is submitted.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

