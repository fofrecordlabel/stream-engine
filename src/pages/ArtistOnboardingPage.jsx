import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { supabase, isDemo } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

function Step({ done, title, desc, children }) {
  return (
    <div style={{ padding: '16px 16px', borderRadius: 14, border: `1px solid ${done ? 'rgba(127,255,0,.25)' : T.b0}`, background: done ? 'rgba(127,255,0,.06)' : 'rgba(255,255,255,.02)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4, color: done ? T.gn : T.w }}>
            {done ? '✓ ' : ''}{title}
          </div>
          <div style={{ fontSize: 12.5, color: T.g300, lineHeight: 1.55 }}>{desc}</div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 10, background: done ? T.gn : 'rgba(255,255,255,.06)', border: `1px solid ${done ? 'rgba(127,255,0,.35)' : T.b0}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: done ? '#000' : T.g200, fontWeight: 900, flexShrink: 0 }}>
          {done ? '✓' : '•'}
        </div>
      </div>
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  )
}

export default function ArtistOnboardingPage({ setPage }) {
  const { user, credits, refreshProfile } = useAuth()
  const [songCount, setSongCount] = useState(null)
  const [campaignCount, setCampaignCount] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const alreadyDone = !!user?.profile?.artist_onboarded

  const loadCounts = async () => {
    if (!supabase || !user?.id) return
    const [{ count: songs }, { count: camps }] = await Promise.all([
      supabase.from('songs').select('id', { count: 'exact', head: true }).eq('artist_id', user.id),
      supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('artist_id', user.id),
    ])
    setSongCount(typeof songs === 'number' ? songs : 0)
    setCampaignCount(typeof camps === 'number' ? camps : 0)
  }

  useEffect(() => {
    if (isDemo) return
    void loadCounts()
  }, [user?.id])

  const steps = useMemo(() => {
    const hasSong = (songCount ?? 0) > 0
    const hasCredits = (credits ?? 0) > 0
    const hasCampaign = (campaignCount ?? 0) > 0
    return { hasSong, hasCredits, hasCampaign, allDone: hasSong && hasCredits && hasCampaign }
  }, [songCount, credits, campaignCount])

  const complete = async () => {
    setErr('')
    if (isDemo) { setPage('artist'); return }
    if (!supabase || !user?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ artist_onboarded: true, onboarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) { setErr(error.message || 'Could not save onboarding state'); return }
      await refreshProfile()
      setPage('artist')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,5,6,.92)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${T.b0}` }}>
        <div className="se-shell" style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark onClick={() => setPage('home')} size={26} />
          <button type="button" className="bt" onClick={() => setPage('artist')} style={{ fontSize: 13 }}>Skip</button>
        </div>
      </div>

      <div className="se-shell" style={{ maxWidth: 720, padding: '28px 16px 72px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: T.g300, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Artist onboarding
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4.2vw,34px)', fontWeight: 950, letterSpacing: '-.03em', marginBottom: 10 }}>
            Launch your first Playlist Push
          </h1>
          <p style={{ fontSize: 14, color: T.g200, lineHeight: 1.65, maxWidth: 560, margin: '0 auto' }}>
            Do these 3 steps once. After that, your dashboard becomes the workflow.
          </p>
        </div>

        {alreadyDone && (
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.gnB}`, background: T.gnGl, color: T.gn, fontWeight: 800, fontSize: 13 }}>
            ✓ You’ve already completed onboarding. You can continue to your dashboard.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Step
            done={steps.hasSong}
            title="Add your first song"
            desc="Import from Spotify or add manually so you can submit to curators."
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" onClick={() => setPage('submit-song')} style={{ padding: '10px 16px', fontSize: 13 }}>
                Add song <span className="arr">→</span>
              </button>
              <button className="bt" onClick={() => setPage('home')} style={{ padding: '10px 14px', fontSize: 13 }}>
                Search Spotify on Home
              </button>
            </div>
          </Step>

          <Step
            done={steps.hasCredits}
            title="Get credits"
            desc="Credits fund curator submissions. Buy a pack or upgrade."
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" onClick={() => setPage('subscriptions')} style={{ padding: '10px 16px', fontSize: 13 }}>
                Buy credits <span className="arr">→</span>
              </button>
              <div style={{ fontSize: 12.5, color: T.g300, display: 'flex', alignItems: 'center' }}>
                Current balance: <span className="mono" style={{ marginLeft: 6, color: T.gn, fontWeight: 900 }}>{credits ?? 0}cr</span>
              </div>
            </div>
          </Step>

          <Step
            done={steps.hasCampaign}
            title="Launch a campaign"
            desc="Pick a song, choose curators, send your pitch, and submit."
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" onClick={() => setPage('artist')} style={{ padding: '10px 16px', fontSize: 13 }}>
                Open dashboard <span className="arr">→</span>
              </button>
              <button className="bt" onClick={loadCounts} style={{ padding: '10px 14px', fontSize: 13 }}>
                Refresh progress
              </button>
            </div>
          </Step>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.22)', color: T.red, fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: T.g300 }}>
            Progress: <span style={{ color: T.w, fontWeight: 900 }}>{(steps.hasSong ? 1 : 0) + (steps.hasCredits ? 1 : 0) + (steps.hasCampaign ? 1 : 0)}/3</span>
          </div>
          <button
            className="bp"
            disabled={saving || (!steps.allDone && !alreadyDone)}
            onClick={complete}
            style={{ padding: '12px 18px', fontSize: 14, opacity: (saving || (!steps.allDone && !alreadyDone)) ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Finish onboarding →'}
          </button>
        </div>
      </div>
    </div>
  )
}

