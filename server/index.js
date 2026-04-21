import express from 'express'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { fetchTrackFromWebApi, fetchPlaylistFromWebApi, searchTracksFromWebApi } from './spotifyServer.js'
import { normalizeSpotifyPlaylistUrl, normalizeSpotifyTrackUrl } from './spotifyUrls.js'
import { exclusiveDirectQuote } from './exclusivePricing.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Primary: server/.env (secrets). Secondary: repo root .env for shared keys without overwriting server.
dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false })

const app = express()
app.disable('x-powered-by')

const PORT = (() => {
  const n = Number(process.env.PORT)
  return Number.isFinite(n) && n > 0 ? n : 3333
})()

const SPOTIFY_OEMBED = 'https://open.spotify.com/oembed'

async function fetchSpotifyOEmbed(url) {
  const endpoint = `${SPOTIFY_OEMBED}?url=${encodeURIComponent(url)}&format=json`
  const r = await fetch(endpoint)
  if (!r.ok) throw new Error(`Spotify oEmbed ${r.status}`)
  return r.json()
}

function getServerEnv(name, fallbackName = null) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined)
}

function corsExtraOrigins() {
  const raw = getServerEnv('CORS_ALLOW_ORIGINS', '') || ''
  return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
}

/** Origins derived from APP_URL (supports comma-separated deploy + preview URLs). */
function appUrlOriginsList() {
  const raw = (getServerEnv('APP_URL', 'VITE_APP_URL') || getServerEnv('PUBLIC_APP_URL') || '').trim()
  if (!raw) return []
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const p of parts) {
    try {
      out.push(new URL(p).origin)
    } catch {
      /* ignore invalid segment */
    }
  }
  return out
}

app.use((req, res, next) => {
  const origin = req.headers.origin || ''
  const localhost =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin) ||
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)
  const appOrigins = appUrlOriginsList()
  const extras = corsExtraOrigins()
  const allow =
    localhost ||
    (!!origin && appOrigins.includes(origin)) ||
    (!!origin && extras.includes(origin))

  if (allow && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

/** Registered before other routes so deploy health probes always return JSON. */
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'streamengine-api', ts: new Date().toISOString() })
})
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'streamengine-api', ts: new Date().toISOString() })
})

function getSupabaseAdmin() {
  const url = getServerEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceKey = getServerEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function setProfileSubscriptionTier(supa, userId, tier) {
  if (!supa || !userId) return
  const t = tier === 'pro' || tier === 'premium' ? tier : 'free'
  const { error } = await supa
    .from('profiles')
    .update({ subscription_tier: t, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) console.error('[StreamEngine] setProfileSubscriptionTier', error.message)
}

async function syncSubscriptionTierFromStripeSubscription(subscription) {
  const supa = getSupabaseAdmin()
  if (!supa || !subscription) return
  const userId = subscription.metadata?.user_id || null
  if (!userId) return
  const st = subscription.status
  if (st === 'active' || st === 'trialing' || st === 'past_due') {
    await setProfileSubscriptionTier(supa, userId, 'pro')
  } else if (st === 'canceled' || st === 'unpaid' || st === 'incomplete_expired') {
    await setProfileSubscriptionTier(supa, userId, 'free')
  }
}

function getStripe() {
  const key = String(getServerEnv('STRIPE_SECRET_KEY') || '').trim()
  if (!key) return null
  return new Stripe(key, { apiVersion: '2024-06-20' })
}

/** Stripe Checkout success/cancel URLs + CORS matching. */
function checkoutAppUrl() {
  return String(getServerEnv('APP_URL', 'VITE_APP_URL') || getServerEnv('PUBLIC_APP_URL') || '').trim()
}

function stripeAppUrlBillingError() {
  const stripe = getStripe()
  const appUrl = checkoutAppUrl()
  if (stripe && appUrl) return null
  const parts = []
  if (!stripe) parts.push('STRIPE_SECRET_KEY is not set on the API server (add it in Render → Environment — never on Netlify)')
  if (!appUrl) parts.push('APP_URL is not set on the API server (set to your live site origin, e.g. https://streamengineinc.com)')
  return `Billing not configured (${parts.join('; ')}). On Netlify use only VITE_STRIPE_PUBLISHABLE_KEY; it must be from the same Stripe account as STRIPE_SECRET_KEY.`
}

function toCents(usd) {
  const n = Number(usd)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.round(n * 100))
}

async function validateDiscountInternal({ code, subtotalCents }) {
  const supa = getSupabaseAdmin()
  if (!supa) return { ok: false, error: 'Supabase service role not configured' }
  const clean = (code || '').trim().toUpperCase()
  if (!clean) return { ok: false, error: 'Missing code' }
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) return { ok: false, error: 'Invalid subtotal' }

  const { data, error } = await supa
    .from('discount_codes')
    .select('*')
    .eq('code', clean)
    .maybeSingle()
  if (error) return { ok: false, error: error.message || 'Discount lookup failed' }
  if (!data) return { ok: false, error: 'Invalid code' }
  if (!data.active) return { ok: false, error: 'Code is inactive' }
  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return { ok: false, error: 'Code expired' }
  if (data.usage_limit != null && data.usage_count != null && data.usage_count >= data.usage_limit) return { ok: false, error: 'Code exhausted' }
  if (data.min_amount_cents != null && subtotalCents < data.min_amount_cents) return { ok: false, error: 'Subtotal too low for this code' }

  let amountOffCents = 0
  if (data.type === 'percent') {
    amountOffCents = Math.floor((subtotalCents * Number(data.amount)) / 100)
  } else if (data.type === 'fixed') {
    amountOffCents = Math.min(subtotalCents, Number(data.amount))
  } else {
    return { ok: false, error: 'Unsupported discount type' }
  }

  const totalCents = Math.max(0, subtotalCents - amountOffCents)
  return {
    ok: true,
    code: clean,
    discount_code_id: data.id,
    type: data.type,
    amount: data.amount,
    currency: data.currency || 'usd',
    subtotalCents,
    amountOffCents,
    totalCents,
  }
}

