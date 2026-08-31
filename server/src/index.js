/**
 * Run the API on a port.
 *
 * This is now the only entry point. The API ran on Vercel until 2026-08-31,
 * where the platform hands over a request and there is no port to bind, so a
 * second entry point (`api/index.js`) exported the app without listening. The
 * backend runs on Railway alone now — a persistent process, `npm start`, one
 * listener — and that file is gone.
 *
 * `app.js` is still kept separate from this file, which is worth keeping: it is
 * what lets the tests boot the app on an ephemeral port without this module's
 * signal handlers and scheduler coming with it.
 */
import app from './app.js'
import { env, capabilities, missingConfig } from './config/env.js'
import { log } from './lib/logger.js'
import { query, closePool } from './db/pool.js'
import { getSettings } from './services/settings.js'
import { startScheduler } from './jobs/scheduler.js'

const server = app.listen(env.port, async () => {
  log.ok(`MTONYO+ API listening on http://localhost:${env.port}  (${env.nodeEnv})`)

  const missing = missingConfig()
  if (missing.length) {
    log.warn('running with reduced capability:')
    missing.forEach((m) => log.warn(`  · ${m}`))
  }

  if (capabilities.database) {
    try {
      await query('select 1')
      const s = await getSettings()
      log.ok(`database connected · split ${s.creator_split_percent}/${100 - s.creator_split_percent}`)
      import('./modules/share.routes.js')
        .then((m) => m.queueMissingShareCards())
        .catch(() => {})
    } catch (err) {
      log.error('database check failed:', err.message)
    }
  }

  /**
   * Started here rather than in app.js, deliberately.
   *
   * `app.js` is imported by the tests and by the serverless entry point, neither
   * of which should ever start a timer that writes to production. This file is
   * the only place that binds a port, so it is the only place that is genuinely
   * a long-running server — which is what a scheduler needs.
   *
   * It is also started after the database check, so the first thing the logs show
   * is whether the connection works, not a schedule that may never fire.
   */
  startScheduler()
})

const shutdown = async (signal) => {
  log.info(`${signal} — shutting down`)
  server.close(async () => {
    await closePool().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 8000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
