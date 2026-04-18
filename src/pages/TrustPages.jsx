import { useEffect, useState } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { isDemo, supabase } from '../lib/supabase.js'

function TrustLayout({ setPage, badge, title, subtitle, children }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />
      <div className="se-shell" style={{ maxWidth: 900, margin: '0 auto', paddingTop: 110, paddingBottom: 64 }}>
        <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(255,255,255,.04)',
          border: `1px solid ${T.b0}`,
          borderRadius: 999,
          padding: '4px 14px',
          fontSize: 11.5,
          fontWeight: 900,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: T.g200,
          marginBottom: 18,
        }}>
          {badge}
        </div>
        <h1 style={{ fontSize: 'clamp(30px,4.8vw,48px)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: 10 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 16, color: T.g200, lineHeight: 1.7, maxWidth: 760, margin: '0 auto 32px' }}>
            {subtitle}
          </p>
        )}
        </div>

        <div style={{
          background: `linear-gradient(145deg,${T.card},#0d0d10)`,
          border: `1px solid ${T.b0}`,
          borderRadius: 18,
          padding: '22px 22px',
          lineHeight: 1.75,
          color: T.g100,
          fontSize: 14.5,
        }}>
          {children}
        </div>

        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, flexWrap: 'wrap', color: T.g400, fontSize: 12.5 }}>
          <span>© {new Date().getFullYear()} StreamEngine</span>
          <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="na" onClick={() => setPage('terms')} style={{ background: 'none', border: 'none', color: T.g300, cursor: 'pointer' }}>Terms</button>
            <button className="na" onClick={() => setPage('privacy')} style={{ background: 'none', border: 'none', color: T.g300, cursor: 'pointer' }}>Privacy</button>
            <button className="na" onClick={() => setPage('contact')} style={{ background: 'none', border: 'none', color: T.g300, cursor: 'pointer' }}>Contact</button>
          </span>
        </div>
      </div>
    </div>
  )
}

export function TermsPage({ setPage }) {
  return (
    <TrustLayout
      setPage={setPage}
      badge="Legal"
      title="Terms of Service"
      subtitle="These terms are a lightweight MVP placeholder. Replace with counsel-reviewed terms before launch."
    >
      <p><strong>Using StreamEngine</strong> means you agree to these terms. If you do not agree, do not use the product.</p>
      <p><strong>Eligibility</strong>: You must be at least 13 years old and able to form a binding contract.</p>
      <p><strong>Content</strong>: You retain rights to your music and materials. You grant StreamEngine the limited right to process and display your submissions for product operation.</p>
      <p><strong>Curator decisions</strong>: Playlist placement and curator feedback are discretionary. We do not guarantee acceptance or results.</p>
      <p><strong>Payments</strong>: Credit purchases are processed by Stripe. Fees, taxes, and refunds (if any) are governed by your checkout receipt and applicable law.</p>
      <p><strong>Abuse</strong>: We may suspend accounts for fraud, harassment, spam, or policy violations.</p>
      <p><strong>Disclaimer</strong>: The service is provided “as is” without warranties. To the maximum extent permitted, StreamEngine is not liable for indirect or consequential damages.</p>
    </TrustLayout>
  )
}

export function PrivacyPage({ setPage }) {
  return (
    <TrustLayout
      setPage={setPage}
      badge="Trust"
      title="Privacy Policy"
      subtitle="MVP privacy overview. Replace with a full policy before production launch."
    >
      <p><strong>What we collect</strong>: account info (email, name), saved songs, submissions, curator feedback, and usage analytics.</p>
      <p><strong>How we use it</strong>: to operate the service, restore progress across sessions, prevent fraud, and improve features.</p>
      <p><strong>Payments</strong>: we do not store full card numbers. Stripe processes payment details.</p>
      <p><strong>Spotify links</strong>: we store track metadata (title, artist, artwork) to show saved songs and submission history.</p>
      <p><strong>Data retention</strong>: we retain data while your account is active, and may retain limited logs for security.</p>
      <p><strong>Your choices</strong>: you can delete saved songs and request account deletion via Contact.</p>
    </TrustLayout>
  )
}