async function upsertOrderAndCreditsFromCheckoutSession(session) {
  const md = session.metadata || {}
  /** Guest exclusive lane — Stripe only; no Supabase user / credits row. */
  if (String(md.billing_kind || '') === 'exclusive_guest') {
    return { ok: true, orderId: null, status: session.payment_status || 'paid', exclusiveGuest: true }
  }

  const stripe = getStripe()
  const supa = getSupabaseAdmin()
  if (!stripe || !supa) throw new Error('Billing not configured')

  const userId = md.user_id || null
  const credits = Number(md.credits || 0)
  const subtotal = Number(md.subtotal_cents || 0)
  const discount = Number(md.discount_cents || 0)
  const total = Number(md.total_cents || 0)
  const discountCode = md.discount_code || null

  const orderRow = {
    user_id: userId,
    pack_id: md.pack_id || null,
    credits_purchased: credits,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    amount_subtotal: subtotal,
    amount_discount: discount,
    amount_total: total,
    currency: (session.currency || md.currency || 'usd'),
    status: session.payment_status === 'paid' ? 'paid' : 'created',
    discount_code: discountCode,
    invite_code: md.invite_code || null,
    referral_code: md.referral_code || null,
    source: md.source || null,
    updated_at: new Date().toISOString(),
  }

  const { data: order, error: orderErr } = await supa
    .from('playlist_push_orders')
    .upsert(orderRow, { onConflict: 'stripe_session_id' })
    .select()
    .single()
  if (orderErr) throw orderErr

  if (discountCode && discount > 0) {
    const { data: dc } = await supa.from('discount_codes').select('*').eq('code', discountCode).maybeSingle()
    if (dc?.id) {
      await supa
        .from('discount_codes')
        .update({ usage_count: (dc.usage_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', dc.id)
      await supa.from('order_discounts').insert({
        order_id: order.id,
        discount_code_id: dc.id,
        amount_applied: discount,
      })
    }
  }

  if (session.payment_status === 'paid' && userId && credits > 0) {
    await supa.from('credits_ledger').insert({
      user_id: userId,
      amount: credits,
      reason: 'purchase',
      stripe_payment_id: session.payment_intent || session.id,
    })
  }

  if (String(md.billing_kind || '') === 'subscription' && userId) {
    await setProfileSubscriptionTier(supa, userId, 'pro')
  }

  return { ok: true, orderId: order.id, status: order.status }
}

// Stripe webhook MUST use raw body.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe()
  const supa = getSupabaseAdmin()
  const secret = getServerEnv('STRIPE_WEBHOOK_SECRET')
  if (!stripe || !secret || !supa) return res.status(500).send('Server billing not configured')

  let event
  try {
    const sig = req.headers['stripe-signature']
    event = stripe.webhooks.constructEvent(req.body, sig, secret)
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      await upsertOrderAndCreditsFromCheckoutSession(session)
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      await syncSubscriptionTierFromStripeSubscription(sub)
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      await supa
        .from('playlist_push_orders')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('stripe_session_id', session.id)
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object
      await supa
        .from('playlist_push_orders')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', pi.id)
    }

    return res.json({ received: true })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Webhook handler failed' })
  }
})

