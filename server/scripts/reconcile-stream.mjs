#!/usr/bin/env node
/**
 * Repair what 22 days of dead webhooks left behind.
 *
 *   node scripts/reconcile-stream.mjs --dry     show what would change
 *   node scripts/reconcile-stream.mjs           do it
 *   node scripts/reconcile-stream.mjs --slug x  one video only
 *
 * WHY THIS EXISTS
 *
 * Cloudflare's Stream webhook was pointed at `…-backend.vercel.app` from
 * 2026-08-09 until 2026-08-31. That host answers DEPLOYMENT_NOT_FOUND, so every
 * "your video finished encoding" notification in that window went nowhere.
 *
 * The webhook handler is the only place that learns a video's real duration,
 * dimensions and poster, flips `state` to 'ready', and kicks off `ensureClips`
 * and the share card. Nothing looked broken, because the upload screen polls
 * /api/videos/:id/status as a fallback and `ensureClips` also fires lazily on
 * the playback path — so a video did become playable, eventually, and the cost
 * was paid by whoever pressed Play first. That viewer waits while Cloudflare
 * cuts the preview clip in front of them, which is a strong candidate for the
 * "Connecting to player, 20–30s" report on freshly uploaded titles.
 *
 * Two rows are still visibly stuck: one in `state='processing'` with a NULL
 * duration that will never leave it, and one published row with no preview
 * asset at all.
 *
 * WHAT THIS TOUCHES
 *
 * Reads from Cloudflare. Writes to our database. The only Cloudflare writes are
 * `ensureClips` and the MP4-download enable it performs, both of which are
 * ordinary parts of publishing a video and are idempotent — `ensureClips` skips
 * a clip that already exists and is the right length. Nothing is deleted, and
 * no Cloudflare asset is replaced except a preview clip whose stored length
 * disagrees with the length we advertise, which is the same rule publish uses.
 *
 * Every field is filled only when ours is NULL or zero. Cloudflare never
 * overwrites a value a human set — a creator's custom thumbnail in particular.
 */
import 'dotenv/config'
import { many, one, query, closePool } from '../src/db/pool.js'
import { capabilities } from '../src/config/env.js'
import * as cf from '../src/lib/cloudflare.js'
import { dimensionsFromCloudflare } from '../src/lib/videoShape.js'
import { ensureClips } from '../src/modules/playback.routes.js'
import { clampFreePreviewSeconds } from '../src/lib/preview.js'
import { log } from '../src/lib/logger.js'

const DRY = process.argv.includes('--dry')
const slugArg = (() => {
  const i = process.argv.indexOf('--slug')
  return i !== -1 ? process.argv[i + 1] : null
})()

if (!capabilities.cloudflareStream) {
  log.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set')
  process.exit(1)
}

const dash = (n) => '-'.repeat(n)
const yn = (v) => (v ? 'yes' : '.')

/**
 * Only fill what we do not already have. A human's value always wins.
 *
 * Nothing at all is taken from a video that is not `readyToStream`. Cloudflare
 * reports `duration: -1` while encoding, and `-1` is truthy — the first dry run
 * of this script proposed writing a negative duration to a row that has been
 * stuck in 'processing' since the webhook died. It also serves a placeholder
 * poster in that state. A video that is not ready has nothing worth copying.
 */
function fillable(row, remote) {
  if (!remote?.readyToStream) {
    return { duration: null, width: null, height: null, thumbnail: null, state: null }
  }

  const size = dimensionsFromCloudflare(remote)
  const seconds = Math.floor(Number(remote?.duration || 0))
  const duration = seconds > 0 ? seconds : null
  const thumbnail = remote?.thumbnail || null

  return {
    duration: !row.duration_seconds && duration ? duration : null,
    width: !row.width && size.width ? size.width : null,
    height: !row.height && size.height ? size.height : null,
    // custom_thumbnail_url is the creator's own choice and is never touched.
    thumbnail: !row.thumbnail_url && thumbnail ? thumbnail : null,
    // 'processing' is the state a missed webhook strands a video in.
    state: remote?.readyToStream && row.state !== 'ready' ? 'ready' : null,
  }
}

const results = []

