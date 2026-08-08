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
 * Idempotent and safe to run as often as you like.
 */
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
      await transaction(
        async (client) => {
          await client.query(
            `update videos
                set access_type = 'free_with_ads',
                    price_tzs = 0,
                    ads_enabled = $2,
                    premiere_days = null,
                    premiere_started_at = null,
                    premiere_ends_at = null
              where id = $1`,
            [v.id, settings.ads_on_expired_premieres]
          )
        },
        // The publication guard treats this as an administrative action.
        { actorRole: 'admin', actorId }
      )

      await recordAudit({
        actorId,
        action: 'PREMIERE_EXPIRED',
        entityType: 'video',
        entityId: v.id,
        detail: { title: v.title, endedAt: v.premiere_ends_at, nowFreeWithAds: true },
      })

      switched.push({ id: v.id, title: v.title })
      log.ok(`premiere ended → free with ads: ${v.title}`)
    } catch (err) {
      log.error(`could not switch "${v.title}": ${err.message}`)
    }
  }

  return { ran: true, checked: due.length, switched }
}