// JSON body for all other routes
app.use(express.json({ limit: '1mb' }))

/**
 * Spotify metadata: Web API (client credentials) when server has SPOTIFY_CLIENT_ID/SECRET; else oEmbed.
 * GET /api/spotify/track?url=https://open.spotify.com/track/...
 * GET /api/spotify/playlist?url=https://open.spotify.com/playlist/...
 */
app.get('/api/spotify/track', async (req, res) => {
  try {
    const raw = String(req.query?.url || '').trim()
    const url = normalizeSpotifyTrackUrl(raw)
    if (!url.includes('open.spotify.com/track/')) return res.status(400).json({ ok: false, error: 'Invalid track url' })
    const idMatch = url.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)
    const trackId = idMatch?.[1] || null
    if (trackId) {
      const api = await fetchTrackFromWebApi(trackId)
      if (api) {
        return res.json({
          ok: true,
          type: 'track',
          id: api.id,
          title: api.title,
          artist: api.artist,
          artworkUrl: api.artworkUrl,
          spotifyUrl: api.spotifyUrl || url,
          previewUrl: api.previewUrl || null,
          durationMs: api.durationMs ?? null,
          source: 'web_api',
        })
      }
    }
    const d = await fetchSpotifyOEmbed(url)
    return res.json({
      ok: true,
      type: 'track',
      id: trackId,
      title: d.title || '',
      artist: d.author_name || '',
      artworkUrl: d.thumbnail_url || null,
      spotifyUrl: url,
      source: 'oembed',
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Spotify fetch failed' })
  }
})

/** GET /api/spotify/search?q=artist+or+song&limit=10 — requires server Spotify client credentials. */
app.get('/api/spotify/search', async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim()
    if (q.length < 2) {
      return res.status(400).json({ ok: false, error: 'Enter at least 2 characters' })
    }
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query?.limit || '10'), 10) || 10))
    const id = String(getServerEnv('SPOTIFY_CLIENT_ID', 'VITE_SPOTIFY_CLIENT_ID') || '').trim()
    const secret = String(getServerEnv('SPOTIFY_CLIENT_SECRET') || '').trim()
    if (!id || !secret) {
      return res.json({
        ok: true,
        tracks: [],
        searchConfigured: false,
        hint: 'Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the API server (Render → your web service → Environment). Redeploy after saving.',
      })
    }
    const tracks = await searchTracksFromWebApi(q, limit)
    if (tracks == null) {
      return res.json({
        ok: true,
        tracks: [],
        searchConfigured: false,
        hint: 'Spotify client credentials failed (check SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET on Render and that this app is allowed in the Spotify Developer Dashboard).',
      })
    }
    return res.json({ ok: true, tracks, searchConfigured: true })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Search failed' })
  }
})

app.get('/api/spotify/health', (_req, res) => {
  const id = getServerEnv('SPOTIFY_CLIENT_ID', 'VITE_SPOTIFY_CLIENT_ID')
  res.json({
    ok: true,
    clientCredentialsConfigured: !!(id && getServerEnv('SPOTIFY_CLIENT_SECRET')),
  })
})

