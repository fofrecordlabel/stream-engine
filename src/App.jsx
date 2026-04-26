import React, { useState, useEffect, useRef, useCallback } from 'react'
import { GLOBAL_CSS } from './tokens.js'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { LangProvider } from './context/LangContext.jsx'
import { handleSpotifyCallback, isSpotifyOAuthReturn } from './lib/spotifyAuth.js'
import { getPendingSubmission, setPendingSubmission } from './lib/pendingSubmission.js'
import { isAdminUnlocked } from './lib/adminGate.js'

import HomePage          from './pages/HomePage.jsx'
import GetStartedScreen  from './pages/GetStartedScreen.jsx'
import AuthPage          from './pages/AuthPage.jsx'
import ArtistDashboard   from './pages/ArtistDashboard.jsx'
import CuratorDashboard  from './pages/CuratorDashboard.jsx'
import AdminDashboard    from './pages/AdminDashboard.jsx'
import ArtistOnboardingPage from './pages/ArtistOnboardingPage.jsx'
import CuratorOnboardingPage from './pages/CuratorOnboardingPage.jsx'
import ToolsPage         from './pages/ToolsPage.jsx'
import PlaylistTraderPage from './pages/PlaylistTraderPage.jsx'
import SubmitSongPage    from './pages/SubmitSongPage.jsx'
import SubmitPlaylistPage from './pages/SubmitPlaylistPage.jsx'
import SettingsPage      from './pages/SettingsPage.jsx'
import PricingPage       from './pages/PricingPage.jsx'
import BlogPage          from './pages/BlogPage.jsx'
import BlogPostPage      from './pages/BlogPostPage.jsx'
import { TermsPage, PrivacyPage, ContactPage, FAQPage, HowItWorksPage } from './pages/TrustPages.jsx'
import { CheckoutSuccessPage, CheckoutCancelPage } from './pages/CheckoutStatusPages.jsx'
import { isDemo } from './lib/supabase.js'
import { isProd } from './lib/env.js'
import SupabaseRequiredScreen from './components/SupabaseRequiredScreen.jsx'
import GlobalSeo from './components/GlobalSeo.jsx'

/* ── Public pages (no auth required) ── */
const PUBLIC_PAGES = new Set(['home','get-started','auth','signup','join','invite','pricing','subscriptions','tools','playlist-trader','submit-song','submit-playlist','blog','blog-post','terms','privacy','contact','faq','how-it-works','checkout-success','checkout-cancel'])

const POST_AUTH_RETURN_PAGES = new Set(['artist', 'curator', 'admin', 'settings', 'submit-song', 'submit-playlist', 'subscriptions'])

/* ── Role → default page after login ── */
const ROLE_DEFAULTS = { artist:'artist', curator:'curator', admin:'admin' }

/* ── Page map ── */
const PAGES = {
  home:             HomePage,
  'get-started':    GetStartedScreen,
  auth:             AuthPage,
  signup:           AuthPage,
  join:             AuthPage,
  invite:           AuthPage,
  terms:            TermsPage,
  privacy:          PrivacyPage,
  contact:          ContactPage,
  faq:              FAQPage,
  'how-it-works':   HowItWorksPage,
  tools:            ToolsPage,
  'playlist-trader': PlaylistTraderPage,
  'onboarding-artist': ArtistOnboardingPage,
  'onboarding-curator': CuratorOnboardingPage,
  artist:           ArtistDashboard,
  curator:          CuratorDashboard,
  admin:            AdminDashboard,
  'submit-song':    SubmitSongPage,
  'submit-playlist': SubmitPlaylistPage,
  settings:         SettingsPage,
  pricing:          PricingPage,
  subscriptions:  PricingPage,
  blog:             BlogPage,
  'blog-post':      BlogPostPage,
  'checkout-success': CheckoutSuccessPage,
  'checkout-cancel':  CheckoutCancelPage,
}

