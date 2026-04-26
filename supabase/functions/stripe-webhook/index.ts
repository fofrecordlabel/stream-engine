// @ts-nocheck
/**
 * StreamEngine — Stripe Webhook (Supabase Edge Function)
 *
 * Responsibilities:
 * - Checkout Sessions (credit packs): upsert `playlist_push_orders`, grant credits in `credits_ledger`
 * - PaymentIntents (campaign): update `campaigns` with Stripe IDs + paid status fields
 *
 * Deploy:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

function supabaseAdmin() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature, authorization',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function safeUpsertOrderAndCreditsFromCheckoutSession(supa: ReturnType<typeof supabaseAdmin>, session: Stripe.Checkout.Session) {
  const md = (session.metadata || {}) as Record<string, string>
  const userId = String(md.user_id || '').trim()
  const credits = Number(md.credits || 0)
  const subtotal = Number(md.subtotal_cents || 0)
  const discount = Number(md.discount_cents || 0)
  const total = Number(md.total_cents || 0)
  const currency = String(session.currency || md.currency || 'usd')
  const discountCode = String(md.discount_code || '').trim().toUpperCase()

  // Guest / non-account flows can be carried purely in Stripe. (No DB writes.)
  if (!userId) return

  const orderRow = {
    user_id: userId,
    pack_id: md.pack_id || null,
    credits_purchased: Number.isFinite(credits) ? credits : 0,
    stripe_session_id: session.id,
    stripe_payment_intent_id: (session.payment_intent as string | null) || null,
    amount_subtotal: Number.isFinite(subtotal) ? subtotal : null,
    amount_discount: Number.isFinite(discount) ? discount : 0,
    amount_total: Number.isFinite(total) ? total : null,
    currency,
    status: session.payment_status === 'paid' ? 'paid' : 'created',
    discount_code: discountCode || null,
    invite_code: md.invite_code || null,
    referral_code: md.referral_code || null,
    source: md.source || null,
    updated_at: new Date().toISOString(),
  }

  const { data: order, error: orderErr } = await supa!
    .from('playlist_push_orders')
    .upsert(orderRow, { onConflict: 'stripe_session_id' })
    .select()
    .single()
  if (orderErr) throw orderErr

  // Discount usage + join row (best-effort; safe to skip if misconfigured)
  if (discountCode && discount > 0) {
    const { data: dc } = await supa!.from('discount_codes').select('*').eq('code', discountCode).maybeSingle()
    if (dc?.id) {
      await supa!
        .from('discount_codes')
        .update({ usage_count: (dc.usage_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', dc.id)
      const { data: existing } = await supa!
        .from('order_discounts')
        .select('id')
        .eq('order_id', order.id)
        .eq('discount_code_id', dc.id)
        .maybeSingle()
      if (!existing) {
        await supa!.from('order_discounts').insert({
          order_id: order.id,
          discount_code_id: dc.id,
          amount_applied: discount,
        })
      }
    }
  }

  if (session.payment_status === 'paid' && credits > 0) {
    // Unique index on credits_ledger(stripe_payment_id) makes this idempotent.
    const { error: creditErr } = await supa!.from('credits_ledger').insert({
      user_id: userId,
      amount: credits,
      reason: 'purchase',
      stripe_payment_id: (session.payment_intent as string | null) || session.id,
    })
    if (creditErr && !String(creditErr.message || '').toLowerCase().includes('duplicate')) {
      // ignore duplicates; surface other errors
      throw creditErr
    }
  }
}

async function safeSyncCampaignPaymentIntent(supa: ReturnType<typeof supabaseAdmin>, pi: Stripe.PaymentIntent) {
  const md = (pi.metadata || {}) as Record<string, string>
  const campaignId = String(md.campaign_id || '').trim()
  if (!campaignId) return

  const chargeId = (pi.latest_charge as string | null) || null

  // For now we only sync Stripe IDs + paid amount fields; campaign workflow can decide status.
  await supa!
    .from('campaigns')
    .update({
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: chargeId,
      amount_paid: ((pi.amount_received || pi.amount || 0) / 100).toFixed(2),
      updated_at: new Date().toISOString(),
      status: 'approved',
    })
    .eq('id', campaignId)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const supa = supabaseAdmin()
    const secret = env('STRIPE_WEBHOOK_SECRET')
    if (!supa) return json(503, { error: 'Supabase admin not configured (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' })
    if (!secret) return json(503, { error: 'Stripe webhook not configured (missing STRIPE_WEBHOOK_SECRET)' })

    const sig = req.headers.get('stripe-signature') || ''
    const raw = new Uint8Array(await req.arrayBuffer())

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret)
    } catch (e) {
      return json(400, { error: e instanceof Error ? e.message : 'Invalid signature' })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      await safeUpsertOrderAndCreditsFromCheckoutSession(supa, session)
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      await supa
        .from('playlist_push_orders')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('stripe_session_id', session.id)
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent
      await supa
        .from('playlist_push_orders')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', pi.id)
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent
      const kind = String((pi.metadata || {}).billing_kind || (pi.metadata || {}).streamengine || '')
      if (kind === 'campaign') {
        await safeSyncCampaignPaymentIntent(supa, pi)
      }
    }

    return json(200, { received: true })
  } catch (err) {
    console.error('[stripe-webhook] error:', err)
    return json(500, { error: err instanceof Error ? err.message : 'Webhook handler failed' })
  }
})