app.get('/api/spotify/playlist', async (req, res) => {
  try {
    const raw = String(req.query?.url || '').trim()
    let url = normalizeSpotifyPlaylistUrl(raw)
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    url = normalizeSpotifyPlaylistUrl(url)
    const idMatch = String(url).match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/i)
    const playlistId = idMatch?.[1] || null
    if (!playlistId) {
      return res.status(400).json({ ok: false, error: 'Invalid playlist url (use open.spotify.com/playlist/… or spotify:playlist:…)' })
    }
    const canonical = `https://open.spotify.com/playlist/${playlistId}`
    const api = await fetchPlaylistFromWebApi(playlistId)
    if (api) {
      return res.json({
        ok: true,
        type: 'playlist',
        id: api.id,
        name: api.name,
        owner: api.owner,
        artworkUrl: api.artworkUrl,
        spotifyUrl: api.spotifyUrl || canonical,
        followers: api.followers,
        trackCount: api.trackCount,
        source: 'web_api',
      })
    }
    const d = await fetchSpotifyOEmbed(canonical)
    return res.json({
      ok: true,
      type: 'playlist',
      id: playlistId,
      name: d.title || '',
      owner: d.author_name || null,
      artworkUrl: d.thumbnail_url || null,
      spotifyUrl: canonical,
      followers: null,
      trackCount: null,
      source: 'oembed',
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Spotify fetch failed' })
  }
})

/**
 * POST /api/billing/validate-discount
 *
 * Request:
 *  { code: string, subtotalUsd: number }
 *
 * Response:
 *  { ok:true, code, type, amount, currency, subtotalCents, amountOffCents, totalCents }
 *  { ok:false, error }
 */
async function handleValidateDiscount(req, res) {
  try {
    const { code, subtotalUsd } = req.body || {}
    const subtotalCents = toCents(subtotalUsd)
    if (subtotalCents == null) return res.status(400).json({ ok: false, error: 'Invalid subtotalUsd' })
    const result = await validateDiscountInternal({ code, subtotalCents })
    return res.status(result.ok ? 200 : 400).json(result)
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Discount validation failed' })
  }
}

// Required contract: POST /validate-discount (proxied under /api)
app.post('/api/validate-discount', handleValidateDiscount)
app.post('/validate-discount', handleValidateDiscount)
app.post('/api/billing/validate-discount', handleValidateDiscount)

/**
 * POST /api/billing/create-checkout
 *
 * Request:
 *  {
 *    credits: number,
 *    priceUsd: number,
 *    userId: string,
 *    packId: string,
 *    discountCode?: string | null,
 *    invite?: { code?: string|null, ref?: string|null, src?: string|null } | null
 *  }
 *
 * Response:
 *  { ok:true, sessionId: string }
 *  { ok:false, error }
 */
/**
 * POST /api/create-exclusive-guest-checkout
 * Body: { qty, youPayUsd, email, spotifyTrackUrl, name? } — no account required.
 */
async function handleExclusiveGuestCheckout(req, res) {
  try {
    const billingErr = stripeAppUrlBillingError()
    if (billingErr) {
      return res.status(503).json({ ok: false, error: billingErr })
    }
    const stripe = getStripe()
    const appUrl = checkoutAppUrl()

    const { qty, youPayUsd, email, spotifyTrackUrl, name } = req.body || {}
    const q = Math.min(50, Math.max(1, parseInt(String(qty || '1'), 10) || 1))
    const quote = exclusiveDirectQuote(q)
    const clientPay = Number(youPayUsd)
    if (!Number.isFinite(clientPay) || Math.abs(clientPay - quote.youPayUsd) > 0.02) {
      return res.status(400).json({ ok: false, error: 'Price mismatch — refresh the page and try again.' })
    }

    const em = String(email || '').trim().toLowerCase()
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return res.status(400).json({ ok: false, error: 'A valid email is required' })
    }

    const rawUrl = String(spotifyTrackUrl || '').trim()
    const trackUrl = normalizeSpotifyTrackUrl(rawUrl)
    if (!trackUrl.includes('open.spotify.com/track/')) {
      return res.status(400).json({ ok: false, error: 'Paste a Spotify track link (open.spotify.com/track/…)' })
    }

    const finalCents = Math.round(quote.youPayUsd * 100)
    const nm = String(name || '').trim().slice(0, 120)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: em,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: finalCents,
          product_data: {
            name: `Exclusive direct submissions (${quote.qty} slot${quote.qty === 1 ? '' : 's'})`,
            description: `Guest · ${trackUrl}`,
          },
        },
      }],
      success_url: `${appUrl.replace(/\/$/, '')}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl.replace(/\/$/, '')}/checkout-cancel`,
      metadata: {
        billing_kind: 'exclusive_guest',
        exclusive_qty: String(quote.qty),
        guest_email: em,
        guest_name: nm,
        spotify_track_url: trackUrl,
        currency: 'usd',
        total_cents: String(finalCents),
        credits: '0',
        user_id: '',
        pack_id: `exclusive_guest_${quote.qty}`,
      },
    })
    return res.json({ ok: true, sessionId: session.id })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Checkout session failed' })
  }
}

