import { query } from '../db/pool.js'
import { log } from '../lib/logger.js'

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
