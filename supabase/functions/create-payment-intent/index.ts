// @ts-nocheck
/**
 * StreamEngine — Stripe Payment Intent Edge Function
 *
 * Handles two payment types:
 *   1. Credit pack purchase  → creates a Checkout Session (redirect flow)
 *   2. Campaign payment      → creates a PaymentIntent (embedded flow)
 *
 * Deploy:
 *   supabase functions deploy create-payment-intent --no-verify-jwt
 *
 * Required secrets (set via `supabase secrets set`):
 *   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
 *   APP_URL             — https://your-domain.com (for redirect URLs)
 */

// Remote ESM imports are resolved by Deno at runtime; TS in the app workspace may not have types.
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

function env(name: string) {
  return String(Deno.env.get(name) ?? '').trim()
}

function appOriginsList() {
  const raw = env('APP_URL')
  if (!raw) return []
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    try {
      out.push(new URL(p).origin)
    } catch {
      // ignore invalid segments
    }
  }
  return out
}

function isLocalhostOrigin(origin: string) {
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin) ||
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)
  )
}

function corsHeadersForReq(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowed = appOriginsList()
  const allow = isLocalhostOrigin(origin) || (!!origin && allowed.includes(origin))
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (allow && origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(status: number, headers: Record<string, string>, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

function bearerToken(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || ''
}

function supabaseAdmin() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function supabaseAnon() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_ANON_KEY')
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function toCents(usd: unknown) {
  const n = Number(usd)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.round(n * 100))
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersForReq(req) })
  }

  try {
    const cors = corsHeadersForReq(req)
    if (!cors['Access-Control-Allow-Origin']) {
      return json(403, cors, { error: 'Origin not allowed' })
    }

    const supaAnon = supabaseAnon()
    const supaAdmin = supabaseAdmin()
    if (!supaAnon || !supaAdmin) {
      return json(503, cors, { error: 'Supabase billing not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)' })
    }
    const stripeKey = env('STRIPE_SECRET_KEY')
    if (!stripeKey) return json(503, cors, { error: 'Stripe not configured (missing STRIPE_SECRET_KEY)' })

    // JWT auth: derive user from token, ignore client-provided userId
    const token = bearerToken(req)
    if (!token) return json(401, cors, { error: 'Missing Authorization bearer token' })
    const { data: authData, error: authErr } = await supaAnon.auth.getUser(token)
    if (authErr || !authData?.user) return json(401, cors, { error: 'Invalid session' })
    const authedUserId = authData.user.id

    const body = await req.json()
    const { type, packId, campaignId, discountCode, invite, idempotencyKey } = body || {}
    const appUrl = (env('APP_URL') || 'http://localhost:5173').split(/[\s,]+/)[0] || 'http://localhost:5173'
    const cleanAppUrl = appUrl.replace(/\/$/, '')

    /* ── Credit pack purchase (Checkout Session) ── */
    if (type === 'credits') {
      const pack = String(packId || '').trim()
      if (!pack) return json(400, cors, { error: 'Missing packId' })

      const { data: pricing, error: pricingErr } = await supaAdmin
        .from('pricing_settings')
        .select('*')
        .eq('id', 1)
        .single()
      if (pricingErr || !pricing) return json(500, cors, { error: 'Pricing lookup failed' })

      const packMap: Record<string, { credits: number; priceUsd: number }> = {
        starter: { credits: Number(pricing.starter_credits), priceUsd: Number(pricing.starter_price) },
        pro:     { credits: Number(pricing.pro_credits),     priceUsd: Number(pricing.pro_price) },
        scale:   { credits: Number(pricing.scale_credits),   priceUsd: Number(pricing.scale_price) },
      }
      const chosen = packMap[pack]
      if (!chosen || !Number.isFinite(chosen.credits) || !Number.isFinite(chosen.priceUsd)) {
        return json(400, cors, { error: 'Invalid packId' })
      }

      const subtotalCents = toCents(chosen.priceUsd)
      if (subtotalCents == null || subtotalCents <= 0) return json(500, cors, { error: 'Invalid server pricing configuration' })

      // Optional discount code validation using service role
      let amountOffCents = 0
      let discountCodeClean = ''
      if (discountCode) {
        const clean = String(discountCode || '').trim().toUpperCase()
        const { data: dc } = await supaAdmin
          .from('discount_codes')
          .select('*')
          .eq('code', clean)
          .maybeSingle()
        if (!dc) return json(400, cors, { error: 'Invalid discount code' })
        if (!dc.active) return json(400, cors, { error: 'Code is inactive' })
        if (dc.expires_at && Date.parse(String(dc.expires_at)) < Date.now()) return json(400, cors, { error: 'Code expired' })
        if (dc.usage_limit != null && dc.usage_count != null && Number(dc.usage_count) >= Number(dc.usage_limit)) {
          return json(400, cors, { error: 'Code exhausted' })
        }
        if (dc.min_amount_cents != null && subtotalCents < Number(dc.min_amount_cents)) {
          return json(400, cors, { error: 'Subtotal too low for this code' })
        }
        if (dc.type === 'percent') amountOffCents = Math.floor((subtotalCents * Number(dc.amount)) / 100)
        else if (dc.type === 'fixed') amountOffCents = Math.min(subtotalCents, Number(dc.amount))
        else return json(400, cors, { error: 'Unsupported discount type' })
        discountCodeClean = clean
      }

      const totalCents = Math.max(0, subtotalCents - (amountOffCents || 0))
      const currency = 'usd'
      const cleanInvite = invite || null

      const idem = String(idempotencyKey || `credits:${authedUserId}:${pack}:${discountCodeClean || 'none'}`).slice(0, 255)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: `StreamEngine Credits (${chosen.credits} credits)`,
              description: `Promote your music to curators`,
            },
            unit_amount: totalCents, // cents
          },
          quantity: 1,
        }],
        metadata: {
          billing_kind: 'credits',
          user_id: authedUserId,
          credits: String(chosen.credits),
          pack_id: pack,
          currency,
          subtotal_cents: String(subtotalCents),
          discount_cents: String(amountOffCents || 0),
          total_cents: String(totalCents),
          discount_code: discountCodeClean || '',
          invite_code: cleanInvite?.code || '',
          referral_code: cleanInvite?.ref || '',
          source: cleanInvite?.src || '',
        },
        success_url: `${cleanAppUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${cleanAppUrl}/checkout-cancel`,
      }, { idempotencyKey: idem })

      // Create a placeholder order row immediately (webhook will mark paid + grant credits)
      await supaAdmin.from('playlist_push_orders').upsert({
        user_id: authedUserId,
        pack_id: pack,
        credits_purchased: chosen.credits,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        amount_subtotal: subtotalCents,
        amount_discount: amountOffCents || 0,
        amount_total: totalCents,
        currency,
        status: 'created',
        discount_code: discountCodeClean || null,
        invite_code: cleanInvite?.code || null,
        referral_code: cleanInvite?.ref || null,
        source: cleanInvite?.src || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_session_id' })

      return json(200, cors, { ok: true, sessionId: session.id, url: session.url })
    }

    /* ── Campaign payment (PaymentIntent) ── */
    if (type === 'campaign') {
      const cid = String(campaignId || '').trim()
      if (!cid) return json(400, cors, { error: 'Missing campaignId' })

      const { data: campaign, error: campErr } = await supaAdmin
        .from('campaigns')
        .select('*')
        .eq('id', cid)
        .single()
      if (campErr || !campaign) return json(404, cors, { error: 'Campaign not found' })
      if (String(campaign.artist_id) !== String(authedUserId)) return json(403, cors, { error: 'Not allowed' })

      const { data: pricing, error: pricingErr } = await supaAdmin
        .from('pricing_settings')
        .select('*')
        .eq('id', 1)
        .single()
      if (pricingErr || !pricing) return json(500, cors, { error: 'Pricing lookup failed' })

      const creditToUsd = Number(pricing.credit_to_usd || 0)
      const feePct = Number(pricing.platform_fee_pct || 20) / 100
      const totalCredits = Number(campaign.total_credits || 0)
      if (!Number.isFinite(totalCredits) || totalCredits <= 0) return json(400, cors, { error: 'Campaign has no credits to pay for' })
      if (!Number.isFinite(creditToUsd) || creditToUsd <= 0) return json(500, cors, { error: 'Invalid credit_to_usd pricing' })

      const grossUsd = totalCredits * creditToUsd
      const amountCents = Math.min(Math.round(grossUsd * 100), 99_999_999)

      const platformFeeCents = Math.round(amountCents * feePct)

      const idem = String(idempotencyKey || `campaign:${authedUserId}:${cid}:${amountCents}`).slice(0, 255)

      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          billing_kind: 'campaign',
          user_id: authedUserId,
          campaign_id: cid,
          total_credits: String(totalCredits),
          credit_to_usd: String(creditToUsd),
          platform_fee_cents: String(platformFeeCents),
        },
      }, { idempotencyKey: idem })

      await supaAdmin
        .from('campaigns')
        .update({
          stripe_payment_intent_id: intent.id,
          amount_paid: (amountCents / 100).toFixed(2),
          platform_fee: (platformFeeCents / 100).toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cid)

      return json(200, cors, { ok: true, clientSecret: intent.client_secret, intentId: intent.id })
    }

    return json(400, cors, { error: `Unknown payment type: ${type}` })

  } catch (err) {
    console.error('Payment intent error:', err)
    const cors = corsHeadersForReq(req)
    return json(500, cors, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
})