export function ContactPage({ setPage }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const canSend = email.trim() && message.trim().length >= 10

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setSent(false)
    if (!canSend) { setErr('Please add your email and a message (10+ characters).'); return }
    // Fallback to mailto if demo/no backend.
    if (isDemo || !supabase) {
      const to = 'support@streamengine.app'
      const subj = encodeURIComponent(subject.trim() || 'StreamEngine support')
      const body = encodeURIComponent([`Name: ${name || '-'}`, `Email: ${email}`, '', message].join('\n'))
      window.location.href = `mailto:${to}?subject=${subj}&body=${body}`
      return
    }

    setSending(true)
    try {
      const { error } = await supabase.from('contact_inquiries').insert({
        name: name.trim() || 'Anonymous',
        email: email.trim(),
        subject: subject.trim() || null,
        message: message.trim(),
      })
      if (error) throw error
      setSent(true)
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    } catch (e2) {
      setErr(e2?.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <TrustLayout
      setPage={setPage}
      badge="Support"
      title="Contact"
      subtitle="Send a message to support. If the form can’t submit, we’ll fall back to email."
    >
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
            style={{ width:'100%', background:'rgba(255,255,255,.06)', border:`1px solid ${T.b0}`, borderRadius:12, padding:'11px 12px', color:T.w, outline:'none' }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            style={{ width:'100%', background:'rgba(255,255,255,.06)', border:`1px solid ${T.b0}`, borderRadius:12, padding:'11px 12px', color:T.w, outline:'none' }} />
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)"
          style={{ width:'100%', background:'rgba(255,255,255,.06)', border:`1px solid ${T.b0}`, borderRadius:12, padding:'11px 12px', color:T.w, outline:'none' }} />
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message (include any Spotify links)"
          rows={6}
          style={{ width:'100%', resize:'vertical', background:'rgba(255,255,255,.06)', border:`1px solid ${T.b0}`, borderRadius:12, padding:'11px 12px', color:T.w, outline:'none', lineHeight:1.6 }} />

        {err && <div style={{ padding:'10px 12px', borderRadius:12, background:'rgba(255,64,96,.08)', border:'1px solid rgba(255,64,96,.22)', color:T.red, fontSize:13, fontWeight:800 }}>⚠ {err}</div>}
        {sent && <div style={{ padding:'10px 12px', borderRadius:12, background:'rgba(127,255,0,.08)', border:`1px solid ${T.gnB}`, color:T.gn, fontSize:13, fontWeight:900 }}>✓ Message sent</div>}

        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button className="bp" type="submit" disabled={sending || !canSend} style={{ padding:'10px 14px', opacity:(sending || !canSend) ? 0.65 : 1 }}>
            {sending ? 'Sending…' : 'Send message'}
          </button>
          <a href="mailto:support@streamengine.app" style={{ color:T.g300, textDecoration:'underline', fontWeight:800, fontSize:13 }}>
            Or email support@streamengine.app
          </a>
        </div>
      </form>
    </TrustLayout>
  )
}

export function FAQPage({ setPage }) {
  return (
    <TrustLayout
      setPage={setPage}
      badge="FAQ"
      title="Frequently Asked Questions"
      subtitle="Quick answers for artists and curators."
    >
      <p><strong>Is placement guaranteed?</strong> No—curators decide. StreamEngine helps route music to relevant curators.</p>
      <p><strong>What are credits?</strong> Credits are used to submit to curators. Each curator has a credit price.</p>
      <p><strong>Can I delete a saved song?</strong> Yes—open the song details modal and delete it.</p>
      <p><strong>How fast do curators respond?</strong> Typically 18–72 hours in the demo flow; live response SLAs depend on curator marketplace rules.</p>
    </TrustLayout>
  )
}

export function HowItWorksPage({ setPage }) {
  return (
    <TrustLayout
      setPage={setPage}
      badge="Product"
      title="How It Works"
      subtitle="A simple, focused flow: save your track → select curators → submit."
    >
      <p><strong>1) Paste a Spotify track link</strong> on the homepage. StreamEngine fetches metadata and artwork.</p>
      <p><strong>2) Create an account</strong> to save your song and restore your progress after login.</p>
      <p><strong>3) Choose curators</strong> (Playlist Push). Each curator has a credit price.</p>
      <p><strong>4) Review and submit</strong>. Track statuses as curators respond.</p>
    </TrustLayout>
  )
}