async function handleCreateCheckout(req, res) {
  try {
    const stripe = getStripe()
    const supa = getSupabaseAdmin()
    const appUrl = checkoutAppUrl()
    if (!stripe || !appUrl) {
      return res.status(503).json({ ok: false, error: stripeAppUrlBillingError() || 'Billing not configured' })
    }
    if (!supa) {
      return res.status(503).json({
        ok: false,
        error:
          'Billing not configured (SUPABASE_SERVICE_ROLE_KEY missing on the API server — set it in Render alongside STRIPE_SECRET_KEY).',
      })
    }

    const { credits, priceUsd, userId, packId, discountCode, invite } = req.body || {}
    if (!userId || typeof userId !== 'string') return res.status(400).json({ ok: false, error: 'Missing userId' })
    if (!Number.isFinite(Number(credits)) || Number(credits) <= 0) return res.status(400).json({ ok: false, error: 'Invalid credits' })
    if (!packId || typeof packId !== 'string') return res.status(400).json({ ok: false, error: 'Missing packId' })

    const subtotalCents = toCents(priceUsd)
    if (subtotalCents == null || subtotalCents <= 0) return res.status(400).json({ ok: false, error: 'Invalid priceUsd' })

    let discount = { ok: true, amountOffCents: 0, totalCents: subtotalCents, code: null, currency: 'usd' }
    if (discountCode) {
      const r = await validateDiscountInternal({ code: discountCode, subtotalCents })
      if (!r.ok) return res.status(400).json(r)
      discount = r
    }

    const finalCents = discount.totalCents
    const currency = (discount.currency || 'usd').toLowerCase()
    const cleanInvite = invite || null

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: finalCents,
          product_data: {
            name: `StreamEngine Credits (${Number(credits)} credits)`,
          },
        },
      }],
      success_url: `${appUrl.replace(/\/$/, '')}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl.replace(/\/$/, '')}/checkout-cancel`,
      metadata: {
        user_id: userId,
        credits: String(Number(credits)),
        pack_id: packId,
        currency,
        subtotal_cents: String(subtotalCents),
        discount_cents: String(discount.amountOffCents || 0),
        total_cents: String(finalCents),
        discount_code: discount.code || '',
        invite_code: cleanInvite?.code || '',
        referral_code: cleanInvite?.ref || '',
        source: cleanInvite?.src || '',
      },
    })

    // Create a placeholder order row immediately (optional but useful for history)
    await supa.from('playlist_push_orders').upsert({
      user_id: userId,
      pack_id: packId,
      credits_purchased: Number(credits),
      stripe_session_id: session.id,
      amount_subtotal: subtotalCents,
      amount_discount: discount.amountOffCents || 0,
      amount_total: finalCents,
      currency,
      status: 'created',
      discount_code: discount.code || null,
      invite_code: cleanInvite?.code || null,
      referral_code: cleanInvite?.ref || null,
      source: cleanInvite?.src || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_session_id' })

    return res.json({ ok: true, sessionId: session.id })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Checkout session failed' })
  }
}

/**
 * POST /api/create-subscription-checkout
 * Body: { userId: string }
 * Requires STRIPE_SUBSCRIPTION_PRICE_ID (Stripe Price ID for recurring plan).
 */
