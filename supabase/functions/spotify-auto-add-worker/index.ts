// @ts-nocheck
/**
 * Spotify Auto-Add Worker — Supabase Edge Function
 *
 * Retries failed/queued spotify_auto_add_attempts with backoff.
 * Intended to be triggered by a cron (Supabase scheduled functions) or manual admin call.
 *
 * Deploy:
 *   supabase functions deploy spotify-auto-add-worker --no-verify-jwt
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

async function refreshAccessToken(clientId, refreshToken) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) return null
  return await res.json().catch(() => null)
}

async function spotifyAddTrack(accessToken, spotifyPlaylistId, spotifyTrackId) {
  const r = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [`spotify:track:${spotifyTrackId}`] }),
  })
  const d = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data: d }
}

function backoffMinutes(attemptCount) {
  if (attemptCount <= 0) return 5
  if (attemptCount === 1) return 15
  if (attemptCount === 2) return 60
  return 240
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const supa = supabaseAdmin()
  const clientId = env('SPOTIFY_CLIENT_ID')
  if (!supa || !clientId) return json(500, { ok: false, error: 'Server not configured' })

  const body = await req.json().catch(() => ({}))
  const limit = Math.max(1, Math.min(50, Number(body?.limit || 20)))

  const nowIso = new Date().toISOString()
  const { data: rows, error } = await supa
    .from('spotify_auto_add_attempts')
    .select('id, curator_id, playlist_id, spotify_playlist_id, spotify_track_id, status, reason, attempt_count, next_attempt_at')
    .in('status', ['queued', 'failed'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return json(500, { ok: false, error: error.message })

  let processed = 0
  for (const a of (rows || [])) {
    const attemptCount = Number(a.attempt_count || 0)
    if (attemptCount >= 3) continue
    if (!a.spotify_playlist_id || !a.spotify_track_id) continue

    const { data: tok } = await supa
      .from('curator_spotify_tokens')
      .select('refresh_token')
      .eq('curator_id', a.curator_id)
      .maybeSingle()
    if (!tok?.refresh_token) {
      await supa.from('spotify_auto_add_attempts').update({
        status: 'skipped',
        reason: 'Curator not connected to Spotify',
      }).eq('id', a.id)
      processed++
      continue
    }

    const refreshed = await refreshAccessToken(clientId, tok.refresh_token)
    const accessToken = refreshed?.access_token
    if (!accessToken) {
      await supa.from('spotify_auto_add_attempts').update({
        status: 'failed',
        attempt_count: attemptCount + 1,
        next_attempt_at: new Date(Date.now() + backoffMinutes(attemptCount) * 60 * 1000).toISOString(),
        reason: 'Could not refresh curator token',
      }).eq('id', a.id)
      processed++
      continue
    }

    const out = await spotifyAddTrack(accessToken, a.spotify_playlist_id, a.spotify_track_id)
    if (out.ok) {
      await supa.from('spotify_auto_add_attempts').update({
        status: 'success',
        reason: null,
        spotify_snapshot_id: out.data?.snapshot_id || null,
        attempt_count: attemptCount + 1,
        next_attempt_at: null,
      }).eq('id', a.id)
    } else {
      await supa.from('spotify_auto_add_attempts').update({
        status: 'failed',
        attempt_count: attemptCount + 1,
        next_attempt_at: new Date(Date.now() + backoffMinutes(attemptCount) * 60 * 1000).toISOString(),
        reason: `Spotify ${out.status}: ${out.data?.error?.message || 'Unknown error'}`,
      }).eq('id', a.id)
    }
    processed++
  }

  return json(200, { ok: true, processed })
})

