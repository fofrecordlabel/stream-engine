import { useState, useEffect } from 'react'
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
import SubmitSongPage    from './pages/SubmitSongPage.jsx'
import SubmitPlaylistPage from './pages/SubmitPlaylistPage.jsx'
import SettingsPage      from './pages/SettingsPage.jsx'
import PricingPage       from './pages/PricingPage.jsx'
import BlogPage          from './pages/BlogPage.jsx'
import BlogPostPage      from './pages/BlogPostPage.jsx'
import { TermsPage, PrivacyPage, ContactPage, FAQPage, HowItWorksPage } from './pages/TrustPages.jsx'
import { CheckoutSuccessPage, CheckoutCancelPage } from './pages/CheckoutStatusPages.jsx'

/* ── Public pages (no auth required) ── */
const PUBLIC_PAGES = new Set(['home','get-started','auth','signup','join','invite','pricing','subscriptions','submit-song','submit-playlist','blog','blog-post','terms','privacy','contact','faq','how-it-works','checkout-success','checkout-cancel'])

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
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, margin:'0 auto 16px', border:'3px solid rgba(127,255,0,.2)', borderTop:'3px solid #7fff00', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <div style={{ fontSize:13, color:'#606060', fontWeight:600 }}>Loading StreamEngine…</div>
      </div>
    </div>
  )
}

/* ── Inner app — consumes AuthContext ── */
function AppInner() {
  const { user, role, loading, isLoggedIn } = useAuth()
  const [page,   setPage]   = useState('home')
  const [postId, setPostId] = useState(null)
  const [initialHandled, setInitialHandled] = useState(false)

  const navigate = (dest) => {
    // Auth guard: private page without session → go to auth
    if (!PUBLIC_PAGES.has(dest) && !isLoggedIn) {
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
  }

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
  useEffect(() => {
    if (document.getElementById('se-global')) return
    const el = document.createElement('style')
    el.id = 'se-global'
    el.textContent = GLOBAL_CSS
    document.head.appendChild(el)
  }, [])

  // Viewport-safe gutter so right-side IDE panels never block critical UI.
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth || document.documentElement.clientWidth || 0
      // Heuristic: Cursor/devtools panels often consume ~280–360px on the right.
      const gutter =
        w >= 1400 ? 360 :
        w >= 1200 ? 320 :
        w >= 1024 ? 280 :
        24
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
    <LangProvider>
      <AuthProvider>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </AuthProvider>
    </LangProvider>
  )
}
