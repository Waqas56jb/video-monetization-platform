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

    /**
     * Only hide what we did not mean to say.
     *
     * `expected` marks an ApiError — one this codebase raised on purpose, with a
     * message written for the person reading it. Several of those are 5xx and
     * were being thrown away: "Too many sign-in attempts in a short time. Wait a
     * minute and try again — your password is fine", "The sign-in service is not
     * responding. Your account is unaffected", and the configuration errors that
     * name the variable to fix. Every one of them was replaced in production by
     * six words that say nothing, and the effect was invisible because it only
     * happened where nobody was looking.
     *
     * An unexpected throw is the opposite case: its message was written for a
     * developer and may carry a host, a query or a value from someone's account,
     * so it is replaced and only its class survives.
     */
    if (env.isProd && !err.expected) {
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