/* ── Loading screen ── */
function LoadingScreen() {
  return (
    <div style={{ height:'100vh', background:'#050506', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', maxWidth: 320, padding: 20 }}>
        <div style={{ width:40, height:40, margin:'0 auto 16px', border:'3px solid rgba(127,255,0,.2)', borderTop:'3px solid #7fff00', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <div style={{ fontSize:14, color:'#a3a3a3', fontWeight:600, marginBottom: 8 }}>Loading StreamEngine…</div>
        <div style={{ fontSize:12, color:'#525252', lineHeight: 1.5 }}>
          If this never finishes, check Netlify env vars (especially <span className="mono">VITE_SUPABASE_ANON_KEY</span>) and redeploy.
        </div>
      </div>
    </div>
  )
}

/** Catches render errors so production never shows a silent black screen. */
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err, info) {
    console.error('[StreamEngine] UI error:', err, info)
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0a0a0b',
            color: '#fff',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Something broke on this page</h1>
          <pre
            style={{
              fontSize: 12,
              color: '#fca5a5',
              maxWidth: 560,
              overflow: 'auto',
              textAlign: 'left',
              marginBottom: 20,
              padding: 14,
              background: 'rgba(255,255,255,.06)',
              borderRadius: 10,
            }}
          >
            {String(this.state.err?.message || this.state.err)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: 'none',
              fontWeight: 800,
              cursor: 'pointer',
              background: '#7fff00',
              color: '#000',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── Inner app — consumes AuthContext ── */
function AppInner() {
  const { user, role, loading, isLoggedIn } = useAuth()
  const [page,   setPage]   = useState('home')
  const [postId, setPostId] = useState(null)
  const [initialHandled, setInitialHandled] = useState(false)
  const postLoginResumeRef = useRef(false)

  const navigate = useCallback((dest) => {
    // Auth guard: private page without session → go to auth
    if (!PUBLIC_PAGES.has(dest) && !isLoggedIn) {
      try {
        sessionStorage.setItem('se_auth_return', dest)
      } catch { /* ignore */ }
      setPage('auth')
      return
    }
    // If logged in and trying to hit auth page → go to dashboard
    if ((dest === 'auth' || dest === 'signup' || dest === 'join' || dest === 'invite') && isLoggedIn) {
      setPage(ROLE_DEFAULTS[role] || 'artist')
      return
    }
    // Role guard: wrong dashboard
    if (dest === 'artist'  && isLoggedIn && role === 'curator') { setPage('curator'); return }
    if (dest === 'curator' && isLoggedIn && role === 'artist')  { setPage('artist');  return }
    if (dest === 'admin'   && isLoggedIn && role !== 'admin' && !isAdminUnlocked())   { setPage(ROLE_DEFAULTS[role]); return }
    // Legacy 'submit' alias → submit-song
    if (dest === 'submit') { setPage('submit-song'); return }
    // Pricing → subscriptions (same screen)
    if (dest === 'pricing') { setPage('subscriptions'); return }
    setPage(dest)
  }, [isLoggedIn, role])

  // First-time onboarding gate (role-specific).
  useEffect(() => {
    if (loading || !isLoggedIn || !user?.profile) return
    if (page === 'onboarding-artist' || page === 'onboarding-curator') return
    if (role === 'artist' && !user.profile.artist_onboarded) {
      setPage('onboarding-artist')
      return
    }
    if (role === 'curator' && !user.profile.curator_onboarded) {
      setPage('onboarding-curator')
    }
  }, [loading, isLoggedIn, role, user?.profile, page])

  // Initial path handling: support /signup, /join, /invite deep links.
  useEffect(() => {
    if (initialHandled) return
    const path = window.location.pathname.replace(/^\//, '')
    const qs = new URLSearchParams(window.location.search)
    const invite = {
      code: qs.get('code') || null,
      ref: qs.get('ref') || null,
      src: qs.get('src') || null,
    }
    const hasInvite = !!(invite.code || invite.ref || invite.src)
    if (hasInvite) {
      const pending = getPendingSubmission()
      setPendingSubmission({ ...(pending || {}), invite, resumeAfterAuth: true })
    }
    if (path === 'signup' || path === 'join' || path === 'invite') {
      setPage(path)
    }
    if (path === 'checkout-success' || path === 'checkout-cancel') {
      setPage(path)
    }
    if (path === 'pricing' || path === 'subscriptions') {
      setPage('subscriptions')
    }
    setInitialHandled(true)
  }, [initialHandled])

  // After login, leave marketing home alone — only bounce users off auth screens into their dashboard.
  useEffect(() => {
    if (loading) return
    if (isLoggedIn && (page === 'auth' || page === 'signup' || page === 'join' || page === 'invite')) {
      setPage(ROLE_DEFAULTS[role] || 'artist')
    }
  }, [isLoggedIn, loading, role]) // eslint-disable-line

  useEffect(() => {
    if (!isLoggedIn) postLoginResumeRef.current = false
  }, [isLoggedIn])

  /* OAuth return to home / refresh: resume hero track import or deep-link return after session is ready. */
  useEffect(() => {
    if (loading || !isLoggedIn || postLoginResumeRef.current) return
    const pending = getPendingSubmission()
    if (page === 'home' && pending?.resumeAfterAuth && pending?.song && pending?.status === 'metadata-ready') {
      postLoginResumeRef.current = true
      navigate('artist')
      return
    }
    let returnTo = null
    try {
      returnTo = sessionStorage.getItem('se_auth_return')
      if (returnTo) sessionStorage.removeItem('se_auth_return')
    } catch { /* ignore */ }
    if (returnTo && POST_AUTH_RETURN_PAGES.has(returnTo)) {
      postLoginResumeRef.current = true
      navigate(returnTo)
    }
  }, [loading, isLoggedIn, page, navigate])

  if (loading) return <LoadingScreen />

  // Blog post — special state-driven route
  if (page === 'blog' && postId) {
    return <BlogPostPage setPage={navigate} postId={postId}
             onBack={() => setPostId(null)} />
  }

  if (page === 'blog') {
    return <BlogPage setPage={navigate}
             onPost={id => { setPostId(id) }} />
  }

  const Page = PAGES[page] ?? HomePage
  const authDefaultMode = (page === 'signup' || page === 'join' || page === 'invite') ? 'signup' : 'signin'
  return (
    <div className="se-safe-root">
      <Page setPage={navigate} page={page} initialMode={authDefaultMode} />
    </div>
  )
}

/* ── Root app ── */
export default function App() {
  if (isProd && isDemo) {
    return <SupabaseRequiredScreen />
  }

  useEffect(() => {
    if (document.getElementById('se-global')) return
    const el = document.createElement('style')
    el.id = 'se-global'
    el.textContent = GLOBAL_CSS
    document.head.appendChild(el)
  }, [])

  // Local-only: extra right gutter so Cursor / devtools panels do not cover nav/hero.
  // Production sites must stay visually centered (no asymmetric viewport padding).
  useEffect(() => {
    const apply = () => {
      const host = window.location.hostname
      const isLocal = host === 'localhost' || host === '127.0.0.1'
      const w = window.innerWidth || document.documentElement.clientWidth || 0
      const gutter = !isLocal
        ? 0
        : w >= 1400
          ? 360
          : w >= 1200
            ? 320
            : w >= 1024
              ? 280
              : 24
      document.documentElement.style.setProperty('--se-right-gutter', `${gutter}px`)
    }
    apply()
    window.addEventListener('resize', apply, { passive: true })
    return () => window.removeEventListener('resize', apply)
  }, [])

  // Spotify OAuth only (do not consume Supabase `?code=` redirects)
  useEffect(() => {
    if (!isSpotifyOAuthReturn()) return
    handleSpotifyCallback().catch(console.warn)
  }, [])

  return (
    <RootErrorBoundary>
      <LangProvider>
        <AuthProvider>
          <ToastProvider>
            <GlobalSeo />
            <AppInner />
          </ToastProvider>
        </AuthProvider>
      </LangProvider>
    </RootErrorBoundary>
  )
}
