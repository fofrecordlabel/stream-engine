import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../../tokens.js'
import { useToast } from '../../context/ToastContext.jsx'
import {
  EXCLUSIVE_DIRECT_BASE_USD,
  exclusiveDirectQuote,
  saveExclusiveQuoteIntent,
} from '../../lib/exclusiveSubmissionPricing.js'

const exclusiveBtnStyle = {
  flex: 1,
  padding: '14px 18px',
  fontSize: 14,
  minWidth: 118,
  background: '#fff',
  color: '#0a0a0b',
  border: '1px solid rgba(255,255,255,.95)',
  borderRadius: 12,
  fontWeight: 900,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  boxShadow: '0 8px 28px rgba(0,0,0,.25)',
  transition: 'transform .12s ease, box-shadow .12s ease',
}

/**
 * White “Exclusive” hero CTA + volume modal (same behavior as prior HeroSpotifySearch).
 */
export default function ExclusiveLaneOffer({ setPage }) {
  const toast = useToast()
  const [exclusiveOpen, setExclusiveOpen] = useState(false)
  const [exclusiveQty, setExclusiveQty] = useState(1)
  const exclusiveQuote = useMemo(() => exclusiveDirectQuote(exclusiveQty), [exclusiveQty])

  const confirmExclusive = () => {
    saveExclusiveQuoteIntent({
      kind: 'exclusive_direct',
      ...exclusiveQuote,
      baseUsd: EXCLUSIVE_DIRECT_BASE_USD,
    })
    setExclusiveOpen(false)
    toast.success(
      `${exclusiveQuote.qty} exclusive slot${exclusiveQuote.qty === 1 ? '' : 's'} · $${exclusiveQuote.youPayUsd.toFixed(2)} saved to your session. Continue in Billing to pay.`,
      'Exclusive',
    )
    setPage('subscriptions')
  }

  const exclusiveModal =
    exclusiveOpen &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exclusive-modal-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 400,
          background: 'rgba(0,0,0,.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
        onClick={() => setExclusiveOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setExclusiveOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 18,
            background: 'linear-gradient(145deg,#141418,#0c0c10)',
            border: `1px solid ${T.b0}`,
            boxShadow: '0 32px 80px rgba(0,0,0,.65)',
            padding: '24px 22px 22px',
          }}
        >
          <div id="exclusive-modal-title" style={{ fontSize: 11, fontWeight: 800, color: T.gn, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Exclusive lane
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: T.w, letterSpacing: '-.03em', marginBottom: 10, lineHeight: 1.15 }}>
            Direct submissions — ${EXCLUSIVE_DIRECT_BASE_USD} each
          </h2>
          <p style={{ fontSize: 13.5, color: T.g200, lineHeight: 1.6, marginBottom: 18 }}>
            Priority direct curator submissions. Order more and your <strong style={{ color: T.w }}>per-slot price drops automatically</strong> (up to 25% off at 25+).
          </p>
          <div style={{ fontSize: 11.5, color: T.g300, marginBottom: 14, lineHeight: 1.5 }}>
            Volume: <span style={{ color: T.gn }}>3+</span> −5% · <span style={{ color: T.gn }}>5+</span> −10% · <span style={{ color: T.gn }}>10+</span> −15% · <span style={{ color: T.gn }}>15+</span> −20% · <span style={{ color: T.gn }}>25+</span> −25%
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.g200, display: 'block', marginBottom: 8 }}>How many direct submissions?</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              className="bt"
              onClick={() => setExclusiveQty((q) => Math.max(1, q - 1))}
              style={{ padding: '10px 14px', fontSize: 16, fontWeight: 800 }}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={50}
              value={exclusiveQty}
              onChange={(e) => setExclusiveQty(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 800,
                padding: '10px 8px',
                borderRadius: 10,
                border: `1px solid ${T.b1}`,
                background: T.card,
                color: T.w,
              }}
            />
            <button
              type="button"
              className="bt"
              onClick={() => setExclusiveQty((q) => Math.min(50, q + 1))}
              style={{ padding: '10px 14px', fontSize: 16, fontWeight: 800 }}
            >
              +
            </button>
          </div>
          <div
            style={{
              borderRadius: 12,
              padding: '14px 16px',
              background: 'rgba(255,255,255,.04)',
              border: `1px solid ${T.b0}`,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.g300, marginBottom: 6 }}>
              <span>List ({exclusiveQuote.qty} × ${EXCLUSIVE_DIRECT_BASE_USD})</span>
              <span className="mono" style={{ textDecoration: exclusiveQuote.savedUsd > 0 ? 'line-through' : 'none', color: T.g200 }}>
                ${exclusiveQuote.listSubtotalUsd.toFixed(2)}
              </span>
            </div>
            {exclusiveQuote.savedUsd > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.gn, marginBottom: 6 }}>
                <span>Volume savings ({exclusiveQuote.discountPct}%)</span>
                <span className="mono">−${exclusiveQuote.savedUsd.toFixed(2)}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: T.w, paddingTop: 8, borderTop: `1px solid ${T.b0}` }}>
              <span>You pay</span>
              <span className="mono" style={{ color: T.gn }}>
                ${exclusiveQuote.youPayUsd.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: T.g400, marginTop: 8, lineHeight: 1.45 }}>
              ≈ ${exclusiveQuote.unitUsd.toFixed(2)} per submission after discount.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="bt" onClick={() => setExclusiveOpen(false)} style={{ flex: 1, padding: '12px 14px', fontSize: 14, justifyContent: 'center' }}>
              Cancel
            </button>
            <button type="button" className="bp" onClick={confirmExclusive} style={{ flex: 1.2, padding: '12px 14px', fontSize: 14, justifyContent: 'center' }}>
              Continue → Billing
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      {exclusiveModal}
      <button type="button" onClick={() => setExclusiveOpen(true)} style={exclusiveBtnStyle}>
        Exclusive
      </button>
    </>
  )
}
