import { badRequest } from '../lib/errors.js'

/**
 * Validate and REPLACE the request part with the parsed result, so handlers
 * always work with coerced, trimmed, defaulted values.
 */
export const validate = (schema, where = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[where])
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || where,
      message: i.message,
    }))
    return next(badRequest(details[0]?.message || 'Invalid request', { code: 'VALIDATION', details }))
  }
  if (where === 'query') req.validatedQuery = result.data
  else req[where] = result.data
  next()
}

export const validateQuery = (schema) => validate(schema, 'query')
export const validateParams = (schema) => validate(schema, 'params')
