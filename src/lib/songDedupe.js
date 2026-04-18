/**
 * Collapse duplicate `songs` rows for the same artist + Spotify track id (DB repair).
 * Keeps the oldest row (earliest created_at), merges fresher metadata into it,
 * re-points campaigns to the primary id, then deletes duplicate song rows.
 */
function pickNonNull(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

export async function collapseDuplicateSongsForArtist(supabase, artistId) {
  if (!supabase || !artistId) return { mergedGroups: 0, error: null }

  const { data: rows, error: fetchErr } = await supabase
    .from('songs')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: true })

  if (fetchErr) return { mergedGroups: 0, error: fetchErr }
  const list = rows || []
  const bySpotify = new Map()
  for (const r of list) {
    const sid = String(r.spotify_id || '').trim()
    if (!sid) continue
    if (!bySpotify.has(sid)) bySpotify.set(sid, [])
    bySpotify.get(sid).push(r)
  }

  let mergedGroups = 0
  for (const [, group] of bySpotify) {
    if (group.length < 2) continue
    mergedGroups += 1
    const primary = group[0]
    const dupes = group.slice(1)
    const newest = group[group.length - 1]

    const patch = {
      title: pickNonNull(newest.title, primary.title),
      artist_name: pickNonNull(newest.artist_name, primary.artist_name),
      genre: pickNonNull(newest.genre, primary.genre),
      spotify_url: pickNonNull(newest.spotify_url, primary.spotify_url),
      artwork_url: pickNonNull(newest.artwork_url, primary.artwork_url),
      album_name: pickNonNull(newest.album_name, primary.album_name),
      release_date: pickNonNull(newest.release_date, primary.release_date),
      preview_url: pickNonNull(newest.preview_url, primary.preview_url),
      duration_ms: pickNonNull(newest.duration_ms, primary.duration_ms),
      bg: pickNonNull(newest.bg, primary.bg),
      ac: pickNonNull(newest.ac, primary.ac),
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await supabase.from('songs').update(patch).eq('id', primary.id)
    if (upErr) return { mergedGroups, error: upErr }

    for (const d of dupes) {
      const { error: campErr } = await supabase
        .from('campaigns')
        .update({ song_id: primary.id })
        .eq('song_id', d.id)
        .eq('artist_id', artistId)
      if (campErr) return { mergedGroups, error: campErr }

      const { error: delErr } = await supabase.from('songs').delete().eq('id', d.id)
      if (delErr) return { mergedGroups, error: delErr }
    }
  }

  return { mergedGroups, error: null }
}
