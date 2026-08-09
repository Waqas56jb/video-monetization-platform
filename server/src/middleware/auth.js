import { userFromToken } from '../lib/supabase.js'
import { one } from '../db/pool.js'
import { unauthorized, forbidden } from '../lib/errors.js'

const bearer = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

/**
 * Resolve the caller from their Supabase access token and attach their
 * profile. The profile — not the token — is the source of truth for role and
 * account status, so blocking someone takes effect on their very next request.
 */
export async function attachUser(req) {
  const token = bearer(req)
  if (!token) return null

  // Kept so a route can act *as* this person against storage, where the
  // policies are written in terms of who is asking rather than a service key.
  req.accessToken = token

  const authUser = await userFromToken(token)
  const profile = await one(
    `select id, email, full_name, phone, role, status, avatar_url, created_at,
            bio, location, website, email_announcements, email_account_news
       from profiles where id = $1`,
    [authUser.id]
  )
  if (!profile) throw unauthorized('Your account is not set up yet')
  return profile
}

/** Require a signed-in, active account. */
export function requireAuth() {
  return async (req, _res, next) => {
    try {
      const user = await attachUser(req)
      if (!user) throw unauthorized()
      if (user.status === 'blocked') throw forbidden('This account has been blocked')
      if (user.status === 'suspended' && req.method !== 'GET') {
        throw forbidden('This account is suspended and cannot make changes')
      }
      req.user = user
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Attach the user when a token is present, but allow anonymous callers. */
export function optionalAuth() {
  return async (req, _res, next) => {
    try {
      req.user = (await attachUser(req)) || null
    } catch {
      req.user = null // an invalid token simply means "not signed in" here
    }
    next()
  }
}

/** Gate a route on role. Admin passes everything. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next()
    next(forbidden(`This action requires the ${roles.join(' or ')} role`))
  }
}

/**
 * Staff — admin or sub-admin. This is the gate for the work of running the
 * platform: reviewing content, deciding withdrawals, managing ads, announcing.
 */
export const requireStaff = () => requireRole('admin', 'sub_admin')

/**
 * Admin alone. Everything to do with *accounts* sits behind this: viewing
 * users, changing a role or status, creating or removing sub-admins, and the
 * platform-wide settings.
 *
 * `requireRole` lets admins through anything, so this cannot be written as
 * requireRole('admin') and still exclude sub-admins — it has to be its own
 * check. The database enforces the same rule in guard_account_changes(), so a
 * route wired up carelessly still cannot get past it.
 */
export function requireAdmin() {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (req.user.role === 'admin') return next()
    if (req.user.role === 'sub_admin') {
      return next(
        forbidden('Sub-admins cannot view or change accounts. Ask an administrator.')
      )
    }
    next(forbidden('This action requires the admin role'))
  }
}

export const requireCreator = () => requireRole('creator')

export const isStaff = (user) => user?.role === 'admin' || user?.role === 'sub_admin'
