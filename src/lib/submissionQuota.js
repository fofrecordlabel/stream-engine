/** Free tier: Playlist Push campaigns per local week (Monday 00:00 → Sunday 23:59). */
export const FREE_WEEKLY_SUBMISSION_CAP = 10

/** Pro subscription weekly cap (product copy targets ~$30/mo). */
export const PRO_WEEKLY_SUBMISSION_CAP = 20

/** Premium tier — higher weekly ceiling. */
export const PREMIUM_WEEKLY_SUBMISSION_CAP = 40

/**
 * Weekly Playlist Push campaign cap from profile tier.
 * @param {{ profile?: { subscription_tier?: string | null } } | { subscription_tier?: string | null } | null | undefined} account
 */
export function getArtistWeeklySubmissionCap(account) {
  const tier = String(account?.profile?.subscription_tier || account?.subscription_tier || 'free')
    .toLowerCase()
    .trim()
  if (tier === 'premium') return PREMIUM_WEEKLY_SUBMISSION_CAP
  if (tier === 'pro') return PRO_WEEKLY_SUBMISSION_CAP
  return FREE_WEEKLY_SUBMISSION_CAP
}

/** Statuses that never count toward the weekly cap (drafts / not launched). */
const EXCLUDE_FROM_WEEKLY_CAP = new Set(['draft'])

/**
 * Count Playlist Push campaigns created this local week (Mon 00:00 → now).
 * Excludes drafts and non-playlist campaign types so TikTok/influencer rows do not consume the cap.
 */
export function countCampaignsSinceLocalWeekMonday(campaigns) {
  if (!Array.isArray(campaigns)) return 0
  const now = new Date()
  const dow = now.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday, 0, 0, 0, 0)
  const t0 = monday.getTime()
  return campaigns.filter((c) => {
    const t = new Date(c.created_at || c.createdAt || 0).getTime()
    if (!Number.isFinite(t) || t < t0) return false
    const st = String(c.status || '').toLowerCase().trim()
    if (EXCLUDE_FROM_WEEKLY_CAP.has(st)) return false
    const ctype = String(c.campaign_type || 'playlist').toLowerCase().trim()
    if (ctype !== 'playlist') return false
    return true
  }).length
}
