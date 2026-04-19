/** List price per exclusive direct submission (curator bypass / priority lane). */
export const EXCLUSIVE_DIRECT_BASE_USD = 15

const MIN_QTY = 1
const MAX_QTY = 50

function clampQty(qty) {
  const n = Math.floor(Number(qty) || 1)
  return Math.min(MAX_QTY, Math.max(MIN_QTY, n))
}

/**
 * Unit price after volume discount (larger orders = lower per-unit).
 * @param {number} qty
 * @returns {number}
 */
export function exclusiveDirectUnitUsd(qty) {
  const q = clampQty(qty)
  let off = 0
  if (q >= 25) off = 0.25
  else if (q >= 15) off = 0.2
  else if (q >= 10) off = 0.15
  else if (q >= 5) off = 0.1
  else if (q >= 3) off = 0.05
  return Math.round(EXCLUSIVE_DIRECT_BASE_USD * (1 - off) * 100) / 100
}

/**
 * @param {number} qty
 * @returns {{ qty: number, unitUsd: number, listSubtotalUsd: number, youPayUsd: number, savedUsd: number, discountPct: number }}
 */
export function exclusiveDirectQuote(qty) {
  const q = clampQty(qty)
  const unitUsd = exclusiveDirectUnitUsd(q)
  const youPayUsd = Math.round(unitUsd * q * 100) / 100
  const listSubtotalUsd = Math.round(EXCLUSIVE_DIRECT_BASE_USD * q * 100) / 100
  const savedUsd = Math.round((listSubtotalUsd - youPayUsd) * 100) / 100
  const discountPct = listSubtotalUsd > 0 ? Math.round((savedUsd / listSubtotalUsd) * 1000) / 10 : 0
  return { qty: q, unitUsd, listSubtotalUsd, youPayUsd, savedUsd, discountPct }
}

const STORAGE_KEY = 'se_exclusive_quote'

export function saveExclusiveQuoteIntent(quote) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...quote, savedAt: Date.now() }))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadExclusiveQuoteIntent() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearExclusiveQuoteIntent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
