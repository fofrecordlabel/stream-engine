import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isDemo, supabaseConfigErrorMessage } from '../lib/supabase.js'
import { setPendingSubmission, getPendingSubmission } from '../lib/pendingSubmission.js'
import { isUserAlreadyRegisteredError } from '../lib/dedupeRules.js'
import { env } from '../lib/env.js'

const SUPABASE_OAUTH_PROVIDERS = new Set(['google', 'apple'])

function oauthRedirectTo() {
  if (typeof window === 'undefined') return '/'
  const configured = env.appUrl
  const origin = window.location.origin
  if (configured && configured === origin) return `${configured}/`
  return `${origin}/`
}

const noCloud = () => ({ message: supabaseConfigErrorMessage() })

/* ── Context ──────────────────────────────────────────────── */
const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)

  /* ── Load profile + credits from Supabase ── */
  const loadProfile = useCallback(async (authUser) => {
    if (!supabase) return 'artist'
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

    const { data: ledger } = await supabase
      .from('credits_ledger')
      .select('amount')
      .eq('user_id', authUser.id)
    setCredits(ledger?.reduce((a, r) => a + r.amount, 0) || 0)

    return r
  }, [])

  const refreshProfile = useCallback(async () => {
    if (isDemo) return
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await loadProfile(session.user)
  }, [loadProfile])

  const patchProfile = useCallback(async (patch) => {
    if (isDemo || !supabase) return { error: noCloud() }
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return { error: { message: 'Not signed in' } }
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    if (!error) await loadProfile(session.user)
    return { error }
  }, [loadProfile])

  /* ── Session init ── */
  useEffect(() => {
    if (isDemo) { setLoading(false); return }

    let cancelled = false
    const finish = () => {
      if (!cancelled) setLoading(false)
    }

    /** Never leave the app stuck on a black loading screen if Supabase/network fails. */
    const failSafe = window.setTimeout(() => {
      console.warn('[StreamEngine] Auth init took too long — continuing without session.')
      finish()
    }, 12_000)

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        if (session?.user) {
          void loadProfile(session.user)
            .catch((e) => console.error('[StreamEngine] loadProfile failed:', e))
            .finally(finish)
        } else {
          finish()
        }
      })
      .catch((e) => {
        console.error('[StreamEngine] getSession failed:', e)
        finish()
      })
      .finally(() => window.clearTimeout(failSafe))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadProfile(session.user).catch((e) => console.error('[StreamEngine] loadProfile (auth change):', e))
      } else {
        setUser(null)
        setRole(null)
        setCredits(0)
      }
    })

    return () => {
      cancelled = true
      window.clearTimeout(failSafe)
      subscription.unsubscribe()
    }
  }, [loadProfile])

  /* ── Tab focus: refresh profile (credits) after Stripe checkout or long idle ── */
  useEffect(() => {
    if (isDemo) return
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) void loadProfile(session.user).catch((e) => console.error('[StreamEngine] loadProfile (visibility):', e))
      }).catch((e) => console.error('[StreamEngine] getSession (visibility):', e))
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loadProfile])

  /* ── Auth actions ── */
  const signIn = async (email, password) => {
    if (isDemo) return { role: null, error: noCloud() }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    const r = await loadProfile(data.user)
    return { role: r, error: null }
  }

  const signInWithProvider = async (provider, params = {}) => {
    if (isDemo) return { role: null, error: noCloud() }
    const key = String(provider || '').toLowerCase().trim()
    if (!SUPABASE_OAUTH_PROVIDERS.has(key)) {
      return { role: null, error: { message: 'Unsupported sign-in provider.' } }
    }
    const redirectTo = oauthRedirectTo()
    const pending = getPendingSubmission()
    if (params?.invite && !pending?.invite) {
      setPendingSubmission({ ...(pending || {}), invite: params.invite, resumeAfterAuth: true })
    }
    const options = { redirectTo, skipBrowserRedirect: false }
    if (key === 'google') {
      options.queryParams = { access_type: 'offline', prompt: 'consent' }
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider: key, options })
    return { role: null, error }
  }

  const requestPasswordReset = async (email) => {
    if (isDemo) return { error: noCloud() }
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: oauthRedirectTo() })
  }

  const updatePassword = async (newPassword) => {
    if (isDemo) return { error: noCloud() }
    return supabase.auth.updateUser({ password: newPassword })
  }

  const signUp = async (email, password, selectedRole = 'artist', displayName = '') => {
    if (isDemo) return { role: null, error: noCloud() }
    const name = displayName || email.split('@')[0]
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role: selectedRole, display_name: name } },
    })
    if (error) {
      if (isUserAlreadyRegisteredError(error)) return { error, userExists: true }
      return { error }
    }
    if (!data?.user) {
      return { role: null, error: null, needsEmailConfirmation: true }
    }
    const r = await loadProfile(data.user)
    return { role: r, error: null }
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null); setRole(null); setCredits(0)
  }

  const addCredits = async (amount, reason = 'purchase', stripePaymentId = null) => {
    if (isDemo) return { error: noCloud() }
    const { error } = await supabase.from('credits_ledger').insert({
      user_id: user.id, amount, reason, stripe_payment_id: stripePaymentId,
    })
    if (!error) setCredits(c => c + amount)
    return { error }
  }

  const spendCredits = async (amount, campaignId) => {
    if (isDemo) return { error: noCloud() }
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
      refreshProfile,
      patchProfile,
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
