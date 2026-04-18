import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { T } from '../tokens.js'

const ToastCtx = createContext(null)
let _uid = 0

/* ── Single toast item ── */
function ToastItem({ toast, onRemove }) {
  const [out, setOut] = useState(false)

  const dismiss = useCallback(() => {
    setOut(true)
    setTimeout(() => onRemove(toast.id), 280)
  }, [toast.id, onRemove])

  useEffect(() => {
    const t = setTimeout(dismiss, toast.duration ?? 4000)
    return () => clearTimeout(t)
  }, [dismiss, toast.duration])

  const palette = {
    success: { border: 'rgba(16,185,129,.35)', icon: '#10b981', iconBg: 'rgba(16,185,129,.15)', bar: '#10b981', bg: 'rgba(16,185,129,.09)' },
    error:   { border: 'rgba(255,64,96,.35)',  icon: T.red,     iconBg: 'rgba(255,64,96,.13)',  bar: T.red,     bg: 'rgba(255,64,96,.09)'  },
    info:    { border: 'rgba(56,189,248,.3)',   icon: '#38bdf8', iconBg: 'rgba(56,189,248,.12)', bar: '#38bdf8', bg: 'rgba(56,189,248,.07)' },
  }
  const p = palette[toast.type] ?? palette.info

  const icons = { success: '✓', error: '✕', info: 'i' }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 11,
      padding: '12px 13px 12px 12px',
      borderRadius: 12, border: `1px solid ${p.border}`,
      background: `linear-gradient(135deg, #0f0f14, #101016)`,
      backdropFilter: 'blur(24px)',
      boxShadow: `0 8px 40px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)`,
      minWidth: 260, maxWidth: 360, position: 'relative', overflow: 'hidden',
      animation: out ? 'toastOut .28s ease forwards' : 'toastIn .3s cubic-bezier(.34,1.56,.64,1) both',
    }}>
      {/* Accent left bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: p.bar, borderRadius: '12px 0 0 12px' }} />

      {/* Icon */}
      <div style={{ width: 26, height: 26, borderRadius: 8, background: p.iconBg,
                    border: `1px solid ${p.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: p.icon, flexShrink: 0, marginLeft: 4 }}>
        {icons[toast.type]}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        {toast.title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: T.w, marginBottom: 2, lineHeight: 1.3 }}>
            {toast.title}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: T.g100, lineHeight: 1.45 }}>
          {toast.message}
        </div>
      </div>

      {/* Dismiss */}
      <button onClick={dismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer',
                 color: T.g400, fontSize: 17, lineHeight: 1, flexShrink: 0,
                 padding: '1px 4px', borderRadius: 6, transition: 'color .15s',
                 marginTop: -1 }}
        onMouseEnter={e => e.currentTarget.style.color = T.w}
        onMouseLeave={e => e.currentTarget.style.color = T.g400}>
        ×
      </button>
    </div>
  )
}

/* ── Container (portal) ── */
function ToastContainer({ toasts, removeToast }) {
  if (!toasts.length) return null
  return createPortal(
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      alignItems: 'flex-start', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'all' }}>
          <ToastItem toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  )
}

/* ── Provider ── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(p => p.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (message, title, duration) => {
      const id = ++_uid
      setToasts(p => [...p, { id, type: 'success', message, title, duration }])
    },
    error: (message, title, duration) => {
      const id = ++_uid
      setToasts(p => [...p, { id, type: 'error', message, title, duration }])
    },
    info: (message, title, duration) => {
      const id = ++_uid
      setToasts(p => [...p, { id, type: 'info', message, title, duration }])
    },
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastCtx.Provider>
  )
}

/* ── Hook ── */
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
