// @ts-nocheck
/**
 * Spotify Connect (PKCE) — Supabase Edge Function
 *
 * Exchanges Spotify OAuth `code` + `code_verifier` for tokens and stores them server-side
 * in `curator_spotify_tokens`.
 *
 * Deploy:
 *   supabase functions deploy spotify-connect --verify-jwt
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SPOTIFY_CLIENT_ID
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

function env(name) {
  return String(Deno.env.get(name) ?? '').trim()
}

function supabaseAdmin() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function getUserIdFromJwt(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  if (!token) return null
  const supa = supabaseAdmin()
  if (!supa) return null
  const { data, error } = await supa.auth.getUser(token)
  if (error) return null
  return data?.user?.id || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const clientId = env('SPOTIFY_CLIENT_ID')
  if (!clientId) return json(500, { ok: false, error: 'Missing SPOTIFY_CLIENT_ID' })

  const uid = await getUserIdFromJwt(req)
  if (!uid) return json(401, { ok: false, error: 'Unauthorized' })

  const supa = supabaseAdmin()
  if (!supa) return json(500, { ok: false, error: 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' })

  const body = await req.json().catch(() => ({}))
  const code = String(body?.code || '').trim()
  const codeVerifier = String(body?.code_verifier || '').trim()
  const redirectUri = String(body?.redirect_uri || '').trim()

  if (!code || !codeVerifier || !redirectUri) {
    return json(400, { ok: false, error: 'Missing code/code_verifier/redirect_uri' })
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}))
    return json(400, { ok: false, error: err?.error_description || `Spotify token exchange failed (${tokenRes.status})` })
  }

  const token = await tokenRes.json()
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString()

  const { error: upErr } = await supa
    .from('curator_spotify_tokens')
    .upsert({
      curator_id: uid,
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      expires_at: expiresAt,
      scope: token.scope || null,
      token_type: token.token_type || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'curator_id' })

  if (upErr) return json(500, { ok: false, error: upErr.message || 'Failed to store tokens' })

  // Mark curator profile as Spotify-connected (best-effort).
  await supa.from('curator_profiles').upsert({ id: uid, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  await supa.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', uid)

  return json(200, { ok: true })
})

