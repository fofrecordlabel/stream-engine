import { loadStripe } from '@stripe/stripe-js'
import { apiFetch } from './apiClient.js'

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
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

/**
 * Create a Stripe Checkout Session via the local backend only (secret key stays server-side).
 * Optional VITE_STRIPE_EDGE_URL overrides the base URL for non-local deployments.
 *
 * @param {Object} opts
 * @param {number}  opts.credits   - number of credits being purchased
 * @param {number}  opts.priceUsd  - dollar amount
 * @param {string}  opts.userId    - Supabase user ID
 * @param {string}  opts.packId    - e.g. 'starter' | 'pro' | 'scale'
 */
export async function createCheckoutSession({ credits, priceUsd, userId, packId, discountCode = null, invite = null }) {
  const edge = import.meta.env.VITE_STRIPE_EDGE_URL
  const res = edge
    ? await fetch(`${String(edge).replace(/\/$/, '')}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits, priceUsd, userId, packId, discountCode, invite }),
      })
    : await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits, priceUsd, userId, packId, discountCode, invite }),
      })

  if (!res.ok) throw new Error(`Checkout session failed: ${res.status}`)
  return res.json()  // { sessionId } — redirect to Stripe
}

/**
 * Stripe Checkout in subscription mode (7-day trial configured on server).
 * Server must set STRIPE_SUBSCRIPTION_PRICE_ID.
 */
export async function createSubscriptionCheckoutSession({ userId }) {
  const edge = import.meta.env.VITE_STRIPE_EDGE_URL
  const body = JSON.stringify({ userId })
  const res = edge
    ? await fetch(`${String(edge).replace(/\/$/, '')}/create-subscription-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    : await apiFetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
  if (!res.ok) {
    let msg = `Subscription checkout failed: ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

/**
 * Validate a discount code server-side.
 * Expected response shape (recommended):
 *  - { ok:true, code, type:'percent'|'fixed', amount, amountOffUsd, subtotalUsd, totalUsd }
 *  - { ok:false, error }
 */
export async function validateDiscountCode({ code, userId, subtotalUsd }) {
  const edge = import.meta.env.VITE_STRIPE_EDGE_URL
  const res = edge
    ? await fetch(`${String(edge).replace(/\/$/, '')}/validate-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId, subtotalUsd }),
      })
    : await apiFetch('/api/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId, subtotalUsd }),
      })
  if (!res.ok) throw new Error(`Discount validation failed: ${res.status}`)
  return res.json()
}

/**
 * Create a PaymentIntent for a campaign purchase (credits spend → real payment).
 */
export async function createCampaignPaymentIntent({ amountUsd, campaignId, userId }) {
  const edgeUrl = import.meta.env.VITE_STRIPE_EDGE_URL
  if (!edgeUrl) {
    return {
      demo: true,
      clientSecret: null,
      message: `Demo campaign payment: $${amountUsd}. Connect Stripe edge function to enable real payments.`,
    }
  }

  const res = await fetch(`${edgeUrl}/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountUsd, campaignId, userId }),
  })

  if (!res.ok) throw new Error(`PaymentIntent creation failed: ${res.status}`)
  return res.json()  // { clientSecret }
}
