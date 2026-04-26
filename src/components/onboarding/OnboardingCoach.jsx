import { useEffect, useState } from 'react'
import { T } from '../../tokens.js'

/**
 * Lightweight spotlight coach for dashboard sidebars (data-coach targets).
 * @param {{ selector: string, title: string, body: string }[]} steps
 * @param {boolean} active
 * @param {number} stepIndex
 * @param {(nextIndex: number) => void} onSetStep
 * @param {() => void} onDismiss
 */
export default function OnboardingCoach({ steps, active, stepIndex, onSetStep, onDismiss }) {
  const [rect, setRect] = useState(null)
  const step = steps?.[stepIndex]

  useEffect(() => {
    if (!active || !step?.selector) {
      setRect(null)
      return
    }
    const measure = () => {
      const el = document.querySelector(step.selector)
      if (!el) {
        setRect(null)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const id = window.setInterval(measure, 400)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.clearInterval(id)
    }
  }, [active, step?.selector, stepIndex])

  if (!active || !step || stepIndex >= steps.length) return null

  const isLast = stepIndex >= steps.length - 1

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 12000, pointerEvents: 'auto' }}>
      {/* Dim everything except optional spotlight ring */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: rect ? 'rgba(0,0,0,.72)' : 'rgba(0,0,0,.78)',
          backdropFilter: 'blur(2px)',
        }}
      />
      {rect && rect.width > 0 && (
        <div
          style={{
            position: 'absolute',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,.72)',
            border: `2px solid ${T.gn}`,
            pointerEvents: 'none',
            transition: 'all .2s ease',
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          width: 'min(420px, calc(100vw - 32px))',
          background: `linear-gradient(145deg,${T.card},#0d0d10)`,
          border: `1px solid ${T.b1}`,
          borderRadius: 16,
          padding: '18px 18px 16px',
          boxShadow: '0 24px 80px rgba(0,0,0,.85)',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 900, color: T.g300, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Quick tour · {stepIndex + 1} / {steps.length}
        </div>
        <div style={{ fontSize: 17, fontWeight: 950, marginBottom: 8, color: T.w }}>{step.title}</div>
        <div style={{ fontSize: 13.5, color: T.g200, lineHeight: 1.65, marginBottom: 16 }}>{step.body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="bt" onClick={onDismiss} style={{ padding: '9px 14px', fontSize: 13 }}>
            Skip tour
          </button>
          <button
            type="button"
            className="bp"
            onClick={() => (isLast ? onDismiss() : onSetStep(stepIndex + 1))}
            style={{ padding: '9px 16px', fontSize: 13 }}
          >
            {isLast ? 'Done' : 'Next'} <span className="arr">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
