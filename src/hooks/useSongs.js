/**
 * useSongs — CRUD hook with Supabase + demo-mode fallback.
 * In demo mode, stays empty (no seeded production-looking records).
 */
import { useState, useEffect } from 'react'
import { isDemo, dbInsert, dbUpdate, dbDelete, supabase, supabaseConfigErrorMessage } from '../lib/supabase.js'
import { collapseDuplicateSongsForArtist } from '../lib/songDedupe.js'

function normalizeSongFromDb(data) {
  if (!data) return null
  return {
    ...data,
    artist: data.artist || data.artist_name,
    spotifyId: data.spotifyId || data.spotify_id,
    spotifyUrl: data.spotifyUrl || data.spotify_url,
    artworkUrl: data.artworkUrl || data.artwork_url,
    albumName: data.albumName || data.album_name,
    releaseDate: data.releaseDate || data.release_date,
    previewUrl: data.previewUrl || data.preview_url,
    duration: data.duration || data.duration_ms,
    trackId: data.trackId || data.spotify_id,
  }
}

/** One saved row per Spotify track: merge fresh metadata into an existing song. */
function buildMergeUpdate(existing, song, incomingSpotifyId) {
  const title = (song.title && String(song.title).trim()) || existing.title
  const artist = (song.artist && String(song.artist).trim()) || existing.artist || existing.artist_name
  return {
    title,
    artist_name: artist,
    genre: song.genre ?? existing.genre ?? null,
    spotify_url: song.spotifyUrl || existing.spotifyUrl || existing.spotify_url || null,
    spotify_id: incomingSpotifyId || existing.spotifyId || existing.spotify_id || null,
    artwork_url: song.artworkUrl ?? existing.artworkUrl ?? existing.artwork_url ?? null,
    album_name: song.albumName ?? existing.albumName ?? existing.album_name ?? null,
    release_date: song.releaseDate ?? existing.releaseDate ?? existing.release_date ?? null,
    preview_url: song.previewUrl ?? existing.previewUrl ?? existing.preview_url ?? null,
    duration_ms: song.duration ?? existing.duration ?? existing.duration_ms ?? null,
    bg: song.bg ?? existing.bg ?? '#050506',
    ac: song.ac ?? existing.ac ?? '#7fff00',
  }
}

