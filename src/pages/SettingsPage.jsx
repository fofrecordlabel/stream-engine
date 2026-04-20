import { useState, useEffect, useMemo } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  isSpotifyConnected,
  startSpotifyAuth,
  clearSpotifyToken,
  hasSpotifyClientId,
  SPOTIFY_TOKEN_UPDATED_EVENT,
  SPOTIFY_TOKEN_CLEARED_EVENT,
} from '../lib/spotifyAuth.js'
import { supabase, isDemo, supabaseConfigErrorMessage } from '../lib/supabase.js'
import { isStripeConfigured } from '../lib/stripe.js'
import { apiFetch } from '../lib/apiClient.js'
import { useCampaigns } from '../hooks/useCampaigns.js'
import {
  countCampaignsSinceLocalWeekMonday,
  FREE_WEEKLY_SUBMISSION_CAP,
  PRO_WEEKLY_SUBMISSION_CAP,
  PREMIUM_WEEKLY_SUBMISSION_CAP,
  getArtistWeeklySubmissionCap,
} from '../lib/submissionQuota.js'
import { isDev, isProd } from '../lib/env.js'

/* ── Shared input style helper ── */
const inputStyle = (focused = false) => ({
  width: '100%',
  background: 'linear-gradient(145deg,#101013,#0d0d10)',
  border: `1px solid ${focused ? T.gnB : T.b1}`,
  borderRadius: 10,
  padding: '10px 14px',
  color: T.w,
  fontSize: 13.5,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border .15s',
  fontFamily: 'inherit',
})

