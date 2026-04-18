import { useEffect, useMemo, useState } from 'react'
import { T } from '../tokens.js'
import { BrandMark } from '../components/common/Logo.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { isDemo } from '../lib/supabase.js'
import { getPendingSubmission } from '../lib/pendingSubmission.js'
import { formatOAuthProviderError } from '../lib/oauthErrors.js'

const inp = {
  width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
  borderRadius:11, padding:'12px 14px', fontSize:14, color:'#fff', outline:'none',
  transition:'border-color .15s, box-shadow .15s', fontFamily:'inherit',
}

const ROLE_OPTIONS = [
  { id:'artist',  icon:'🎤', label:'Artist',  desc:'Promote your music to curators' },
  { id:'curator', icon:'🎵', label:'Curator', desc:'Review tracks and earn money' },
]

export default function AuthPage({ setPage, initialMode = 'signin' }) {
  const { signIn, signUp, signInWithProvider, requestPasswordReset, updatePassword, isDemo: demoMode } = useAuth()
  const [mode,        setMode]        = useState(initialMode)   // 'signin' | 'signup'
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [name,        setName]        = useState('')
  const [role,        setRole]        = useState('artist')
  const [error,       setError]       = useState('')
  const [info,        setInfo]        = useState('')
  const [loading,     setLoading]     = useState(false)
  const [showPw,      setShowPw]      = useState(false)
  const [resetMode,   setResetMode]   = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const invite = useMemo(() => {
    const pending = getPendingSubmission()
    return pending?.invite || null
  }, [])

  const pendingImport = useMemo(() => {
    const pending = getPendingSubmission()
    return pending?.resumeAfterAuth && pending?.song ? pending : null
  }, [])

  useEffect(() => {
    setMode(initialMode === 'signup' ? 'signup' : 'signin')
  }, [initialMode])

  // Supabase password recovery callback includes hash params.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    if (hash.includes('type=recovery')) {
      setResetMode(true)
      setMode('signin')
    }
  }, [])

  const handleUpdatePassword = async () => {
    setError('')
    setInfo('')
    if (newPassword.length < 6) { setError('New password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const { error: err } = await updatePassword(newPassword)
      if (err) setError(err.message || 'Password update failed')
      else {
        setInfo('Password updated. You can sign in now.')
        setResetMode(false)
        setNewPassword('')
        // Clean the recovery hash so refresh doesn't reopen reset mode.
        if (window.location.hash) window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email.trim()) { setError('Email is required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (mode === 'signup' && !name.trim()) { setError('Display name is required'); return }

    setLoading(true)
    try {
      const fn = mode === 'signin'
        ? signIn(email, password)
        : signUp(email, password, role, name)
      const result = await fn
      if (result.userExists) {
        setMode('signin')
        setInfo('Account already exists. Please log in.')
        setError('')
      } else if (result.error) {
        setError(result.error.message || 'Authentication failed')
      } else if (result.needsEmailConfirmation) {
        setInfo('Check your email for a confirmation link, then sign in here.')
        setMode('signin')
      } else {
        let returnTo = null
        try {
          returnTo = sessionStorage.getItem('se_auth_return')
          if (returnTo) sessionStorage.removeItem('se_auth_return')
        } catch { /* ignore */ }
        const pending = getPendingSubmission()
        const allowedReturn = new Set(['artist', 'curator', 'admin', 'settings', 'submit-song', 'submit-playlist', 'subscriptions'])
        const dest =
          (returnTo && allowedReturn.has(returnTo) && returnTo) ||
          (pending?.resumeAfterAuth ? 'artist' : null) ||
          (result.role === 'curator' ? 'curator' : result.role === 'admin' ? 'admin' : 'artist')
        setPage(dest)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const demoLogin = async (demoRole) => {
    setLoading(true)
    const emailMap = { artist:'artist@demo.com', curator:'curator@demo.com', admin:'admin@demo.com' }
    const result = await signIn(emailMap[demoRole], 'demo')
    setLoading(false)
    if (!result.error) {
      const pending = getPendingSubmission()
      setPage(pending?.resumeAfterAuth ? 'artist' : demoRole === 'curator' ? 'curator' : demoRole === 'admin' ? 'admin' : 'artist')
    }
  }

  const handleSocialAuth = async (provider) => {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const pending = getPendingSubmission()
      const invite = pending?.invite || null
      const result = await signInWithProvider(provider.toLowerCase(), { invite })
      if (result?.error) setError(formatOAuthProviderError(result.error))
      // On success, Supabase redirects away. Nothing else to do here.
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    setError('')
    setInfo('')
    if (!email.trim()) { setError('Enter your email first'); return }
    setLoading(true)
    try {
      const { error: err } = await requestPasswordReset(email.trim())
      if (err) setError(err.message || 'Reset request failed')
      else setInfo('Password reset email sent. Check your inbox.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'72px 0 24px' }}>
      {/* Back to home — aligned with site shell */}
      <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'rgba(5,5,6,.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        <div className="se-shell" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:58 }}>
          <BrandMark onClick={() => setPage('home')} size={26} />
          {demoMode && (
            <div style={{ padding:'4px 12px', background:'rgba(255,199,64,.1)', border:'1px solid rgba(255,199,64,.25)', borderRadius:20, fontSize:11, fontWeight:700, color:T.gold }}>
              Demo Mode
            </div>
          )}
        </div>
      </div>

      <div className="se-shell" style={{ width:'100%', maxWidth:440, animation:'scaleIn .25s cubic-bezier(.34,1.56,.64,1)' }}>
        {pendingImport?.song && (
          <div style={{ marginBottom:18, padding:'12px 14px', borderRadius:14, border:`1px solid ${T.gnB}`, background:T.gnGl }}>
            <div style={{ fontWeight:800, fontSize:12.5, color:T.gn, marginBottom:4, letterSpacing:'.02em' }}>Track loaded</div>
            <div style={{ fontSize:13, color:T.g200, lineHeight:1.55 }}>
              After you sign in or sign up, we’ll continue with{' '}
              <strong style={{ color: T.w }}>{pendingImport.song.title || 'your track'}</strong>
              {pendingImport.song.artist ? <> by {pendingImport.song.artist}</> : null} automatically.
            </div>
          </div>
        )}
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:900, letterSpacing:'-.03em', marginBottom:8 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </div>
          <p style={{ fontSize:14, color:T.g200 }}>
            {mode === 'signin'
              ? 'Sign in to save songs and submit to playlist curators'
              : 'Create an account to save your track and launch Playlist Push'}
          </p>
            {invite && (invite.code || invite.ref || invite.src) && (
              <div style={{ marginTop:10, display:'inline-flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'center' }}>
                {invite.code && (
                  <span style={{ fontSize:11.5, fontWeight:800, padding:'4px 10px', borderRadius:999, border:`1px solid ${T.b1}`, background:'rgba(255,255,255,.04)', color:T.g100 }}>
                    Promo: <span className="mono" style={{ color:T.w }}>{invite.code}</span>
                  </span>
                )}
                {invite.ref && (
                  <span style={{ fontSize:11.5, fontWeight:800, padding:'4px 10px', borderRadius:999, border:`1px solid ${T.b1}`, background:'rgba(255,255,255,.04)', color:T.g100 }}>
                    Ref: <span className="mono" style={{ color:T.w }}>{invite.ref}</span>
                  </span>
                )}
                {invite.src && (
                  <span style={{ fontSize:11.5, fontWeight:800, padding:'4px 10px', borderRadius:999, border:`1px solid ${T.b1}`, background:'rgba(255,255,255,.04)', color:T.g100 }}>
                    Src: <span className="mono" style={{ color:T.w }}>{invite.src}</span>
                  </span>
                )}
              </div>
            )}
        </div>

        <div style={{ background:'rgba(255,255,255,.03)', border:`1px solid ${T.b0}`, borderRadius:14, padding:'14px 16px', marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:800, color:T.g300, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:12 }}>
            Continue with
          </div>
          <div style={{ display:'grid', gap:10 }}>
            {[
              { id:'Google', icon:'G' },
              { id:'Apple', icon:'A' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSocialAuth(p.id)}
                disabled={loading}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px 14px', borderRadius:11, border:`1px solid ${T.b1}`, background:'rgba(255,255,255,.04)', color:T.w, fontSize:13.5, fontWeight:700, cursor:'pointer' }}
              >
                <span style={{ fontSize:16, minWidth:16, textAlign:'center' }}>{p.icon}</span>
                Continue with {p.id}
              </button>
            ))}
          </div>
          <div style={{ fontSize:12, color:T.g300, lineHeight:1.6, marginTop:12 }}>
            An account is required to save your Spotify track, restore progress after login, and submit to curators.
          </div>
        </div>

        {resetMode && (
          <div style={{ background:'rgba(255,255,255,.03)', border:`1px solid ${T.b0}`, borderRadius:14, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:T.g300, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:10 }}>
              Password reset
            </div>
            <div style={{ fontSize:12.5, color:T.g200, lineHeight:1.6, marginBottom:12 }}>
              Enter a new password to complete your reset.
            </div>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              placeholder="New password"
              style={inp}
            />
            <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:10 }}>
              <button type="button" className="bt" onClick={() => setShowPw(s => !s)} style={{ padding:'9px 12px' }}>
                {showPw ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="bp" disabled={loading} onClick={handleUpdatePassword} style={{ padding:'9px 14px', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        )}

        {/* Demo quick-access */}
        {demoMode && (
          <div style={{ background:'rgba(255,199,64,.06)', border:'1px solid rgba(255,199,64,.2)', borderRadius:14, padding:'14px 16px', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.gold, letterSpacing:'.07em', textTransform:'uppercase', marginBottom:10 }}>
              Demo Mode — no backend connected
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['artist','curator','admin'].map(r => (
                <button key={r} onClick={() => demoLogin(r)} disabled={loading}
                  style={{ flex:1, padding:'8px 0', borderRadius:9, border:'1px solid rgba(255,199,64,.3)', background:'rgba(255,199,64,.08)', color:T.gold, fontWeight:700, fontSize:12.5, cursor:'pointer', textTransform:'capitalize', transition:'background .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,199,64,.16)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(255,199,64,.08)'}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mode tabs */}
        <div style={{ display:'flex', background:T.card, border:`1px solid ${T.b0}`, borderRadius:12, padding:4, marginBottom:24 }}>
          {[['signin','Sign In'],['signup','Sign Up']].map(([k,l]) => (
            <button key={k} onClick={() => { setMode(k); setError(''); }}
              style={{ flex:1, padding:'10px 0', borderRadius:9, fontWeight:700, fontSize:13.5, cursor:'pointer', border:'none', background:mode===k?'rgba(255,255,255,.09)':'transparent', color:mode===k?T.w:T.g300, transition:'all .15s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:T.g200, letterSpacing:'.07em', textTransform:'uppercase', display:'block', marginBottom:7 }}>Display Name</label>
                <input style={inp} placeholder="e.g. FOF Records" value={name} onChange={e=>setName(e.target.value)}
                  onFocus={e=>{ e.target.style.borderColor=T.gn; e.target.style.boxShadow=`0 0 0 3px ${T.gnGl}`; }}
                  onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.1)'; e.target.style.boxShadow='none'; }} />
              </div>
            )}

            <div>
              <label style={{ fontSize:11, fontWeight:700, color:T.g200, letterSpacing:'.07em', textTransform:'uppercase', display:'block', marginBottom:7 }}>Email</label>
              <input type="email" style={inp} placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)}
                onFocus={e=>{ e.target.style.borderColor=T.gn; e.target.style.boxShadow=`0 0 0 3px ${T.gnGl}`; }}
                onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.1)'; e.target.style.boxShadow='none'; }} />
            </div>

            <div>
              <label style={{ fontSize:11, fontWeight:700, color:T.g200, letterSpacing:'.07em', textTransform:'uppercase', display:'block', marginBottom:7 }}>Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPw?'text':'password'} style={{ ...inp, paddingRight:44 }} placeholder="Min 6 characters"
                  value={password} onChange={e=>setPassword(e.target.value)}
                  onFocus={e=>{ e.target.style.borderColor=T.gn; e.target.style.boxShadow=`0 0 0 3px ${T.gnGl}`; }}
                  onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.1)'; e.target.style.boxShadow='none'; }} />
                <button type="button" onClick={() => setShowPw(p=>!p)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:T.g300, fontSize:12 }}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'signin' && (
                <button type="button" onClick={handleReset}
                  style={{ marginTop:8, background:'none', border:'none', color:T.g300, cursor:'pointer', fontSize:12.5, fontWeight:700, textDecoration:'underline' }}>
                  Forgot password?
                </button>
              )}
            </div>

            {/* Role selector — signup only */}
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:T.g200, letterSpacing:'.07em', textTransform:'uppercase', display:'block', marginBottom:10 }}>I am a…</label>
                <div style={{ display:'flex', gap:10 }}>
                  {ROLE_OPTIONS.map(r => (
                    <div key={r.id} onClick={() => setRole(r.id)}
                      style={{ flex:1, padding:'14px 12px', borderRadius:12, border:`1.5px solid ${role===r.id?T.gn:T.b1}`, background:role===r.id?T.gnGl:'rgba(255,255,255,.03)', cursor:'pointer', textAlign:'center', transition:'all .15s' }}>
                      <div style={{ fontSize:22, marginBottom:6 }}>{r.icon}</div>
                      <div style={{ fontWeight:700, fontSize:13.5, color:role===r.id?T.gn:T.w, marginBottom:3 }}>{r.label}</div>
                      <div style={{ fontSize:11.5, color:T.g300, lineHeight:1.4 }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop:14, padding:'10px 13px', background:'rgba(255,64,96,.08)', border:'1px solid rgba(255,64,96,.22)', borderRadius:9, fontSize:13, color:T.red }}>
              ⚠ {error}
            </div>
          )}
          {info && !error && (
            <div style={{ marginTop:14, padding:'10px 13px', background:'rgba(127,255,0,.08)', border:`1px solid ${T.gnB}`, borderRadius:9, fontSize:13, color:T.gn, fontWeight:700 }}>
              ✓ {info}
            </div>
          )}

          <button type="submit" className="bp" disabled={loading}
            style={{ width:'100%', padding:'13px 0', fontSize:15, borderRadius:12, marginTop:20 }}>
            {loading
              ? <span style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation:'spin .7s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,.3)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                </span>
              : mode === 'signin' ? 'Sign In →' : 'Create Account →'
            }
          </button>
        </form>

        {/* Switch mode */}
        <p style={{ textAlign:'center', fontSize:13.5, color:T.g300, marginTop:20 }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode==='signin'?'signup':'signin'); setError(''); }}
            style={{ background:'none', border:'none', color:T.gn, fontWeight:700, cursor:'pointer', fontSize:13.5 }}>
            {mode === 'signin' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>

        {!demoMode && (
          <p style={{ textAlign:'center', fontSize:11.5, color:T.g400, marginTop:16, lineHeight:1.5 }}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </p>
        )}
      </div>
    </div>
  )
}
