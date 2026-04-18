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

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const { type, credits, priceUsd, userId, packId, campaignId, amountUsd } = body
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

    /* ── Credit pack purchase (Checkout Session) ── */
    if (type === 'credits') {
      if (!credits || !priceUsd || !userId) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: credits, priceUsd, userId' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} StreamEngine Credits`,
              description: `Promote your music to ${credits} curators`,
            },
            unit_amount: Math.round(priceUsd * 100), // cents
          },
          quantity: 1,
        }],
        metadata: {
          type:    'credits',
          userId,
          credits: String(credits),
          packId:  packId ?? '',
        },
        success_url: `${appUrl}/artist?credits_purchased=${credits}`,
        cancel_url:  `${appUrl}/artist?section=billing`,
      })

      return new Response(
        JSON.stringify({ sessionId: session.id, url: session.url }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    /* ── Campaign payment (PaymentIntent) ── */
    if (type === 'campaign') {
      if (!amountUsd || !campaignId || !userId) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: amountUsd, campaignId, userId' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }

      const platformFeePct = 0.20
      const platformFeeAmount = Math.round(amountUsd * platformFeePct * 100) // cents

      const intent = await stripe.paymentIntents.create({
        amount:           Math.round(amountUsd * 100),
        currency:         'usd',
        capture_method:   'automatic',
        application_fee_amount: platformFeeAmount,
        metadata: {
          type:       'campaign',
          userId,
          campaignId,
        },
      })

      return new Response(
        JSON.stringify({ clientSecret: intent.client_secret, intentId: intent.id }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown payment type: ${type}` }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Payment intent error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
