import { userFromToken } from '../lib/supabase.js'
import { one, many } from '../db/pool.js'
import { unauthorized, forbidden } from '../lib/errors.js'
import { loadProfileCached } from '../lib/profileCache.js'

const bearer = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

/**
 * Resolve the caller from their Supabase access token and attach their
 * profile. The profile — not the token — is the source of truth for role and
 * account status. Status is still checked on every request; the row is cached
 * 60s per userId and dropped when admin block/suspend/revoke/role routes run.
 */
export async function attachUser(req) {
  const token = bearer(req)
  if (!token) return null

  // Kept so a route can act *as* this person against storage, where the
  // policies are written in terms of who is asking rather than a service key.
  req.accessToken = token

  const authUser = await userFromToken(token)
  const profile = await loadProfileCached(authUser.id, (id) =>
    one(
      `select id, email, full_name, phone, role, status, avatar_url, created_at,
              bio, location, website, email_announcements, email_account_news
         from profiles where id = $1`,
      [id]
    )
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

/**
 * Attach the user when a token is present, but allow anonymous callers.
 *
 * The swallowed error is deliberate — these routes must answer a stranger — but
 * silently is not. `/api/playback/:id/playback` answers per viewer, so an expired
 * token here returns a perfectly good `200` describing a preview, and the client
 * has no way to tell that from genuinely not owning the video. It cannot refresh,
 * because refreshing is triggered by a 401 that never comes. The viewer sees
 * Unlock on a film they paid for, and the only cure is signing out and back in.
 *
 * So: still 200, still anonymous, but say so in a header. A caller that sent a
 * token and gets this back knows to refresh and ask again. It is only set when a
 * token was actually presented — a signed-out viewer is not a problem to report.
 */
export function optionalAuth() {
  return async (req, res, next) => {
    const presentedToken = Boolean(bearer(req))
    try {
      req.user = (await attachUser(req)) || null
    } catch {
      req.user = null
      if (presentedToken) {
        req.authRejected = true
        res.setHeader('X-Auth-Status', 'expired')
      }
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

/**
 * Studio access: a creator, an administrator, a staff member who opened the
 * Create side on this email, or anyone who already has a creator profile.
 *
 * The public app lets one email use Watch and Create. The profile role stays
 * `admin` / `sub_admin` so staff access is not stripped — this check follows
 * the creator side, not only `profiles.role = creator`.
 */
export async function hasCreatorAccess(user) {
  if (!user) return false
  if (user.role === 'creator' || user.role === 'admin' || user.role === 'sub_admin') return true
  const row = await one('select user_id from creator_profiles where user_id = $1', [user.id])
  return Boolean(row)
}

export function requireCreator() {
  return async (req, _res, next) => {
    try {
      if (!req.user) throw unauthorized()
      if (await hasCreatorAccess(req.user)) return next()
      throw forbidden('This action requires the creator role')
    } catch (err) {
      next(err)
    }
  }
}

export const isStaff = (user) => user?.role === 'admin' || user?.role === 'sub_admin'

/**
 * Every module a staff permission can cover. Kept in step with the
 * `staff_module` enum in migration 014 — the database is the authority, this is
 * here so a typo in a route becomes an obvious error rather than a silent
 * always-deny.
 */
export const STAFF_MODULES = [
  'users',
  'creators',
  'videos',
  'review',
  'moderation',
  'announcements',
  'payments',
  'withdrawals',
  'revenue',
  'ads',
  'settings',
  'audit',
]

/** What this staff member may do. An administrator holds everything. */
export async function permissionsFor(user) {
  if (!user) return []
  if (user.role === 'admin') return [...STAFF_MODULES]
  if (user.role !== 'sub_admin') return []
  const rows = await many('select module from staff_permissions where user_id = $1', [user.id])
  return rows.map((r) => r.module)
}

/**
 * Gate a route on a specific module.
 *
 * "sub_admin" used to be one switch: in, or not in. That let somebody brought
 * on to review uploads also decide withdrawals and change the platform's
 * revenue split. This asks the narrower question — may THIS person touch THIS
 * module — and answers it from the database on every request, so revoking a
 * permission takes effect on the very next call rather than whenever they next
 * sign in.
 *
 * An administrator is never filtered; their role is the permission. A sub-admin
 * with no grant is refused with a message that names what they are missing,
 * because "forbidden" with no noun in it wastes an afternoon.
 *
 * The database enforces the same rule in guard_staff_permissions(), so a route
 * wired up carelessly still cannot hand out access.
 */
export function requirePermission(module) {
  if (!STAFF_MODULES.includes(module)) {
    throw new Error(`Unknown staff module "${module}" — see STAFF_MODULES`)
  }
  return async (req, _res, next) => {
    try {
      if (!req.user) throw unauthorized()
      if (req.user.role === 'admin') return next()
      if (req.user.role !== 'sub_admin') {
        throw forbidden('This area is for the MTONYO+ team')
      }
      const held = await one(
        'select 1 as ok from staff_permissions where user_id = $1 and module = $2::staff_module',
        [req.user.id, module]
      )
      if (!held) {
        throw forbidden(
          `You do not have the "${module}" permission. Ask an administrator to grant it.`
        )
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
