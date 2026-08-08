import { env } from '../config/env.js'
import { log } from '../lib/logger.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' } })
}

/** Turn anything thrown into a consistent JSON error. */
export function errorHandler(err, req, res, _next) {
  let status = err.status || 500
  let message = err.message || 'Something went wrong'
  let code = err.code || null

  // Postgres errors we raise deliberately in triggers/constraints
  if (err.code === '23505') { status = 409; message = 'That already exists'; code = 'DUPLICATE' }
  else if (err.code === '23503') { status = 400; message = 'Referenced record does not exist'; code = 'FK' }
  else if (err.code === '23514') { status = 400; code = 'CHECK' }
  else if (err.code === '42501') { status = 403; code = 'DB_FORBIDDEN' }   // insufficient_privilege
  else if (err.code === '2BP01') { status = 409; code = 'DB_RESTRICT' }    // restrict_violation

  if (status >= 500) {
    log.error(`${req.method} ${req.originalUrl} →`, err.message)
    if (!env.isProd && err.stack) console.error(err.stack)
    if (env.isProd) message = 'Something went wrong on our side'
  }

  res.status(status).json({
    error: {
      message,
      ...(code ? { code } : {}),
      ...(err.details ? { details: err.details } : {}),
    },
  })
}
