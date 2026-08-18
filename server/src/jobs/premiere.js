import { many, transaction } from '../db/pool.js'
import { getSettings } from '../services/settings.js'
import { recordAudit } from '../services/audit.js'
import { log } from '../lib/logger.js'

/**
 * Paid Premiere → Free With Ads.
 *
 * When a video's per-video paid window runs out it does NOT disappear: it
 * stays in the library forever and simply switches to free-with-ads, so it
 * keeps earning from pre-roll. Everyone who already bought it keeps their
 * ad-free copy, because their entitlement row is untouched.
 *
 * The daily cron sweeps everything that is due. Opening the video also
 * converts that one title immediately — otherwise a window that closed this
 * afternoon would still sell until 02:00 UTC, and the homepage claim
 * ("automatically becomes Free + Ads") would be false for most of the day.
 *
 * Idempotent and safe to run as often as you like.
 */

function isDue(video) {
  if (!video || video.access_type !== 'paid_premiere') return false
  if (!video.premiere_ends_at) return false
  return new Date(video.premiere_ends_at).getTime() <= Date.now()
}

async function switchOne(v, settings, actorId) {
  const updated = await transaction(
    async (client) => {
      const { rows } = await client.query(
        `update videos
            set access_type = 'free_with_ads',
                price_tzs = 0,
                ads_enabled = $2,
                premiere_days = null,
                premiere_started_at = null,
                premiere_ends_at = null
          where id = $1
            and access_type = 'paid_premiere'
          returning *`,
        [v.id, settings.ads_on_expired_premieres]
      )
      return rows[0] || null
    },
    // The publication guard treats this as an administrative action.
    { actorRole: 'admin', actorId }
  )

  if (!updated) return null

  await recordAudit({
    actorId,
    action: 'PREMIERE_EXPIRED',
    entityType: 'video',
    entityId: v.id,
    detail: { title: v.title, endedAt: v.premiere_ends_at, nowFreeWithAds: true },
  })

  log.ok(`premiere ended → free with ads: ${v.title}`)
  return updated
}

/**
 * Convert this title now if its paid window has already closed.
 *
 * Used on Watch / playback / ads so the next person to open it sees Free + Ads
 * the moment the window ends, not the next morning when cron runs.
 */
export async function expireIfDue(video, { actorId = null } = {}) {
  if (!isDue(video)) return video
  const settings = await getSettings({ fresh: true })
  if (!settings.auto_premiere_to_free) return video
  const updated = await switchOne(video, settings, actorId)
  return updated ? { ...video, ...updated } : video
}

export async function runPremiereExpiry({ actorId = null, dryRun = false } = {}) {
  const settings = await getSettings({ fresh: true })
  if (!settings.auto_premiere_to_free) {
    return { ran: false, reason: 'auto_premiere_to_free is switched off', switched: [] }
  }

  const due = await many(
    `select id, title, creator_id, premiere_ends_at
       from videos
      where access_type = 'paid_premiere'
        and is_published = true
        and deleted_at is null
        and premiere_ends_at is not null
        and premiere_ends_at <= now()
      order by premiere_ends_at asc
      limit 500`
  )

  if (!due.length) return { ran: true, dryRun, checked: 0, switched: [] }
  if (dryRun) return { ran: true, dryRun: true, checked: due.length, switched: due }

  const switched = []
  for (const v of due) {
    try {
      const updated = await switchOne(v, settings, actorId)
      if (updated) switched.push({ id: updated.id, title: updated.title })
    } catch (err) {
      log.error(`could not switch "${v.title}": ${err.message}`)
    }
  }

  return { ran: true, checked: due.length, switched }
}
