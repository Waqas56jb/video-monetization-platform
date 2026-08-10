import { one, query } from '../db/pool.js'

let cache = null
let cachedAt = 0
const TTL_MS = 15_000

/** Platform settings, lightly cached — they are read on nearly every request. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache
  cache = await one('select * from platform_settings where id = 1')
  cachedAt = Date.now()
  return cache
}

export async function updateSettings(patch) {
  const allowed = [
    'creator_split_percent',
    'min_video_price_tzs',
    'min_withdrawal_tzs',
    'default_preview_seconds',
    'default_premiere_days',
    'registrations_open',
    'require_creator_approval',
    'auto_premiere_to_free',
    'maintenance_mode',
    'preroll_enabled',
    'preroll_skip_after_secs',
    'ads_on_expired_premieres',
    'share_ad_revenue',
    'midroll_enabled',
    'midroll_after_secs',
    'postroll_enabled',
  ]
  const entries = Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined)
  if (!entries.length) return getSettings({ fresh: true })

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => v)
  await query(`update platform_settings set ${sets} where id = 1`, values)
  cache = null
  return getSettings({ fresh: true })
}

/**
 * The split that applies to a specific creator: their override if they have
 * one, otherwise the platform default. Returned as the CREATOR's percentage.
 */
export async function splitPercentFor(creatorId) {
  const row = await one(
    `select cp.revenue_split_percent as override, ps.creator_split_percent as dflt
       from platform_settings ps
       left join creator_profiles cp on cp.user_id = $1
      where ps.id = 1`,
    [creatorId]
  )
  return row?.override ?? row?.dflt ?? 70
}

/** Split an amount into creator/platform parts, rounding in the creator's favour. */
export function applySplit(amountTzs, creatorPercent) {
  const creator = Math.round((amountTzs * creatorPercent) / 100)
  return { creator, platform: amountTzs - creator, percent: creatorPercent }
}
