// @ts-nocheck
/**
 * Spotify Auto-Add — Supabase Edge Function
 *
 * Given a campaign_id, evaluates curator gates and automatically adds the submitted track
 * to curator playlists that have auto_add_enabled=true.
 *
 * Deploy:
 *   supabase functions deploy spotify-auto-add --verify-jwt
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

function gateAllows(gate, credits, genre) {
  if (!gate?.active) return false
  if ((gate?.min_credits ?? 0) > credits) return false
  const allowed = Array.isArray(gate?.allowed_genres) ? gate.allowed_genres : []
  if (allowed.length === 0) return true
  return allowed.map((s) => String(s).toLowerCase()).includes(String(genre || '').toLowerCase())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const uid = await getUserIdFromJwt(req)
  if (!uid) return json(401, { ok: false, error: 'Unauthorized' })

  const supa = supabaseAdmin()
  const clientId = env('SPOTIFY_CLIENT_ID')
  if (!supa || !clientId) return json(500, { ok: false, error: 'Server not configured' })

  const body = await req.json().catch(() => ({}))
  const campaignId = String(body?.campaign_id || '').trim()
  if (!campaignId) return json(400, { ok: false, error: 'Missing campaign_id' })

  // Load campaign, song spotify id, and submissions.
  const { data: camp } = await supa
    .from('campaigns')
    .select('id, artist_id, song_id, campaign_type, status, songs(spotify_id, genre)')
    .eq('id', campaignId)
    .single()

  if (!camp?.id) return json(404, { ok: false, error: 'Campaign not found' })
  if (camp.artist_id !== uid && (await supa.from('profiles').select('role').eq('id', uid).single())?.data?.role !== 'admin') {
    return json(403, { ok: false, error: 'Not allowed' })
  }

  const spotifyTrackId = camp?.songs?.spotify_id || null
  const genre = camp?.songs?.genre || null
  if (!spotifyTrackId) return json(200, { ok: true, skipped: true, reason: 'Song has no spotify_id' })

  const { data: subs } = await supa
    .from('submissions')
    .select('id, curator_id, credits')
    .eq('campaign_id', campaignId)

  const results = []
  for (const s of (subs || [])) {
    // Gate + eligible playlists
    const [{ data: gate }, { data: pls }, { data: tok }] = await Promise.all([
      supa.from('curator_submission_gates').select('*').eq('curator_id', s.curator_id).maybeSingle(),
      supa.from('curator_playlists').select('id, spotify_playlist_id, auto_add_enabled').eq('curator_id', s.curator_id).eq('auto_add_enabled', true).limit(10),
      supa.from('curator_spotify_tokens').select('refresh_token').eq('curator_id', s.curator_id).maybeSingle(),
    ])

    if (!gateAllows(gate, s.credits || 0, genre)) {
      await supa.from('spotify_auto_add_attempts').insert({
        campaign_id: campaignId,
        submission_id: s.id,
        curator_id: s.curator_id,
        spotify_track_id: spotifyTrackId,
        status: 'skipped',
        reason: 'Gate blocked',
      })
      continue
    }

    if (!tok?.refresh_token) {
      await supa.from('spotify_auto_add_attempts').insert({
        campaign_id: campaignId,
        submission_id: s.id,
        curator_id: s.curator_id,
        spotify_track_id: spotifyTrackId,
        status: 'skipped',
        reason: 'Curator not connected to Spotify',
      })
      continue
    }

    const refreshed = await refreshAccessToken(clientId, tok.refresh_token)
    const accessToken = refreshed?.access_token
    if (!accessToken) {
      await supa.from('spotify_auto_add_attempts').insert({
        campaign_id: campaignId,
        submission_id: s.id,
        curator_id: s.curator_id,
        spotify_track_id: spotifyTrackId,
        status: 'failed',
        reason: 'Could not refresh curator token',
      })
      continue
    }

    for (const pl of (pls || [])) {
      const spotifyPlaylistId = pl.spotify_playlist_id
      if (!spotifyPlaylistId) {
        await supa.from('spotify_auto_add_attempts').insert({
          campaign_id: campaignId,
          submission_id: s.id,
          curator_id: s.curator_id,
          playlist_id: pl.id,
          spotify_track_id: spotifyTrackId,
          status: 'skipped',
          reason: 'Playlist missing spotify_playlist_id',
        })
        continue
      }

      const attempt = await spotifyAddTrack(accessToken, spotifyPlaylistId, spotifyTrackId)
      if (attempt.ok) {
        await supa.from('spotify_auto_add_attempts').insert({
          campaign_id: campaignId,
          submission_id: s.id,
          curator_id: s.curator_id,
          playlist_id: pl.id,
          spotify_playlist_id: spotifyPlaylistId,
          spotify_track_id: spotifyTrackId,
          status: 'success',
          spotify_snapshot_id: attempt.data?.snapshot_id || null,
        })
        results.push({ curator_id: s.curator_id, playlist_id: pl.id, ok: true })
      } else {
        await supa.from('spotify_auto_add_attempts').insert({
          campaign_id: campaignId,
          submission_id: s.id,
          curator_id: s.curator_id,
          playlist_id: pl.id,
          spotify_playlist_id: spotifyPlaylistId,
          spotify_track_id: spotifyTrackId,
          status: 'failed',
          reason: `Spotify ${attempt.status}: ${attempt.data?.error?.message || 'Unknown error'}`,
        })
        results.push({ curator_id: s.curator_id, playlist_id: pl.id, ok: false })
      }
    }
  }

  return json(200, { ok: true, resultsCount: results.length })
})

