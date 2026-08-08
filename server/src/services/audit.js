import { query } from '../db/pool.js'
import { log } from '../lib/logger.js'
import { notifyAdminsOfStaffAction } from './notify.js'

/**
 * Every admin action is recorded. The client asked for this explicitly:
 * "Every admin action, permanently recorded."
 */
export async function recordAudit({ actorId, action, entityType, entityId, detail, ip }, client = null) {
  const sql = `insert into audit_log (actor_id, action, entity_type, entity_id, detail, ip)
               values ($1,$2,$3,$4,$5,$6)`
  const params = [actorId ?? null, action, entityType ?? null, entityId ? String(entityId) : null,
                  detail ? JSON.stringify(detail) : null, ip ?? null]
  try {
    if (client) await client.query(sql, params)
    else await query(sql, params)
  } catch (err) {
    // Never let audit logging break the action it is describing.
    log.warn('audit write failed:', err.message)
  }
}

export const clientIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '').trim() || null

/**
 * Record a staff action AND put it in front of the admins.
 *
 * Both halves matter and they are different audiences: the audit log is the
 * permanent, queryable record; the notification is what an admin actually sees
 * without going looking. A sub-admin approving a video should not be something
 * you only find out about if you think to check.
 *
 * `summary` is written for a human reading a list at a glance — "Approved
 * 'Bongo Nights'" — not for a machine. The structured `detail` still goes to
 * the audit log for anyone who needs the specifics.
 */
export async function recordStaffAction(
  req,
  { action, entityType, entityId, summary, body = null, detail = null },
  client = null
) {
  const actor = req.user

  await recordAudit(
    { actorId: actor?.id, action, entityType, entityId, detail, ip: clientIp(req) },
    client
  )

  const who = actor?.full_name || actor?.email || 'A staff member'
  const role = actor?.role === 'sub_admin' ? 'Sub-admin' : 'Admin'

  await notifyAdminsOfStaffAction({
    actor,
    action,
    entityType,
    entityId,
    title: summary || `${role} ${who} performed ${action}`,
    body: body ?? `${role} · ${who} · ${actor?.email || 'unknown email'}`,
  })
}