function Field({ label, value, onChange, type = 'text', placeholder, readOnly, hint }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ ...inputStyle(focused), opacity: readOnly ? .55 : 1, cursor: readOnly ? 'default' : 'text' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <div style={{ fontSize: 11.5, color: T.g300, marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 4, hint }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        rows={rows}
        style={{ ...inputStyle(focused), resize: 'vertical', lineHeight: 1.55 }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint && <div style={{ fontSize: 11.5, color: T.g300, marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

/* ── Section card wrapper ── */
function Card({ children, style }) {
  return (
    <div style={{
      background: 'linear-gradient(145deg,#101013,#0d0d10)',
      border: `1px solid ${T.b0}`,
      borderRadius: 16,
      padding: '22px 24px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardTitle({ children }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 800, color: T.w, marginBottom: 18, paddingBottom: 14,
                  borderBottom: `1px solid ${T.b0}` }}>
      {children}
    </div>
  )
}

/* ── Save button with loading/success/error state ── */
function SaveButton({ onSave, label = 'Save Changes' }) {
  const [state, setState] = useState('idle') // idle | saving | saved | error
  const [errMsg, setErrMsg] = useState('')
  const handle = async () => {
    setState('saving')
    setErrMsg('')
    try {
      const result = await onSave?.()
      if (result?.error) {
        setErrMsg(result.error.message || 'Save failed')
        setState('error')
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('saved')
        setTimeout(() => setState('idle'), 2200)
      }
    } catch (e) {
      setErrMsg(e.message || 'Save failed')
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {state === 'error' && (
        <span style={{ fontSize: 12, color: T.red }}>⚠ {errMsg}</span>
      )}
      <button onClick={handle} disabled={state === 'saving'} className="bp"
        style={{ padding: '10px 24px', fontSize: 13.5, opacity: state === 'saving' ? .7 : 1 }}>
        {state === 'saving' && (
          <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,.25)', borderTop: '2px solid #000',
                         borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
        )}
        {state === 'saved' ? '✓ Saved' : state === 'saving' ? 'Saving…' : label}
      </button>
    </div>
  )
}

/* ── Toggle switch ── */
function Toggle({ on, onChange, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.w, marginBottom: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: T.g300 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!on)}
        style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                 background: on ? T.gn : 'rgba(255,255,255,.12)',
                 position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18,
                       borderRadius: '50%', background: on ? '#000' : 'rgba(255,255,255,.6)',
                       transition: 'left .2s', display: 'block' }} />
      </button>
    </div>
  )
}

/* ══════════════════════════
   1. PROFILE SETTINGS
══════════════════════════ */
function ProfileSettings({ user }) {
  const [name,  setName]  = useState(user?.name  || '')
  const [email, setEmail] = useState(user?.email || '')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [highGlow,     setHighGlow]     = useState(true)

  const accentColor = user?.color || T.gn
  const initials    = (user?.name || 'ME').slice(0, 2).toUpperCase()
  const memberSince = user?.profile?.created_at
    ? new Date(user.profile.created_at).toLocaleDateString('en-US', { month:'long', year:'numeric' })
    : '—'

  const saveProfile = async () => {
    if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', user.id)
    return { error }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Avatar card */}
      <Card>
        <CardTitle>Profile Image</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18,
                        background: `linear-gradient(135deg,${accentColor}22,${accentColor}44)`,
                        border: `1.5px solid ${accentColor}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, fontWeight: 800, color: accentColor, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.w, marginBottom: 6 }}>
              {user?.name || 'Artist'}
            </div>
            <div style={{ fontSize: 12, color: T.g300, marginBottom: 12 }}>
              Profile image upload coming soon
            </div>
            <button disabled style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,.06)',
                                       border: `1px solid ${T.b1}`, color: T.g300, fontSize: 12,
                                       fontWeight: 600, cursor: 'not-allowed', opacity: .5 }}>
              Upload Image
            </button>
          </div>
        </div>
      </Card>

      {/* Identity card */}
      <Card>
        <CardTitle>Account Details</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Display Name" value={name} onChange={setName} placeholder="Your name or artist alias" />
          <Field label="Email Address" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
          <Field label="Member Since" value={memberSince} readOnly
            hint="Membership date cannot be changed." />
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
            <SaveButton onSave={saveProfile} />
          </div>
        </div>
      </Card>

      {/* Appearance card */}
      <Card>
        <CardTitle>Appearance</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle
            label="Reduce motion"
            sub="Less animation on buttons and panels"
            on={reduceMotion}
            onChange={(v) => setReduceMotion(v)}
          />
          <Toggle
            label="Glow intensity"
            sub="Softer glow for a calmer look"
            on={highGlow}
            onChange={(v) => setHighGlow(v)}
          />
          <div style={{ fontSize: 12.5, color: T.g300 }}>
            Appearance toggles are demo-safe (they won’t affect persisted styling yet).
          </div>
        </div>
      </Card>

      {/* Danger zone */}
      <Card style={{ border: `1px solid rgba(255,64,96,.18)` }}>
        <CardTitle>Danger Zone</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.w, marginBottom: 3 }}>Delete Account</div>
            <div style={{ fontSize: 12, color: T.g300 }}>Permanently delete your account and all data.</div>
          </div>
          <button disabled style={{ padding: '8px 18px', borderRadius: 9, background: 'rgba(255,64,96,.1)',
                                     border: '1px solid rgba(255,64,96,.25)', color: T.red,
                                     fontSize: 13, fontWeight: 700, cursor: 'not-allowed', opacity: .5 }}>
            Delete Account
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════
   2. WALLET & MEMBERSHIP
══════════════════════════ */
function WalletSettings({ user, credits, role, setPage, campaigns, campaignsLoading }) {
  const isCuratorRole = role === 'curator'
  const accentColor = isCuratorRole ? T.gold : T.gn
  const subTier = user?.profile?.subscription_tier || 'free'
  const planLabel =
    isCuratorRole ? 'Curator' : role === 'admin' ? 'Admin' : subTier === 'pro' ? 'Pro' : subTier === 'premium' ? 'Premium' : 'Free'
  const subMax = role === 'artist' ? getArtistWeeklySubmissionCap(user) : FREE_WEEKLY_SUBMISSION_CAP
  const submissionsUsed = role === 'artist' ? countCampaignsSinceLocalWeekMonday(campaigns || []) : 0
  const submissionsRemaining = Math.max(0, subMax - submissionsUsed)

  const PLANS = [
    {
      id: 'free',
      label: 'Free',
      price: '$0',
      perMonth: 'month',
      features: [
        `Up to ${FREE_WEEKLY_SUBMISSION_CAP} Playlist Push campaigns per week (resets Monday 12:00 AM local)`,
        'Basic analytics',
        'Email support',
      ],
      current: (role === 'artist' && subTier === 'free') || role === 'admin',
    },
    {
      id: 'pro',
      label: 'Pro',
      price: '$30',
      perMonth: 'month',
      features: [
        `Up to ${PRO_WEEKLY_SUBMISSION_CAP} Playlist Push campaigns per week`,
        'Priority placement',
        'Advanced analytics',
        'Direct curator messages',
      ],
      current: role === 'artist' && subTier === 'pro',
    },
    {
      id: 'premium',
      label: 'Premium',
      price: '$59',
      perMonth: 'month',
      features: [
        `Up to ${PREMIUM_WEEKLY_SUBMISSION_CAP} campaigns per week`,
        'Higher curator priority',
        'AI pitch tools',
        'Early inbox insights (rolling)',
      ],
      current: role === 'artist' && subTier === 'premium',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isDev && isDemo && (
        <Card style={{ border: `1px solid rgba(255,199,64,.28)`, background: 'rgba(255,199,64,.06)' }}>
          <div style={{ fontWeight: 800, color: T.gold, marginBottom: 8, fontSize: 14 }}>Local dev — Supabase not configured</div>
          <div style={{ fontSize: 13, color: T.g200, lineHeight: 1.55 }}>
            Add <code style={{ fontSize: 12, color: T.w }}>VITE_SUPABASE_ANON_KEY</code> (and optionally{' '}
            <code style={{ fontSize: 12, color: T.w }}>VITE_SUPABASE_URL</code>) to <code style={{ fontSize: 12, color: T.w }}>.env</code>, restart the dev server, then sign in — each user gets their own rows via RLS.
          </div>
        </Card>
      )}

      {/* Current plan */}
      <Card>
        <CardTitle>Current Plan</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12,
                          background: `${accentColor}14`, border: `1.5px solid ${accentColor}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              {isCuratorRole ? '⭐' : subTier === 'pro' ? '⚡' : subTier === 'premium' ? '💎' : '🆓'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: T.w }}>{planLabel} Plan</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                               background: `${accentColor}18`, color: accentColor,
                               border: `1px solid ${accentColor}28`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Active
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.g300 }}>
                {isCuratorRole
                  ? 'Unlimited curator workflows · Priority placement'
                  : `Up to ${subMax} Playlist Push campaigns weekly · resets every Monday 12:00 AM (your time zone)`}
              </div>
            </div>
          </div>
          {role === 'artist' && subTier === 'free' && (
            <button type="button" onClick={() => setPage('subscriptions')} className="bp"
              style={{ padding: '10px 22px', fontSize: 13.5 }}>
              Upgrade to Pro <span className="arr">→</span>
            </button>
          )}
        </div>
      </Card>

      {/* Submissions + credits */}
      <div style={{ display: 'grid', gridTemplateColumns: role === 'artist' ? '1fr 1fr' : '1fr 1fr', gap: 12 }}>
        {role === 'artist' ? (
          <Card>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.g300, textTransform: 'uppercase',
                          letterSpacing: '.1em', marginBottom: 10 }}>This week (plan cap)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 34, fontWeight: 700, color: T.gn, lineHeight: 1 }}>
                {campaignsLoading ? '…' : submissionsUsed}
              </span>
              <span style={{ fontSize: 13, color: T.g300 }}>/ {subMax}</span>
            </div>
            <div style={{ fontSize: 12, color: T.g200, marginBottom: 8, lineHeight: 1.45 }}>
              {submissionsRemaining} submission{submissionsRemaining === 1 ? '' : 's'} left this week
            </div>
            <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4,
                            width: `${Math.min((submissionsUsed / Math.max(subMax, 1)) * 100, 100)}%`,
                            background: `linear-gradient(90deg,${T.gn},#6de800)` }} />
            </div>
            <div style={{ fontSize: 11, color: T.g300, marginTop: 8, lineHeight: 1.45 }}>
              Count resets every <strong style={{ color: T.g200 }}>Monday at 12:00 AM</strong> in your local time. Same rule for all artists on the Free plan.
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.g300, textTransform: 'uppercase',
                          letterSpacing: '.1em', marginBottom: 10 }}>Weekly artist cap</div>
            <div style={{ fontSize: 13, color: T.g200, lineHeight: 1.55 }}>
              The {FREE_WEEKLY_SUBMISSION_CAP}-per-week Free limit applies to <strong style={{ color: T.w }}>artist</strong> Playlist Push campaigns. Curator reviews and payouts use your curator dashboard.
            </div>
          </Card>
        )}

        {/* Credits */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.g300, textTransform: 'uppercase',
                        letterSpacing: '.1em', marginBottom: 10 }}>Credits Balance</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 34, fontWeight: 700, color: T.gn, lineHeight: 1 }}>
              {credits ?? 0}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(127,255,0,.5)', letterSpacing: '.08em' }}>CR</span>
          </div>
          <button type="button" onClick={() => setPage('artist')}
            style={{ fontSize: 12, fontWeight: 700, color: T.gn, background: 'none', border: 'none',
                     cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            Buy Credits →
          </button>
        </Card>
      </div>

      {/* Plan comparison */}
      <Card>
        <CardTitle>Plans</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {PLANS.map(plan => (
            <div key={plan.id}
              style={{ borderRadius: 12, padding: '18px 18px',
                       background: plan.current ? 'rgba(127,255,0,.05)' : 'rgba(255,255,255,.03)',
                       border: plan.current ? `1.5px solid ${T.gnB}` : `1px solid ${T.b0}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.w, marginBottom: 2 }}>{plan.label}</div>
                  <div>
                    <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: plan.current ? T.gn : T.w }}>
                      {plan.price}
                    </span>
                    <span style={{ fontSize: 11, color: T.g300 }}>/{plan.perMonth}</span>
                  </div>
                </div>
                {plan.current && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20,
                                 background: `${T.gn}20`, color: T.gn, border: `1px solid ${T.gnB}`,
                                 textTransform: 'uppercase', letterSpacing: '.06em' }}>Current</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'rgba(127,255,0,.15)',
                                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5 5-5" stroke={T.gn} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span style={{ fontSize: 12, color: T.g200, lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Once /api/spotify/health returns OK, keep showing connected (avoids flapping on transient failures). */
const LS_SPOTIFY_HEALTH_OK = 'se_streamengine_spotify_api_health_ok'

/* ══════════════════════════
   3. INTEGRATIONS & NOTIFICATIONS
══════════════════════════ */
function IntegrationsSettings() {
  const toast = useToast()
  const [spotifyUserRev, setSpotifyUserRev] = useState(0)
  const [spotifyHealthLatched, setSpotifyHealthLatched] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(LS_SPOTIFY_HEALTH_OK) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const bump = () => setSpotifyUserRev((n) => n + 1)
    window.addEventListener(SPOTIFY_TOKEN_UPDATED_EVENT, bump)
    window.addEventListener(SPOTIFY_TOKEN_CLEARED_EVENT, bump)
    return () => {
      window.removeEventListener(SPOTIFY_TOKEN_UPDATED_EVENT, bump)
      window.removeEventListener(SPOTIFY_TOKEN_CLEARED_EVENT, bump)
    }
  }, [])

  const spotifyOk = useMemo(() => isSpotifyConnected(), [spotifyUserRev])
  const [notifEmail,  setNotifEmail]  = useState(true)
  const [notifInApp,  setNotifInApp]  = useState(true)
  const [notifDigest, setNotifDigest] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [billingHealth, setBillingHealth] = useState(null)
  const [spotifyApiHealth, setSpotifyApiHealth] = useState(null)
  const [apiReachable, setApiReachable] = useState(null)

  const spotifyServerRowOk = spotifyHealthLatched || !!spotifyApiHealth?.ok

  const spotifyMetaDetail = (() => {
    if (!spotifyServerRowOk) {
      if (spotifyApiHealth == null && !spotifyHealthLatched) return 'Checking…'
      return 'Unreachable — set VITE_API_ORIGIN (Netlify) and confirm the API is up.'
    }
    if (spotifyApiHealth?.clientCredentialsConfigured) {
      return 'Web API + richer artwork (server credentials)'
    }
    if (spotifyHealthLatched) {
      return 'API was reachable earlier on this device; if the live check fails briefly, oEmbed metadata may still work.'
    }
    return 'Using server oEmbed fallback — add SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET on Render for best results'
  })()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [hr, b, s] = await Promise.all([
          apiFetch('/health').catch(() => null),
          apiFetch('/api/billing/health').then((r) => r.json()).catch(() => null),
          apiFetch('/api/spotify/health').then((r) => r.json()).catch(() => null),
        ])
        if (!cancelled) {
          setApiReachable(hr ? hr.ok : false)
          setBillingHealth(b)
          setSpotifyApiHealth(s)
          if (s?.ok) {
            try {
              localStorage.setItem(LS_SPOTIFY_HEALTH_OK, '1')
            } catch { /* ignore */ }
            setSpotifyHealthLatched(true)
          }
        }
      } catch {
        if (!cancelled) {
          setApiReachable(false)
          setBillingHealth(null)
          setSpotifyApiHealth(null)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const handleConnectSpotify = async () => {
    if (!hasSpotifyClientId()) {
      toast.error(
        isDev
          ? `Add VITE_SPOTIFY_CLIENT_ID to your root .env. In Spotify Developer Dashboard, set Redirect URI to: ${window.location.origin}/`
          : 'Spotify client ID is missing. Add VITE_SPOTIFY_CLIENT_ID in Netlify, redeploy, and add this site URL to your Spotify app redirect URIs.',
        'Spotify not configured',
      )
      return
    }
    const r = await startSpotifyAuth()
    if (r?.error) toast.error(r.error, 'Spotify')
  }
  const handleDisconnectSpotify = async () => {
    setDisconnecting(true)
    await new Promise(r => setTimeout(r, 600))
    clearSpotifyToken()
    setDisconnecting(false)
    window.location.reload()
  }

  const FUTURE_INTEGRATIONS = [
    { icon: '📧', name: 'Mailchimp', desc: 'Sync your fan list for campaign announcements.', coming: true },
    { icon: '📊', name: 'Google Analytics', desc: 'Track submission traffic and conversion.', coming: true },
    { icon: '💬', name: 'Discord', desc: 'Get campaign alerts in your server.', coming: true },
  ]

  const row = (label, ok, detail) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.b0}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.w }}>{label}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ok ? '#1ed760' : T.gold }}>{ok ? 'Connected' : 'Not connected'}</div>
        {detail && <div style={{ fontSize: 11, color: T.g300, marginTop: 2, maxWidth: 280 }}>{detail}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle>Service status</CardTitle>
        <div style={{ fontSize: 12, color: T.g300, marginBottom: 12, lineHeight: 1.5 }}>
          {isProd ? (
            <>
              Production: set public keys in <strong style={{ color: T.g200 }}>Netlify</strong> (Vite) and secrets in{' '}
              <strong style={{ color: T.g200 }}>Render</strong> (API). The browser talks to Supabase directly for your account; the API loads Spotify track metadata and runs Stripe checkout.
            </>
          ) : (
            <>
              Local dev: use root <code style={{ fontSize: 11, color: T.g200 }}>.env</code> and <code style={{ fontSize: 11, color: T.g200 }}>server/.env</code>, then{' '}
              <code style={{ fontSize: 11, color: T.g200 }}>npm run dev</code> so <code style={{ fontSize: 11, color: T.g200 }}>/api</code> proxies to the backend.
            </>
          )}
        </div>
        {row('StreamEngine API', apiReachable === true, apiReachable === false ? 'Unreachable — set VITE_API_ORIGIN (Netlify) and confirm Render is up' : apiReachable == null ? 'Checking…' : 'Reachable')}
        {row('Supabase (app)', !isDemo, isDemo ? 'Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY on Netlify, then redeploy — each user’s data is stored in your project' : 'Signed-in — songs, campaigns, and credits persist per user')}
        {row('Stripe (checkout API)', !!billingHealth?.stripe, billingHealth?.stripe ? 'Server can create Checkout sessions' : 'Set STRIPE_SECRET_KEY (+ Supabase service role) on Render')}
        {row('Spotify metadata API', spotifyServerRowOk, spotifyMetaDetail)}
        {row('Stripe (browser)', isStripeConfigured(), isStripeConfigured() ? 'Publishable key loaded' : 'Set VITE_STRIPE_PUBLISHABLE_KEY on Netlify')}
      </Card>

      {/* Notifications */}
      <Card>
        <CardTitle>Notifications</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Toggle on={notifEmail}  onChange={setNotifEmail}
            label="Email Notifications"
            sub="Receive curator responses and campaign updates by email" />
          <div style={{ height: 1, background: T.b0 }} />
          <Toggle on={notifInApp} onChange={setNotifInApp}
            label="In-App Notifications"
            sub="See alerts inside StreamEngine when curators respond" />
          <div style={{ height: 1, background: T.b0 }} />
          <Toggle on={notifDigest} onChange={setNotifDigest}
            label="Weekly Digest"
            sub="Receive a weekly summary of your campaign performance" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
            <SaveButton onSave={() => {}} label="Save Preferences" />
          </div>
        </div>
      </Card>

      {/* Spotify */}
      <Card>
        <CardTitle>Spotify</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(30,215,96,.12)',
                          border: '1px solid rgba(30,215,96,.2)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#1ed760">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.w, marginBottom: 3 }}>
                Spotify Account
              </div>
              {spotifyOk
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ed760',
                                   boxShadow: '0 0 6px #1ed760' }} />
                    <span style={{ fontSize: 12, color: '#1ed760', fontWeight: 600 }}>Connected</span>
                    <span style={{ fontSize: 12, color: T.g300 }}>· playlist tools enabled</span>
                  </div>
                : <div style={{ fontSize: 12, color: T.g300 }}>Not connected — link your Spotify account for curator playlist tools (PKCE; no client secret in the browser).</div>
              }
            </div>
          </div>
          {spotifyOk
            ? <button onClick={handleDisconnectSpotify} disabled={disconnecting}
                style={{ padding: '8px 16px', borderRadius: 9, background: 'rgba(255,255,255,.05)',
                         border: `1px solid ${T.b1}`, color: T.g200, fontSize: 13,
                         fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
                         opacity: disconnecting ? .6 : 1 }}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            : <button onClick={handleConnectSpotify}
                style={{ padding: '8px 18px', borderRadius: 9, background: 'rgba(30,215,96,.12)',
                         border: '1px solid rgba(30,215,96,.28)', color: '#1ed760',
                         fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                Connect Spotify
              </button>
          }
        </div>
      </Card>

      {/* Future integrations */}
      <Card>
        <CardTitle>Coming Soon</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FUTURE_INTEGRATIONS.map(it => (
            <div key={it.name}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                       gap: 16, opacity: .6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,.05)',
                              border: `1px solid ${T.b0}`, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 18 }}>
                  {it.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.w, marginBottom: 2 }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: T.g300 }}>{it.desc}</div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
                             background: 'rgba(255,255,255,.06)', color: T.g300,
                             border: `1px solid ${T.b0}`, textTransform: 'uppercase', letterSpacing: '.07em',
                             flexShrink: 0 }}>
                Soon
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════
   4. CURATOR SETTINGS
══════════════════════════ */
function CuratorSettings({ user }) {
  const [acceptMsg,   setAcceptMsg]   = useState('Thanks for submitting! I\'ll review your track within 48 hours and let you know if it\'s a fit for my playlist.')
  const [instagram,   setInstagram]   = useState('')
  const [twitter,     setTwitter]     = useState('')
  const [website,     setWebsite]     = useState('')
  const [genreTogles, setGenreToggles] = useState({
    'Hip-Hop': true, 'R&B': true, 'Electronic': false, 'Indie': false, 'Pop': false, 'Lo-Fi': false,
  })

  const toggleGenre = (g) => setGenreToggles(p => ({ ...p, [g]: !p[g] }))

  const saveGenres = async () => {
    if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
    const genres = Object.entries(genreTogles).filter(([, on]) => on).map(([g]) => g)
    const { error } = await supabase.from('curator_profiles')
      .upsert({ id: user?.id, genres }, { onConflict: 'id' })
    return { error }
  }

  const saveMessage = async () => {
    if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
    const { error } = await supabase.from('curator_profiles')
      .upsert({ id: user?.id, rules: acceptMsg.trim() }, { onConflict: 'id' })
    return { error }
  }

  const saveLinks = async () => {
    if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
    const { error } = await supabase.from('curator_profiles')
      .upsert({
        id: user?.id,
        instagram_url: instagram ? `https://instagram.com/${instagram}` : null,
        twitter_url:   twitter   ? `https://x.com/${twitter}`           : null,
        spotify_profile_url: website || null,
      }, { onConflict: 'id' })
    return { error }
  }

  const ACCENT_MAP = {
    'Hip-Hop': '#7fff00', 'R&B': '#ec4899', 'Electronic': '#a78bfa',
    'Indie': '#38bdf8', 'Pop': '#f59e0b', 'Lo-Fi': '#f59e0b',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Genres accepted */}
      <Card>
        <CardTitle>Accepted Genres</CardTitle>
        <p style={{ fontSize: 13, color: T.g300, marginBottom: 16, marginTop: -6 }}>
          Artists will only see your playlist if their genre matches.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {Object.entries(genreTogles).map(([genre, on]) => {
            const ac = ACCENT_MAP[genre] || T.gn
            return (
              <button key={genre} onClick={() => toggleGenre(genre)}
                style={{ padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                         fontSize: 13, fontWeight: 700, transition: 'all .15s',
                         background: on ? `${ac}18` : 'rgba(255,255,255,.05)',
                         color:      on ? ac         : T.g300,
                         boxShadow:  on ? `0 0 0 1.5px ${ac}40` : 'none' }}>
                {genre}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SaveButton onSave={saveGenres} label="Save Genres" />
        </div>
      </Card>

      {/* Acceptance message */}
      <Card>
        <CardTitle>Acceptance Message</CardTitle>
        <p style={{ fontSize: 13, color: T.g300, marginBottom: 16, marginTop: -6 }}>
          Sent to artists when you accept their submission.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextArea
            label="Message Template"
            value={acceptMsg}
            onChange={setAcceptMsg}
            rows={4}
            placeholder="Write a message to send artists when you accept their track…"
            hint={`${acceptMsg.length} / 500 characters`}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton onSave={saveMessage} label="Save Message" />
          </div>
        </div>
      </Card>

      {/* Social links */}
      <Card>
        <CardTitle>Social Links</CardTitle>
        <p style={{ fontSize: 13, color: T.g300, marginBottom: 16, marginTop: -6 }}>
          Shown on your public curator profile.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 6 }}>
              Instagram
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{ padding: '10px 12px 10px 14px', background: 'rgba(255,255,255,.04)',
                             border: `1px solid ${T.b1}`, borderRight: 'none',
                             borderRadius: '10px 0 0 10px', fontSize: 13, color: T.g300 }}>
                instagram.com/
              </span>
              <input value={instagram} onChange={e => setInstagram(e.target.value)}
                placeholder="yourhandle"
                style={{ flex: 1, background: 'linear-gradient(145deg,#101013,#0d0d10)',
                         border: `1px solid ${T.b1}`, borderRadius: '0 10px 10px 0', padding: '10px 14px',
                         color: T.w, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => { e.target.style.borderColor = T.gnB; e.target.previousSibling.style.borderColor = T.gnB }}
                onBlur={e => { e.target.style.borderColor = T.b1; e.target.previousSibling.style.borderColor = T.b1 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 6 }}>
              Twitter / X
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{ padding: '10px 12px 10px 14px', background: 'rgba(255,255,255,.04)',
                             border: `1px solid ${T.b1}`, borderRight: 'none',
                             borderRadius: '10px 0 0 10px', fontSize: 13, color: T.g300 }}>
                x.com/
              </span>
              <input value={twitter} onChange={e => setTwitter(e.target.value)}
                placeholder="yourhandle"
                style={{ flex: 1, background: 'linear-gradient(145deg,#101013,#0d0d10)',
                         border: `1px solid ${T.b1}`, borderRadius: '0 10px 10px 0', padding: '10px 14px',
                         color: T.w, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => { e.target.style.borderColor = T.gnB; e.target.previousSibling.style.borderColor = T.gnB }}
                onBlur={e => { e.target.style.borderColor = T.b1; e.target.previousSibling.style.borderColor = T.b1 }}
              />
            </div>
          </div>

          <Field label="Website" value={website} onChange={setWebsite}
            placeholder="https://yoursite.com"
            hint="Include https:// for the link to work correctly." />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveButton onSave={saveLinks} label="Save Links" />
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════
   PAGE ROOT
══════════════════════════ */
const SECTIONS = [
  { id: 'profile',       icon: '👤', label: 'Profile Settings'         },
  { id: 'wallet',        icon: '💳', label: 'Wallet & Membership'       },
  { id: 'integrations',  icon: '🔗', label: 'Integrations & Notifications' },
]
const CURATOR_SECTION = { id: 'curator', icon: '🎶', label: 'Curator Settings' }

export default function SettingsPage({ setPage }) {
  const { user, role, credits } = useAuth()
  const { campaigns: walletCampaigns, loading: walletCampaignsLoading } = useCampaigns(
    role === 'artist' ? user?.id : null,
    'artist',
  )
  const [section,  setSection]  = useState('profile')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const isCurator = role === 'curator'
  const allSections = isCurator ? [...SECTIONS, CURATOR_SECTION] : SECTIONS

  const renderContent = () => {
    switch (section) {
      case 'profile':      return <ProfileSettings user={user} />
      case 'wallet':       return (
        <WalletSettings
          user={user}
          credits={credits}
          role={role}
          setPage={setPage}
          campaigns={walletCampaigns}
          campaignsLoading={walletCampaignsLoading}
        />
      )
      case 'integrations': return <IntegrationsSettings />
      case 'curator':      return <CuratorSettings user={user} />
      default:             return null
    }
  }

  const current = allSections.find(s => s.id === section)

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w, overflowX: 'hidden' }}>
      <NavBar setPage={setPage} scrolled={scrolled} />

      <div className="se-shell" style={{ maxWidth: 1060, margin: '0 auto', paddingTop: 80, paddingBottom: 80, display: 'flex', gap: 28, alignItems: 'flex-start' }}>

        {/* ── Left sidebar ── */}
        <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.g400, letterSpacing: '.1em',
                        textTransform: 'uppercase', padding: '4px 10px', marginBottom: 6 }}>
            Settings
          </div>

          {/* Main sections */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px',
                         borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                         fontSize: 13.5, fontWeight: section === s.id ? 700 : 500,
                         background: section === s.id ? 'rgba(127,255,0,.08)' : 'none',
                         color:      section === s.id ? T.gn              : T.g200,
                         borderLeft: section === s.id ? `2px solid ${T.gn}` : '2px solid transparent',
                         transition: 'all .15s' }}
                onMouseEnter={e => { if (section !== s.id) { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.color = T.w } }}
                onMouseLeave={e => { if (section !== s.id) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.g200 } }}>
                <span style={{ fontSize: 15 }}>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Curator section (role-gated) */}
          {isCurator && (
            <>
              <div style={{ height: 1, background: T.b0, marginBottom: 14, marginLeft: 10, marginRight: 10 }} />
              <div style={{ fontSize: 11, fontWeight: 800, color: T.g400, letterSpacing: '.1em',
                            textTransform: 'uppercase', padding: '4px 10px', marginBottom: 6 }}>
                Curator
              </div>
              <button onClick={() => setSection('curator')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px',
                         borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                         fontSize: 13.5, fontWeight: section === 'curator' ? 700 : 500,
                         background: section === 'curator' ? 'rgba(255,199,64,.08)' : 'none',
                         color:      section === 'curator' ? T.gold              : T.g200,
                         borderLeft: section === 'curator' ? `2px solid ${T.gold}` : '2px solid transparent',
                         transition: 'all .15s' }}
                onMouseEnter={e => { if (section !== 'curator') { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.color = T.w } }}
                onMouseLeave={e => { if (section !== 'curator') { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = T.g200 } }}>
                <span style={{ fontSize: 15 }}>{CURATOR_SECTION.icon}</span>
                <span>{CURATOR_SECTION.label}</span>
              </button>
            </>
          )}

          {/* Back to dashboard */}
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${T.b0}` }}>
            <button onClick={() => setPage(role === 'curator' ? 'curator' : 'artist')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.g300,
                       background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px',
                       borderRadius: 8, width: '100%', transition: 'color .15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.w}
              onMouseLeave={e => e.currentTarget.style.color = T.g300}>
              ← Back to Dashboard
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Section header */}
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', color: T.w, marginBottom: 4 }}>
              {current?.label}
            </h1>
            <div style={{ height: 1, background: T.b0 }} />
          </div>

          {renderContent()}
        </main>
      </div>
    </div>
  )
}
