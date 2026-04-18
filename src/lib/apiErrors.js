/** Map Spotify/metadata API failures to readable hero copy (avoid raw “Backend 404”). */
export function formatTrackMetadataError(status, serverMessage) {
  let raw = serverMessage
  if (raw && typeof raw === 'object') {
    raw = raw.error || raw.message || raw.msg
  }
  const msg = String(raw ?? '').trim()
  if (status === 404) {
    return (
      'Could not reach the track service (404). ' +
      'Confirm Netlify proxies /api to your Render API and that VITE_API_ORIGIN matches the live API URL, then redeploy. ' +
      'See DEPLOY.txt for the checklist.'
    )
  }
  if (status === 502 || status === 503) {
    return 'The API is temporarily unavailable. Try again in a minute.'
  }
  if (msg && !/^backend\s*\d+$/i.test(msg)) return msg
  if (status >= 500) return 'The server had a problem loading this track. Try again shortly.'
  if (status === 400) return msg || 'That Spotify link could not be read. Check the URL and try again.'
  return msg || 'Could not load track metadata. Try again or use a different link.'
}
