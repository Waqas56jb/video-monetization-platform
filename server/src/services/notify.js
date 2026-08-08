import { query, many } from '../db/pool.js'
import { log } from '../lib/logger.js'

/**
 * Notifications — the admin's window onto everything the team does.
 *
 * Every approval, rejection, block, removal and withdrawal decision lands in
 * the admin's inbox naming the person who did it: full name AND email, both
 * copied in at the time. They are copied rather than joined on purpose, so the
 * record still reads correctly after that account is renamed or deleted. An
 * action must always be traceable to a human.
 *
 * Nothing in here is ever allowed to break the action it describes. A failed
 * write is logged and swallowed: losing a notification is a nuisance, losing an
 * approval because the notification failed would be a bug.
 */

/** Write one notification. */
export async function notify({
  userId,
  kind = 'system',
  title,
  body = null,
  actor = null,
  action = null,
  entityType = null,
  entityId = null,
  announcementId = null,
}) {
  try {
    await query(
      `insert into notifications
         (user_id, kind, title, body, actor_id, actor_name, actor_email, actor_role,
          action, entity_type, entity_id, announcement_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        userId,
        kind,
        title,
        body,
        actor?.id ?? null,
        actor?.full_name ?? actor?.fullName ?? null,
        actor?.email ?? null,
        actor?.role ?? null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        announcementId,
      ]
    )
  } catch (err) {
    log.warn('notification write failed:', err.message)
  }
}

/** Write the same notification for many people in one statement. */
export async function notifyMany(userIds, payload) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return 0
  try {
    await query(
      `insert into notifications
         (user_id, kind, title, body, actor_id, actor_name, actor_email, actor_role,
          action, entity_type, entity_id, announcement_id)
       select id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
         from unnest($1::uuid[]) as t(id)`,
      [
        ids,
        payload.kind || 'system',
        payload.title,
        payload.body ?? null,
        payload.actor?.id ?? null,
        payload.actor?.full_name ?? payload.actor?.fullName ?? null,
        payload.actor?.email ?? null,
        payload.actor?.role ?? null,
        payload.action ?? null,
        payload.entityType ?? null,
        payload.entityId ? String(payload.entityId) : null,
        payload.announcementId ?? null,
      ]
    )
    return ids.length
  } catch (err) {
    log.warn('bulk notification write failed:', err.message)
    return 0
  }
}

/**
 * Tell every admin what a staff member just did.
 *
 * The actor is left out of their own notification — they were there. The full
 * record of their action is in the audit log either way; this inbox is for
 * things somebody else did.
 */
export async function notifyAdminsOfStaffAction({ actor, action, title, body, entityType, entityId }) {
  const admins = await many(
    `select id from profiles where role = 'admin' and status = 'active' and id <> $1`,
    [actor?.id ?? '00000000-0000-0000-0000-000000000000']
  ).catch(() => [])

  return notifyMany(
    admins.map((a) => a.id),
    { kind: 'staff_action', title, body, actor, action, entityType, entityId }
  )
}

/* -------------------------------------------------------------- reading */

export async function listNotifications({ userId, unreadOnly = false, kind = null, limit = 50, offset = 0 }) {
  const where = ['user_id = $1']
  const params = [userId]
  if (unreadOnly) where.push('read_at is null')
  if (kind) {
    params.push(kind)
    where.push(`kind = $${params.length}`)
  }
  params.push(limit, offset)

  return many(
    `select * from notifications
      where ${where.join(' and ')}
      order by created_at desc
      limit $${params.length - 1} offset $${params.length}`,
    params
  )
}

export async function unreadCount(userId) {
  const { rows } = await query(
    'select count(*)::int as n from notifications where user_id = $1 and read_at is null',
    [userId]
  )
  return rows[0]?.n ?? 0
}

export async function markRead(userId, ids = null) {
  if (ids?.length) {
    await query(
      'update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null',
      [userId, ids]
    )
  } else {
    await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [userId])
  }
  return unreadCount(userId)
}

/* --------------------------------------------------------- presentation */

/** Turn a raw row into the shape the apps render. */
export const shapeNotification = (n) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  action: n.action,
  entityType: n.entity_type,
  entityId: n.entity_id,
  announcementId: n.announcement_id,
  read: Boolean(n.read_at),
  createdAt: n.created_at,
  actor: n.actor_id || n.actor_name
    ? { id: n.actor_id, name: n.actor_name, email: n.actor_email, role: n.actor_role }
    : null,
})
