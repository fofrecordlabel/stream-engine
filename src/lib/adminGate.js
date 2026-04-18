const KEY = 'streamengine.adminGate'
const TTL_MS = 1000 * 60 * 60 * 8 // 8 hours

export function unlockAdminGate() {
  if (typeof window === 'undefined') return
  const payload = { unlocked: true, at: Date.now() }
  window.sessionStorage.setItem(KEY, JSON.stringify(payload))
}

export function lockAdminGate() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(KEY)
}

export function isAdminUnlocked() {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return false
    const v = JSON.parse(raw)
    if (!v?.unlocked) return false
    if (!v?.at) return false
    if (Date.now() - v.at > TTL_MS) {
      lockAdminGate()
      return false
    }
    return true
  } catch {
    return false
  }
}