try {
  const rows = await many(
    /* creator_name comes along because shareSourceKey hashes it — computing the
       key without it never matches the stored one, and every card then reads as
       stale. The first dry run proposed rebuilding seven perfectly good cards. */
    `select v.id, v.slug, v.title, v.state, v.is_published, v.review_status,
            v.cloudflare_uid, v.preview_uid, v.social_clip_uid,
            v.duration_seconds, v.width, v.height, v.thumbnail_url, v.custom_thumbnail_url,
            v.free_preview_seconds,
            coalesce(cp.display_name, p.full_name) as creator_name
       from videos v
       join profiles p on p.id = v.creator_id
       left join creator_profiles cp on cp.user_id = v.creator_id
      where v.deleted_at is null
        and v.cloudflare_uid is not null
        ${slugArg ? 'and v.slug = $1' : ''}
      order by v.created_at`,
    slugArg ? [slugArg] : []
  )

  console.log(`\n  MTONYO+  reconcile Stream -> database${DRY ? '   [DRY RUN — nothing is written]' : ''}\n`)
  console.log(`  ${rows.length} video(s) with a Cloudflare uid\n`)

  for (const row of rows) {
    const r = {
      slug: row.slug,
      uid: row.cloudflare_uid,
      ready: false,
      duration: '.',
      dims: '.',
      thumb: '.',
      state: '.',
      clips: '.',
      card: '.',
      note: '',
    }

    const remote = await cf.getVideo(row.cloudflare_uid).catch((e) => {
      r.note = `cloudflare: ${e.message.slice(0, 40)}`
      return null
    })

    if (!remote) {
      results.push(r)
      continue
    }

    r.ready = Boolean(remote.readyToStream)
    const fill = fillable(row, remote)

    if (fill.duration) r.duration = String(fill.duration)
    if (fill.width || fill.height) r.dims = `${fill.width ?? row.width}x${fill.height ?? row.height}`
    if (fill.thumbnail) r.thumb = 'set'
    if (fill.state) r.state = fill.state

    const anyFill = fill.duration || fill.width || fill.height || fill.thumbnail || fill.state
    if (anyFill && !DRY) {
      await query(
        `update videos
            set duration_seconds = coalesce($2, duration_seconds),
                width            = coalesce($3, width),
                height           = coalesce($4, height),
                thumbnail_url    = coalesce($5, thumbnail_url),
                state            = coalesce($6, state)
          where id = $1`,
        [row.id, fill.duration, fill.width, fill.height, fill.thumbnail, fill.state]
      )
    }

    /**
     * Clips, but only when there is something to clip.
     *
     * `ensureClips` reads the row back itself and refuses unless state is
     * 'ready', so the update above has to land first — which is exactly the
     * ordering the webhook would have had.
     */
    const wantsPreview = !row.preview_uid
    const wantsSocial = !row.social_clip_uid
    if (r.ready && (wantsPreview || wantsSocial)) {
      const duration = fill.duration || row.duration_seconds || 0
      const previewEnd = clampFreePreviewSeconds(row.free_preview_seconds || 300, duration)
      if (duration > 0 && previewEnd > 0) {
        if (DRY) {
          r.clips = [wantsPreview && 'preview', wantsSocial && '60s'].filter(Boolean).join('+')
        } else {
          const made = await ensureClips(row.id).catch((e) => {
            r.note = `clips: ${e.message.slice(0, 40)}`
            return null
          })
          const fresh = await one('select preview_uid, social_clip_uid from videos where id = $1', [row.id])
          r.clips =
            [
              wantsPreview && fresh?.preview_uid && 'preview',
              wantsSocial && fresh?.social_clip_uid && '60s',
            ]
              .filter(Boolean)
              .join('+') || (made ? 'none' : 'failed')
        }
      } else {
        // A one-second upload cannot give away a third of itself. Nothing to cut.
        r.clips = 'n/a'
        r.note = r.note || `too short (${duration}s)`
      }
    }

    /**
     * The share card, for public videos only.
     *
     * An unpublished video has no share URL to put one behind, and building
     * cards for drafts would burn Sharp time and Facebook scrape calls on rows
     * nobody can reach.
     */
    if (row.is_published && row.review_status === 'approved') {
      const { readCardStatus } = await import('../src/lib/shareCardCache.js')
      const { shareSourceKey } = await import('../src/lib/shareMeta.js')
      const key = shareSourceKey(row)
      const status = await readCardStatus(row.slug, key).catch(() => 'fallback')
      if (status !== 'ready') {
        if (DRY) {
          r.card = `would build (${status})`
        } else {
          const { buildShareCard } = await import('../src/lib/buildShareCard.js')
          const built = await buildShareCard(row.id).catch((e) => ({ ok: false, error: e.message }))
          r.card = built.ok ? (built.uploaded ? 'built+uploaded' : 'built') : `failed: ${built.error || '?'}`
        }
      }
    }

    results.push(r)
  }

  /* ------------------------------------------------------------- report */
  const head =
    `${'slug'.padEnd(42)}${'ready'.padEnd(7)}${'duration'.padEnd(10)}` +
    `${'dims'.padEnd(12)}${'thumb'.padEnd(7)}${'state'.padEnd(7)}${'clips'.padEnd(14)}card`
  console.log(head)
  console.log(dash(head.length))
  for (const r of results) {
    console.log(
      r.slug.slice(0, 40).padEnd(42) +
        yn(r.ready).padEnd(7) +
        r.duration.padEnd(10) +
        r.dims.padEnd(12) +
        r.thumb.padEnd(7) +
        r.state.padEnd(7) +
        r.clips.padEnd(14) +
        r.card
    )
    if (r.note) console.log(`  ${dash(2)} ${r.note}`)
  }
  console.log(dash(head.length))

  const changed = results.filter(
    (r) => r.duration !== '.' || r.dims !== '.' || r.thumb !== '.' || r.state !== '.' || r.clips !== '.' || r.card !== '.'
  )
  console.log(
    `\n  ${results.length} scanned · ${changed.length} ${DRY ? 'would change' : 'changed'} · ` +
      `${results.filter((r) => r.note).length} with notes\n`
  )
  if (DRY) console.log('  Dry run. Re-run without --dry to apply.\n')
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