export function useSongs(userId) {
  const [songs,   setSongs]   = useState([])
  const [loading, setLoading] = useState(!isDemo)

  useEffect(() => {
    if (isDemo || !userId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { error: colErr } = await collapseDuplicateSongsForArtist(supabase, userId)
      if (colErr) console.warn('[useSongs] collapseDuplicateSongsForArtist:', colErr.message || colErr)
      if (cancelled) return
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('artist_id', userId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setSongs((data || []).map((song) => normalizeSongFromDb(song)))
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  const addSong = async (song) => {
    if (isDemo) {
      return { data: null, error: { message: supabaseConfigErrorMessage() } }
    }
    const incomingSpotifyId = song.spotifyId || song.spotify_id || song.trackId || null
    const existing = songs.find(s =>
      (incomingSpotifyId && (s.spotifyId === incomingSpotifyId || s.spotify_id === incomingSpotifyId)) ||
      (!!song.spotifyUrl && (s.spotifyUrl === song.spotifyUrl || s.spotify_url === song.spotifyUrl))
    )
    if (existing) {
      const mergedClient = {
        ...existing,
        ...song,
        id: existing.id,
        title: (song.title && String(song.title).trim()) || existing.title,
        artist: (song.artist && String(song.artist).trim()) || existing.artist,
        spotifyId: incomingSpotifyId || existing.spotifyId || existing.spotify_id,
        spotify_id: incomingSpotifyId || existing.spotifyId || existing.spotify_id,
        trackId: incomingSpotifyId || existing.trackId,
        spotifyUrl: song.spotifyUrl || existing.spotifyUrl || existing.spotify_url,
        spotify_url: song.spotifyUrl || existing.spotifyUrl || existing.spotify_url,
        artworkUrl: song.artworkUrl ?? existing.artworkUrl ?? existing.artwork_url,
        albumName: song.albumName ?? existing.albumName ?? existing.album_name,
        releaseDate: song.releaseDate ?? existing.releaseDate ?? existing.release_date,
        previewUrl: song.previewUrl ?? existing.previewUrl ?? existing.preview_url,
        duration: song.duration ?? existing.duration ?? existing.duration_ms,
        submissions: existing.submissions ?? song.submissions ?? 0,
      }
      const patch = buildMergeUpdate(existing, song, incomingSpotifyId)
      const { data: updated, error: upErr } = await supabase
        .from('songs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      if (upErr) return { data: mergedClient, error: upErr, duplicate: true, merged: false }
      const normalized = normalizeSongFromDb(updated)
      setSongs(p => p.map(s => (s.id === existing.id ? normalized : s)))
      return { data: normalized, error: null, duplicate: true, merged: true }
    }

    const baseRow = {
      artist_id:   userId,
      title:       song.title,
      artist_name: song.artist,
      genre:       song.genre,
      spotify_url: song.spotifyUrl || null,
      spotify_id:  incomingSpotifyId,
      artwork_url: song.artworkUrl || null,
      bg:          song.bg         || '#050506',
      ac:          song.ac         || '#7fff00',
    }
    const row = {
      ...baseRow,
      album_name:  song.albumName || null,
      release_date:song.releaseDate || null,
      preview_url: song.previewUrl || null,
      duration_ms: song.duration || null,
    }
    let { data, error } = await dbInsert('songs', row)
    if (error) {
      const code = error?.code || error?.details
      const msg = String(error?.message || '')
      if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        let existingQ = null
        if (incomingSpotifyId) {
          const r = await supabase.from('songs').select('*').eq('artist_id', userId).eq('spotify_id', incomingSpotifyId).maybeSingle()
          existingQ = r.data
        } else if (song.spotifyUrl) {
          const r = await supabase.from('songs').select('*').eq('artist_id', userId).eq('spotify_url', song.spotifyUrl).maybeSingle()
          existingQ = r.data
        }
        if (existingQ) {
          const base = normalizeSongFromDb(existingQ)
          const patch = buildMergeUpdate(base, song, incomingSpotifyId)
          const { data: updated, error: upErr } = await supabase
            .from('songs')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', base.id)
            .select()
            .single()
          if (upErr) return { data: base, error: upErr, duplicate: true, merged: false }
          const normalized = normalizeSongFromDb(updated)
          setSongs(p => {
            const has = p.some(s => s.id === normalized.id)
            if (has) return p.map(s => (s.id === normalized.id ? normalized : s))
            return [normalized, ...p]
          })
          return { data: normalized, error: null, duplicate: true, merged: true }
        }
        return { data: null, error, duplicate: true }
      }
      const retry = await dbInsert('songs', baseRow)
      data = retry.data
      error = retry.error
      if (error && (error?.code === '23505' || String(error?.message || '').includes('duplicate'))) {
        return { data: null, error, duplicate: true }
      }
    }
    if (!error && data) {
      const normalized = normalizeSongFromDb(data)
      setSongs(p => [normalized, ...p])
      return { data: normalized, error: null }
    }
    return { data, error }
  }

  const updateSong = async (id, patch) => {
    if (isDemo) return { data: null, error: { message: supabaseConfigErrorMessage() } }
    const { data, error } = await dbUpdate('songs', id, patch)
    if (!error) setSongs(p => p.map(s => s.id===id ? {...s,...data} : s))
    return { data, error }
  }

  const removeSong = async (id) => {
    if (isDemo) return { error: { message: supabaseConfigErrorMessage() } }
    const { error } = await dbDelete('songs', id)
    if (!error) setSongs(p => p.filter(s => s.id !== id))
    return { error }
  }

  const incrementSubmissions = (id) =>
    setSongs(p => p.map(s => s.id===id ? {...s, submissions:(s.submissions||0)+1} : s))

  return { songs, setSongs, loading, addSong, updateSong, removeSong, incrementSubmissions }
}
