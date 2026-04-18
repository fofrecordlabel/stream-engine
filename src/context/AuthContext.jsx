import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isDemo } from '../lib/supabase.js'
import { setPendingSubmission, getPendingSubmission } from '../lib/pendingSubmission.js'
import { isUserAlreadyRegisteredError } from '../lib/dedupeRules.js'

/* ── Demo users for non-Supabase mode ─────────────────────── */
const DEMO_USERS = {
  artist:  { id:'demo-artist',  email:'artist@demo.com',  role:'artist',  name:'FOF Records',      avatar:'FO', color:'#7fff00' },
  curator: { id:'demo-curator', email:'curator@demo.com', role:'curator', name:'VibeCheck Radio',  avatar:'VC', color:'#ec4899' },
  admin:   { id:'demo-admin',   email:'admin@demo.com',   role:'admin',   name:'Admin',            avatar:'AD', color:'#ff4060' },
}

const DEMO_CREDITS = { 'demo-artist': 0, 'demo-curator': 0, 'demo-admin': 0 }

/* ── Context ──────────────────────────────────────────────── */
const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)

  /* ── Load profile + credits from Supabase ── */
  const loadProfile = useCallback(async (authUser) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    const r = profile?.role || 'artist'
    setRole(r)
    setUser({
      id:     authUser.id,
      email:  authUser.email,
      name:   profile?.display_name || authUser.email.split('@')[0],
      avatar: profile?.display_name?.slice(0,2).toUpperCase() || 'ME',
      color:  r === 'curator' ? '#ffc740' : r === 'admin' ? '#ff4060' : '#7fff00',
      profile,
    })

    // Load credits balance
    const { data: ledger } = await supabase
      .from('credits_ledger')
      .select('amount')
      .eq('user_id', authUser.id)
    setCredits(ledger?.reduce((a, r) => a + r.amount, 0) || 0)

    return r
  }, [])

  /* ── Session init ── */
  useEffect(() => {
    if (isDemo) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user)
      else { setUser(null); setRole(null); setCredits(0) }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  /* ── Auth actions ── */
  const signIn = async (email, password) => {
    if (isDemo) {
      const r = email.includes('curator') ? 'curator' : email.includes('admin') ? 'admin' : 'artist'
      const u = DEMO_USERS[r]
      setUser(u); setRole(r); setCredits(DEMO_CREDITS[u.id] ?? 0)
      return { role: r, error: null }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    const r = await loadProfile(data.user)
    return { role: r, error: null }
  }

  const signInWithProvider = async (provider, params = {}) => {
    if (isDemo) {
      const r = provider === 'apple' ? 'artist' : 'artist'
      const u = DEMO_USERS[r]
      setUser(u); setRole(r); setCredits(DEMO_CREDITS[u.id] ?? 0)
      return { role: r, error: null, demo: true }
    }
    const redirectTo = `${window.location.origin}/`
    // Preserve invite/ref params (and any pending submission draft) before redirect.
    const pending = getPendingSubmission()
    if (params?.invite && !pending?.invite) {
      setPendingSubmission({ ...(pending || {}), invite: params.invite, resumeAfterAuth: true })
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          // helps reduce UX friction when possible (provider-dependent)
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    return { role: null, error }
  }

  const requestPasswordReset = async (email) => {
    if (isDemo) return { error: null, demo: true }
    const redirectTo = `${window.location.origin}/`
    return supabase.auth.resetPasswordForEmail(email, { redirectTo })
  }

  const updatePassword = async (newPassword) => {
    if (isDemo) return { error: null, demo: true }
    return supabase.auth.updateUser({ password: newPassword })
  }

  const signUp = async (email, password, selectedRole = 'artist', displayName = '') => {
    if (isDemo) {
      const u = { ...DEMO_USERS[selectedRole] || DEMO_USERS.artist, email, name: displayName || email.split('@')[0] }
      setUser(u); setRole(selectedRole); setCredits(0)
      return { role: selectedRole, error: null }
    }
    const name = displayName || email.split('@')[0]
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role: selectedRole, display_name: name } },
    })
    if (error) {
      if (isUserAlreadyRegisteredError(error)) return { error, userExists: true }
      return { error }
    }
    const r = await loadProfile(data.user)
    return { role: r, error: null }
  }

  const signOut = async () => {
    if (!isDemo) await supabase.auth.signOut()
    setUser(null); setRole(null); setCredits(0)
  }

  const addCredits = async (amount, reason = 'purchase', stripePaymentId = null) => {
    if (isDemo) { setCredits(c => c + amount); return { error: null } }
    const { error } = await supabase.from('credits_ledger').insert({
      user_id: user.id, amount, reason, stripe_payment_id: stripePaymentId,
    })
    if (!error) setCredits(c => c + amount)
    return { error }
  }

  const spendCredits = async (amount, campaignId) => {
    if (isDemo) { setCredits(c => c - amount); return { error: null } }
    const { error } = await supabase.from('credits_ledger').insert({
      user_id: user.id, amount: -amount, reason: 'campaign_spend', campaign_id: campaignId,
    })
    if (!error) setCredits(c => c - amount)
    return { error }
  }

  return (
    <AuthCtx.Provider value={{
      user, role, credits, loading,
      isDemo,
      isLoggedIn: !!user,
      signIn, signUp, signOut,
      signInWithProvider,
      requestPasswordReset,
      updatePassword,
      addCredits, spendCredits,
      setCredits,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
