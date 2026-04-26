import { useEffect, useMemo, useRef } from 'react'
import { T } from '../../tokens.js'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'))
}

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  width = 520,
  zIndex = 900,
  initialFocus = 'first', // 'first' | 'close'
}) {
  const panelRef = useRef(null)
  const closeBtnRef = useRef(null)
  const lastFocusedRef = useRef(null)
  const labelId = useMemo(() => `m_${Math.random().toString(16).slice(2)}`, [])
  const descId = useMemo(() => `d_${Math.random().toString(16).slice(2)}`, [])

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement
    const bodyPrev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const t = window.setTimeout(() => {
      const root = panelRef.current
      const focusables = getFocusable(root)
      if (initialFocus === 'close' && closeBtnRef.current) closeBtnRef.current.focus()
      else (focusables[0] || root)?.focus?.()
    }, 0)

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const root = panelRef.current
      const focusables = getFocusable(root)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === root) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = bodyPrev
      const el = lastFocusedRef.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open, onClose, initialFocus])

  if (!open) return null

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', backdropFilter: 'blur(14px)', zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ width: `min(${width}px, 96vw)`, background: `linear-gradient(145deg,${T.card},#0d0d10)`, border: `1px solid ${T.b1}`, borderRadius: 20, padding: '22px 18px', outline: 'none' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            {title ? <div id={labelId} style={{ fontSize: 16, fontWeight: 950, marginBottom: description ? 6 : 0 }}>{title}</div> : null}
            {description ? <div id={descId} style={{ fontSize: 12.5, color: T.g300, lineHeight: 1.6 }}>{description}</div> : null}
          </div>
          <button
            type="button"
            className="bt"
            ref={closeBtnRef}
            onClick={() => onClose?.()}
            aria-label="Close dialog"
            style={{ padding: '8px 10px', fontSize: 13 }}
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