async function handleCreateSubscriptionCheckout(req, res) {
  try {
    const billingErr = stripeAppUrlBillingError()
    if (billingErr) {
      return res.status(503).json({ ok: false, error: billingErr })
    }
    const stripe = getStripe()
    const appUrl = checkoutAppUrl()
    const priceId = (process.env.STRIPE_SUBSCRIPTION_PRICE_ID || '').trim()
    if (!priceId) {
      return res.status(503).json({
        ok: false,
        error: 'Subscription checkout not configured (set STRIPE_SUBSCRIPTION_PRICE_ID on Render)',
      })
    }
    const { userId } = req.body || {}
    if (!userId || typeof userId !== 'string') return res.status(400).json({ ok: false, error: 'Missing userId' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${appUrl.replace(/\/$/, '')}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl.replace(/\/$/, '')}/checkout-cancel`,
      metadata: { user_id: userId, billing_kind: 'subscription' },
    })
    return res.json({ ok: true, sessionId: session.id })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Subscription checkout failed' })
  }
}

// Required contract: POST /create-checkout (proxied under /api)
app.post('/api/create-subscription-checkout', handleCreateSubscriptionCheckout)
app.post('/api/create-exclusive-guest-checkout', handleExclusiveGuestCheckout)
app.post('/create-exclusive-guest-checkout', handleExclusiveGuestCheckout)
app.post('/api/create-checkout', handleCreateCheckout)
app.post('/create-checkout', handleCreateCheckout)
app.post('/api/billing/create-checkout', handleCreateCheckout)

// Success sync (safe fallback if webhook isn't configured yet)
app.post('/api/sync-checkout', async (req, res) => {
  try {
    const stripe = getStripe()
    if (!stripe) return res.status(500).json({ ok: false, error: 'Stripe not configured' })
    const { sessionId } = req.body || {}
    if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing sessionId' })
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const result = await upsertOrderAndCreditsFromCheckoutSession(session)
    return res.json({ ok: true, ...result, payment_status: session.payment_status })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Sync failed' })
  }
})

app.post('/sync-checkout', async (req, res) => {
  // alias (non-proxied)
  try {
    const stripe = getStripe()
    if (!stripe) return res.status(500).json({ ok: false, error: 'Stripe not configured' })
    const { sessionId } = req.body || {}
    if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing sessionId' })
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const result = await upsertOrderAndCreditsFromCheckoutSession(session)
    return res.json({ ok: true, ...result, payment_status: session.payment_status })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Sync failed' })
  }
})

function getDemoResponse({ useCase, input, context }) {
  const safeInput = (input || '').trim()
  const song = context?.songTitle ? ` for "${context.songTitle}"` : ''
  const artist = context?.artistName ? ` by ${context.artistName}` : ''
  const curators = Array.isArray(context?.curators) && context.curators.length ? ` across ${context.curators.length} curators` : ''

  const common = `Demo mode (no OPENAI_API_KEY). Here’s a realistic draft you can use now.`
  switch (useCase) {
    case 'rewrite_pitch':
      return `${common}\n\nImproved pitch${song}${artist}:\n\n${safeInput ? `“${safeInput}”\n\n` : ''}I’m sharing a track that matches your playlist’s vibe: energetic, melodic, and built for repeat listens. In 2–3 sentences, here’s the hook: [insert hook], then [insert unique angle]. If this fits, I’d love to send the full promo package and follow up with a short release story.\n\nSuggested tone: confident, concise, and specific to your audience.`
    case 'score_playlist_fit':
      return `${common}\n\nPlaylist fit score: 86/100\n\nWhy it fits:\n- Strong genre alignment with your [target sub-genre].\n- Clear listener promise (hook + vibe).\n- Curator-friendly pitch structure.\n\nQuick upgrades:\n- Add one concrete reference (recent release / similar track).\n- Tighten the “why now” sentence to under 15 words.\n- Include 2 mood tags that match your playlist description.`
    case 'suggest_outreach':
      return `${common}\n\nOutreach message:\nHi ${context?.curatorName || '[Curator]'},\n\nI’d love to be considered for your playlist. My track ${context?.songTitle ? `"${context.songTitle}"` : ''} is built around ${context?.moodHint || 'your audience’s vibe'}, and I think it matches ${context?.playlistGenre || 'your genre'} listeners.\n\nIf it’s a fit, I can share a short release story and artwork-ready assets.\n\nThanks!\n${context?.artistName || '[Artist]'}`
    case 'summarize_feedback':
      return `${common}\n\nSummary of curator feedback:\n- Overall: Looks promising, but needs clearer targeting.\n- Requested edits: tighten the hook, add genre/mood specificity, and confirm the release moment.\n\nAction plan:\n1) Rewrite pitch in 2–3 sentences.\n2) Add 3 mood tags.\n3) Remove vague claims and replace with one concrete listener promise.`
    case 'generate_campaign_ideas':
      return `${common}\n\nCampaign ideas${curators}:\n1) “First-listen hook” pitch series: swap one line per curator to match their vibe.\n2) Mood-first submission: headline with your top 2 moods, then proof in one sentence.\n3) Release-timing push: emphasize why now + one lightweight social proof.\n4) Curator-to-curator angle: tailor the hook to the playlist’s sound (bass/tempo/energy).\n5) Gate-smart strategy: preempt likely tasks with a short checklist in the pitch.`
    case 'improve_copy':
      return `${common}\n\nImproved submission copy:\n\nPitch (2–3 sentences): ${safeInput || 'I’m submitting a track that matches your playlist’s vibe—high energy, memorable melodies, and built for repeat listens. Here’s why it fits: [specific reason]. I’d love to be considered for your next rotation.'}\n\nOptional add-ons:\n- Mood tags: [add 3–5]\n- 1 sentence “why now”: [timing + release moment]\n- One concrete reference: [recent track / influence]`
    default:
      return `${common}\n\n${safeInput ? `Draft based on your input:\n\n${safeInput}\n` : ''}Tell me the use case and I’ll generate a tailored output.`
  }
}

function getSystemPrompt() {
  return [
    'You are StreamEngine AI, a music-tech assistant for artists and curators.',
    'Your job is to help users submit better pitches, coordinate campaigns, and improve outcomes.',
    'Never claim to have accessed Spotify or internal data unless explicitly provided.',
    'Be concise, specific, and actionable. Output should be readable in a dark UI.',
    'If information is missing, use placeholders like [playlistGenre] and [yourHook].'
  ].join('\n')
}

function buildUserPrompt({ useCase, input, context }) {
  const ctx = context ? JSON.stringify(context, null, 2) : '{}'
  return [
    `Use case: ${useCase}`,
    `Input:\n${input || '(empty)'}`,
    `Context (if provided):\n${ctx}`,
    '',
    'Requirements:',
    '1) Return only the final content; do not include internal reasoning.',
    '2) Match the use case output type.',
    '3) Keep it short enough to paste directly into the app.'
  ].join('\n')
}

app.post('/api/ai/streamengine', async (req, res) => {
  try {
    const { useCase, input, context } = req.body || {}
    const allowed = new Set([
      'rewrite_pitch',
      'score_playlist_fit',
      'suggest_outreach',
      'summarize_feedback',
      'generate_campaign_ideas',
      'improve_copy',
    ])

    if (!useCase || !allowed.has(useCase)) {
      return res.status(400).json({ ok: false, error: 'Invalid useCase' })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({
          ok: false,
          error: 'AI is not configured. Set OPENAI_API_KEY on the API server.',
        })
      }
      const content = getDemoResponse({ useCase, input, context })
      return res.json({ ok: true, useCase, content, meta: { demo: true } })
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const openai = new OpenAI({ apiKey })

    const messages = [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content: buildUserPrompt({ useCase, input, context }) },
    ]

    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
    })

    const content = completion?.choices?.[0]?.message?.content?.trim() || ''
    return res.json({
      ok: true,
      useCase,
      content: content || '(No content generated.)',
      meta: { demo: false, model },
    })
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || 'AI request failed',
    })
  }
})

app.get('/api/ai/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/billing/health', (_req, res) => {
  res.json({
    ok: true,
    stripe: !!getStripe(),
    supabaseAdmin: !!getSupabaseAdmin(),
  })
})

/**
 * Campaign / one-off PaymentIntent — secret key stays on the server.
 * POST /api/billing/create-payment-intent  body: { amountUsd, campaignId?, userId? }
 */
app.post('/api/billing/create-payment-intent', async (req, res) => {
  try {
    const stripe = getStripe()
    if (!stripe) {
      return res.status(503).json({ ok: false, error: 'Stripe is not configured on the server' })
    }
    const { amountUsd, campaignId, userId } = req.body || {}
    const usd = Number(amountUsd)
    if (!Number.isFinite(usd) || usd <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid amountUsd' })
    }
    const amountCents = Math.min(Math.round(usd * 100), 99999999)
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        streamengine: 'campaign',
        campaign_id: campaignId != null ? String(campaignId) : '',
        user_id: userId != null ? String(userId) : '',
      },
    })
    return res.json({ ok: true, clientSecret: pi.client_secret })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'PaymentIntent creation failed' })
  }
})

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      ok: false,
      error: 'Not found',
      path: req.originalUrl,
      method: req.method,
    })
  }
  res.status(404).type('text').send('Not found')
})

const server = app.listen(PORT, () => {
  console.log(`[StreamEngine] Server listening on http://localhost:${PORT} (set PORT=3333 in server/.env to match Vite proxy)`)
})
server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[StreamEngine] Port ${PORT} is already in use. Stop the other process or set PORT in server/.env (must match Vite proxy in vite.config.js).`,
    )
    process.exit(1)
  }
  throw err
})

