/**
 * Mount a router only when a request actually hits it.
 *
 * The serverless bundle otherwise loads Sharp, nodemailer, payment providers
 * and the admin surface on every cold start — including a public /api/videos
 * call that needs none of them.
 */
export function lazyRouter(loader) {
  let router
  let pending
  return (req, res, next) => {
    if (router) return router(req, res, next)
    pending =
      pending ||
      loader()
        .then((mod) => {
          router = mod.default
          return router
        })
        .catch((err) => {
          pending = null
          throw err
        })
    return pending.then((mounted) => mounted(req, res, next)).catch(next)
  }
}
