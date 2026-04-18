import { useEffect, useMemo, useState } from 'react'
import { T } from '../../tokens.js'
import { unlockAdminGate } from '../../lib/adminGate.js'

export default function AdminGateModal({ open, onClose, onUnlocked }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setKey('')
    setError('')
  }, [open])

  const canSubmit = useMemo(() => key.trim().length > 0, [key])

  if (!open) return null

  const submit = () => {
    setError('')
    if (key.trim() !== 'fof2024') {
      setError('Invalid access key.')
      return
    }
    unlockAdminGate()
    onUnlocked?.()
    try {
      window.dispatchEvent(new Event('se-admin-gate-unlock'))
    } catch { /* ignore */ }
    onClose?.()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: 440,
        borderRadius: 18,
        border: `1px solid ${T.b1}`,
        background: `linear-gradient(180deg, rgba(15,15,20,.98), rgba(10,10,12,.98))`,
        boxShadow: '0 30px 90px rgba(0,0,0,.75)',
        padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900, letterSpacing: '-.02em', color: T.w, fontSize: 15 }}>
            Admin access
          </div>
          <button className="bt" onClick={onClose} style={{ padding: '7px 10px' }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: T.g200, lineHeight: 1.55, marginBottom: 12 }}>
          This is a temporary session gate for internal use. It’s not a replacement for role-based admin auth.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter access key"
            type="password"
            autoFocus
            style={{
              width: '100%',
              background: 'rgba(255,255,255,.06)',
              border: `1px solid ${T.b1}`,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              color: T.w,
              outline: 'none',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,64,96,.08)', border: '1px solid rgba(255,64,96,.24)', color: T.red, fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="bt" onClick={onClose} style={{ padding: '10px 12px' }}>Cancel</button>
            <button className="bp" disabled={!canSubmit} onClick={submit} style={{ padding: '10px 14px', opacity: canSubmit ? 1 : 0.55 }}>
              Unlock Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

