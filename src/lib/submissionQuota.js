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

/**
 * Count campaigns with `created_at` on or after local Monday 00:00:00 for the current week.
 * Week boundary: Monday 12:00 AM (00:00) through Sunday end-of-day, viewer's local timezone.
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
    return Number.isFinite(t) && t >= t0
  }).length
}
