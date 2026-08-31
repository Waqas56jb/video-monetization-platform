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

  /**
   * A 500 has to be diagnosable from outside.
   *
   * "Something went wrong on our side" is the right thing to show a viewer and
   * the wrong thing to be the only record. Sign-in broke in production and this
   * handler gave the same six words for every possible cause — a thrown network
   * error, a bad column, a client library rejecting instead of returning — with
   * the real message reachable only by someone holding the hosting dashboard.
   *
   * So two additions, neither of which leaks anything a viewer should not see:
   *
   * `errorClass` is the constructor name — `TypeError`, `AuthApiError`,
   * `FetchError`. It carries no message, no stack, no data, and no hint about
   * this account; it narrows "something" to a category, which is most of the
   * distance to a cause.
   *
   * `ref` is the host's own request id, echoed back. It is already on the wire
   * as a response header. Having it inside the error body is what lets a report
   * — a screenshot, a pasted response — be matched to one line in the log.
   *
   * The stack is logged in production too. It was already being written for
   * development, which is the environment where it is least needed.
   */
  if (status >= 500) {
    const ref = req.headers['x-railway-request-id'] || req.headers['x-vercel-id'] || null
    log.error(
      `${req.method} ${req.originalUrl} → ${err.name || 'Error'}: ${err.message}` +
        (ref ? ` [ref ${ref}]` : '')
    )
    if (err.stack) console.error(err.stack)
    if (env.isProd) {
      message = 'Something went wrong on our side'
      return res.status(status).json({
        error: {
          message,
          errorClass: err.name || 'Error',
          ...(ref ? { ref } : {}),
          ...(code ? { code } : {}),
        },
      })
    }
  }

  res.status(status).json({
    error: {
      message,
      ...(code ? { code } : {}),
      ...(err.details ? { details: err.details } : {}),
    },
  })
}
