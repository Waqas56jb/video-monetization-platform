/**
 * The scheduled work, now that nobody else runs it.
 *
 * Two jobs lived in `server/vercel.json` as Vercel Cron entries. Vercel Cron is
 * a property of a Vercel deployment, so moving the API to Railway silently
 * stopped both — silently being the problem: neither failure is visible from the
 * outside for days.
 *
 *   0 2 * * *   premiere expiry
 *   15 3 * * *  share-card rebuild (stale only)
 *
 * WHY IN-PROCESS RATHER THAN A RAILWAY CRON SERVICE
 *
 * Railway runs one persistent process, which is the model an in-process
 * scheduler was always meant for and the exact thing Vercel could not offer — a
 * serverless function has nobody to hold a timer. So the reason those two jobs
 * were HTTP endpoints hit by an external scheduler no longer applies.
 *
 * A Railway Cron service would work too, and the endpoints below are kept so it
 * remains an option. It was not chosen because it costs a second service, a
 * second deploy target, and a shared secret travelling over the network to reach
 * code already running in this process — and because a schedule that lives in a
 * dashboard is invisible in the repository. The Vercel crons were exactly that,
 * and that is part of why nobody noticed them stopping.
 *
 * Both jobs are idempotent by design — `runPremiereExpiry` says so in its own
 * header, and a rebuild re-derives from source — so the worst case if Railway
 * ever runs two instances is duplicated work, not incorrect data.
 *
 * SAFETY
 *
 * Runs only when `RAILWAY_ENVIRONMENT` is set, so a developer's laptop, a test
 * run and any CI process never fire scheduled work against production.
 * `DISABLE_CRON=1` turns it off without a redeploy. Overlapping runs are refused
 * rather than queued: a rebuild that takes longer than a day should not stack.
 */
import cron from 'node-cron'
import { log } from '../lib/logger.js'
import { runPremiereExpiry } from './premiere.js'

/** Vercel Cron ran in UTC. Keep the same wall clock so schedules do not shift. */
const TZ = 'Etc/UTC'

const running = new Set()

/**
 * Run one job, refusing to start it twice.
 *
 * A scheduled job that throws must never take the API down with it — this is the
 * same process serving requests now, which was not true on Vercel.
 */
async function runOnce(name, fn) {
  if (running.has(name)) {
    log.warn(`cron ${name}: previous run still going — skipping this tick`)
    return
  }
  running.add(name)
  const started = Date.now()
  try {
    const result = await fn()
    log.ok(`cron ${name} finished in ${Date.now() - started}ms ${JSON.stringify(result ?? {})}`)
  } catch (err) {
    log.error(`cron ${name} failed after ${Date.now() - started}ms:`, err.message)
  } finally {
    running.delete(name)
  }
}

/** Every schedule in one place, so the repository is the source of truth. */
export const JOBS = [
  {
    name: 'premiere-expiry',
    schedule: '0 2 * * *',
    /**
     * Moves a Paid Premiere to Free + Ads once its window closes.
     *
     * Not the only mechanism — `expireIfDue` converts a title the moment anyone
     * opens it, so a video someone watches is never wrong. What this catches is
     * the one nobody opens: it would keep showing a price, and keep selling, past
     * the end of the window the creator set.
     */
    run: () => runPremiereExpiry(),
  },
  {
    name: 'share-cards-stale',
    schedule: '15 3 * * *',
    /**
     * Rebuilds cards whose poster, title or creator changed.
     *
     * Imported lazily because the builder pulls in Sharp and opentype. Boot
     * stays light, and a process that never rebuilds a card never loads them.
     *
     * Failing here is slow rather than broken: `sharePayloadFromRow` notices a
     * card is not ready when a video is opened and queues the same build. This
     * job means a changed poster is corrected overnight instead of waiting for
     * the next viewer.
     */
    run: async () => {
      const { rebuildShareCards } = await import('../lib/buildShareCard.js')
      const { scanned, results } = await rebuildShareCards({ stale: true, concurrency: 3 })
      return { scanned, built: results.filter((r) => r.status === 'built').length }
    },
  },
]

/** True when this process is the one that should be running scheduled work. */
export function schedulingEnabled() {
  if (process.env.DISABLE_CRON === '1') return false
  return Boolean(process.env.RAILWAY_ENVIRONMENT)
}

export function startScheduler() {
  if (!schedulingEnabled()) {
    log.info(
      process.env.DISABLE_CRON === '1'
        ? 'scheduler off (DISABLE_CRON=1)'
        : 'scheduler off (not a Railway environment) — jobs still reachable at /api/jobs/*'
    )
    return []
  }

  const tasks = JOBS.map((job) => {
    const task = cron.schedule(job.schedule, () => runOnce(job.name, job.run), { timezone: TZ })
    log.ok(`cron scheduled: ${job.name} at "${job.schedule}" ${TZ}`)
    return task
  })

  return tasks
}
