import { loadStripe } from '@stripe/stripe-js'
import { apiFetch } from './apiClient.js'
import { env } from './env.js'

const PUBLISHABLE_KEY = env.stripePublishableKey
export const isStripeConfigured = !!PUBLISHABLE_KEY

let stripePromise = null
export function getStripe() {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null)
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY)
  return stripePromise
}

export const PLATFORM_FEE_PCT = 0.20   // 20%
export const CREDIT_TO_USD    = 0.80   // $0.80 per credit

export function creditsToUsd(credits) {
  return +(credits * CREDIT_TO_USD).toFixed(2)
}

export function usdToCredits(usd) {
  return Math.floor(usd / CREDIT_TO_USD)
}

export function calcFees(totalUsd) {
  const platformFee     = +(totalUsd * PLATFORM_FEE_PCT).toFixed(2)
  const curatorEarnings = +(totalUsd - platformFee).toFixed(2)
  return { totalUsd, platformFee, curatorEarnings }
}

async function readApiErrorMessage(res) {
  const j = await res.json().catch(() => ({}))
  return j?.error || j?.message || `Request failed (${res.status})`
}

/**
 * Create a Stripe Checkout Session via this repo’s Express API (secret key stays server-side).
 */
export async function createCheckoutSession({ credits, priceUsd, userId, packId, discountCode = null, invite = null }) {
  const res = await apiFetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credits, priceUsd, userId, packId, discountCode, invite }),
  })
  if (!res.ok) throw new Error(await readApiErrorMessage(res))
  return res.json()
}

/**
 * Stripe Checkout in subscription mode (trial configured on server).
 */
export async function createSubscriptionCheckoutSession({ userId }) {
  const res = await apiFetch('/api/create-subscription-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) throw new Error(await readApiErrorMessage(res))
  return res.json()
}

/**
 * Validate a discount code server-side.
 */
export async function validateDiscountCode({ code, userId, subtotalUsd }) {
  const res = await apiFetch('/api/validate-discount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, userId, subtotalUsd }),
  })
  if (!res.ok) throw new Error(await readApiErrorMessage(res))
  return res.json()
}

/**
 * PaymentIntent for campaign / one-off flows (client secret for Stripe.js).
 */
/**
 * Exclusive lane — guest checkout (email + Spotify track, no StreamEngine account).
 */
export async function createExclusiveGuestCheckoutSession({ qty, youPayUsd, email, spotifyTrackUrl, name = '' }) {
  const res = await apiFetch('/api/create-exclusive-guest-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty, youPayUsd, email, spotifyTrackUrl, name }),
  })
  if (!res.ok) throw new Error(await readApiErrorMessage(res))
  return res.json()
}

export async function createCampaignPaymentIntent({ amountUsd, campaignId, userId }) {
  const res = await apiFetch('/api/billing/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountUsd, campaignId, userId }),
  })
  if (!res.ok) {
    const msg = await readApiErrorMessage(res)
    return { demo: false, clientSecret: null, error: msg }
  }
  const j = await res.json().catch(() => ({}))
  if (!j?.clientSecret) {
    return { demo: false, clientSecret: null, error: j?.error || 'No client secret returned' }
  }
  return { demo: false, clientSecret: j.clientSecret, error: null }
}
