/**
 * Run the API on a port.
 *
 * This is the local and long-running-server entry point. A serverless host uses
 * `api/index.js`, which imports the same app and never binds a port.
 */
import app from './app.js'
import { env, capabilities, missingConfig } from './config/env.js'
import { log } from './lib/logger.js'
import { query, closePool } from './db/pool.js'
import { getSettings } from './services/settings.js'

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
