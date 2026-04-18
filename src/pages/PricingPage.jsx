import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    tag: null,
    features: [
      '10 free submissions per week (resets every Monday)',
      'Basic analytics dashboard',
      'Email support',
      'Curator discovery',
    ],
    cta: 'Get Started',
    primary: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthly: 29,
    annual: 19,
    tag: 'Most Popular',
    features: [
      'Unlimited submissions',
      'Priority placement',
      'Advanced analytics',
      'Direct curator messaging',
    ],
    cta: 'Upgrade to Pro',
    primary: false,
  },
  {
    key: 'premium',
    name: 'Premium',
    monthly: 59,
    annual: 39,
    tag: 'Power Users',
    features: [
      'Unlimited submissions + higher curator priority',
      'AI pitch refinement + submission copy optimization',
      'Playlist fit scoring and campaign idea generator',
      'Early access to curator inbox insights',
    ],
    cta: 'Upgrade to Premium',
    primary: true,
  },
]

export default function PricingPage({ setPage }) {
  const [annual,   setAnnual]   = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '110px 24px 56px' }}>
        <div style={{ display: 'inline-block', background: T.gnGl, border: `1px solid ${T.gnB}`,
                      borderRadius: 999, padding: '4px 16px', fontSize: 11.5, fontWeight: 800,
                      color: T.gn, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 22 }}>
          Pricing
        </div>
        <h1 style={{ fontSize: 'clamp(34px,5vw,58px)', fontWeight: 900, letterSpacing: '-.03em',
                     lineHeight: 1.08, marginBottom: 16, color: T.w }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 17, color: T.g200, maxWidth: 460, margin: '0 auto 44px', lineHeight: 1.6 }}>
          No hidden fees. No lock-in. Start free and upgrade when you're ready.
        </p>

        {/* Toggle */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'rgba(255,255,255,.05)', border: `1px solid ${T.b0}`,
                      borderRadius: 12, padding: 4 }}>
          <button onClick={() => setAnnual(false)}
            style={{ padding: '8px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
                     fontSize: 13.5, fontWeight: 700, transition: 'all .15s',
                     background: !annual ? '#fff' : 'none',
                     color:       !annual ? '#000' : T.g300 }}>
            Monthly
          </button>
          <button onClick={() => setAnnual(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8,
                     padding: '8px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
                     fontSize: 13.5, fontWeight: 700, transition: 'all .15s',
                     background: annual ? T.gnGl : 'none',
                     color:      annual ? T.gn    : T.g300 }}>
            Annual
            <span style={{ background: T.gn, color: '#000', borderRadius: 999,
                           padding: '1px 8px', fontSize: 10.5, fontWeight: 800 }}>
              Save 35%
            </span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20,
                    maxWidth: 780, margin: '0 auto', padding: '0 24px 100px',
                    flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {PLANS.map(plan => {
          const price = annual ? plan.annual : plan.monthly
          return (
            <div key={plan.key}
              style={{ flex: '1 1 300px', maxWidth: 360,
                       background: plan.primary
                         ? 'linear-gradient(145deg,rgba(127,255,0,.07),#101013 55%)'
                         : 'linear-gradient(145deg,#101013,#0d0d10)',
                       border: plan.primary ? `1.5px solid ${T.gnB}` : `1px solid ${T.b0}`,
                       borderRadius: 20, padding: '32px 28px',
                       position: 'relative', overflow: 'hidden',
                       boxShadow: plan.primary ? `0 0 48px rgba(127,255,0,.1)` : 'none',
                       transform: plan.primary ? 'translateY(-8px)' : 'none' }}>

              {/* Top accent line */}
              {plan.primary && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                              background: `linear-gradient(90deg,${T.gn},#6de800,transparent)` }} />
              )}

              {/* Popular badge */}
              {plan.tag && (
                <div style={{ position: 'absolute', top: 20, right: 20,
                              background: T.gn, color: '#000', fontSize: 10.5,
                              fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
                              borderRadius: 20, padding: '3px 12px' }}>
                  {plan.tag}
                </div>
              )}

              {/* Plan name */}
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em',
                            textTransform: 'uppercase', color: plan.primary ? T.gn : T.g300,
                            marginBottom: 18 }}>
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 6 }}>
                {price === 0
                  ? <span className="mono" style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, color: T.w }}>
                      Free
                    </span>
                  : <>
                      <span style={{ fontSize: 22, fontWeight: 700, color: T.g200, alignSelf: 'flex-start', paddingTop: 10 }}>$</span>
                      <span className="mono" style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, color: T.w }}>
                        {price}
                      </span>
                      <span style={{ fontSize: 14, color: T.g300, marginBottom: 10 }}>/mo</span>
                    </>
                }
              </div>

              {/* Annual note */}
              {annual && price > 0 && (
                <div style={{ fontSize: 12, color: T.g300, marginBottom: 24 }}>
                  Billed ${price * 12}/year · <span style={{ color: T.gn }}>Save ${(plan.monthly - plan.annual) * 12}/yr</span>
                </div>
              )}
              {(!annual || price === 0) && <div style={{ marginBottom: 24 }} />}

              {/* Divider */}
              <div style={{ height: 1, background: plan.primary ? 'rgba(127,255,0,.12)' : T.b0, marginBottom: 22 }} />

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px' }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10,
                                       padding: '8px 0', fontSize: 14, color: T.g100,
                                       borderBottom: `1px solid ${T.b0}` }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                   background: plan.primary ? 'rgba(127,255,0,.12)' : 'rgba(255,255,255,.06)',
                                   border: plan.primary ? `1px solid ${T.gnB}` : `1px solid ${T.b1}`,
                                   display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5 5-5" stroke={plan.primary ? T.gn : T.g200}
                              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => setPage(plan.key === 'free' ? 'get-started' : 'get-started')}
                className={plan.primary ? 'bp' : 'bs'}
                style={{ width: '100%', fontSize: 14.5, fontWeight: 800,
                         padding: '13px 20px', justifyContent: 'center',
                         ...(plan.primary ? {} : { borderColor: T.b1 }) }}>
                {plan.cta} {plan.primary && <span className="arr">→</span>}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div style={{ textAlign: 'center', paddingBottom: 64, fontSize: 13.5, color: T.g300 }}>
        No credit card required for Free. Cancel anytime on Pro or Premium.
      </div>
    </div>
  )
}
