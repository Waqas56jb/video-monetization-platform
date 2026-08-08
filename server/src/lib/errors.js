/** An error we deliberately surface to the client with a status code. */
export class ApiError extends Error {
  constructor(status, message, { code = null, details = null } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.expected = true
  }
}

export const badRequest = (m, o) => new ApiError(400, m, o)
export const unauthorized = (m = 'Sign in to continue', o) => new ApiError(401, m, o)
export const forbidden = (m = 'You do not have permission to do that', o) => new ApiError(403, m, o)
export const notFound = (m = 'Not found', o) => new ApiError(404, m, o)
export const conflict = (m, o) => new ApiError(409, m, o)
export const unprocessable = (m, o) => new ApiError(422, m, o)
export const serviceUnavailable = (m, o) => new ApiError(503, m, o)

/** Wrap an async route so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
