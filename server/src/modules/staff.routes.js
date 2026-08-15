import { Router } from 'express'
import { z } from 'zod'
import { one, many, query, transaction } from '../db/pool.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import {
  requireAuth,
  requireStaff,
  requireAdmin,
  requirePermission,
  STAFF_MODULES,
} from '../middleware/auth.js'
import { createAuthUser, issueResetToken, setAuthEmail, deleteAuthUser, verifyPassword } from '../lib/authdb.js'
import { sendMail, staffInviteEmail, announcementEmail } from '../lib/mailer.js'
import { recordAudit, recordStaffAction, clientIp } from '../services/audit.js'
import { notify, notifyMany, listNotifications, unreadCount, markRead, shapeNotification } from '../services/notify.js'
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

/**
 * The staff area: the notification inbox, announcements, and the sub-admin
 * team.
 *
 * Two different gates are in play and the difference is the whole point:
 *
 *   requireStaff — admin OR sub-admin. Running the platform: reading your
 *                  inbox, posting announcements.
 *   requireAdmin — admin only. Anything to do with *accounts*: creating a
 *                  sub-admin, removing one, changing what they can do.
 *
 * A sub-admin can never see, create or change an account. That is checked
 * here, and again by a trigger in the database, so it holds even if a route is
 * ever wired up carelessly.
 */
const router = Router()
router.use(requireAuth(), requireStaff())

/**
 * Announcing is a module like any other.
 *
 * Broadcasting to every creator on the platform is not something everybody
 * brought in to review uploads should be able to do, and it was previously
 * open to any sub-admin. The notification inbox below is not gated — reading
 * your own messages is not a permission.
 */
router.use('/announcements', requirePermission('announcements'))

/* ======================================================================
   NOTIFICATIONS — the admin's record of everything the team does
   ====================================================================== */

router.get(
  '/notifications',
  validateQuery(
    z.object({
      unread: z.coerce.boolean().optional(),
      kind: z.enum(['staff_action', 'announcement', 'account', 'system']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery
    const [rows, unread] = await Promise.all([
      listNotifications({
        userId: req.user.id,
        unreadOnly: q.unread === true,
        kind: q.kind || null,
        limit: q.limit,
        offset: q.offset,
      }),
      unreadCount(req.user.id),
    ])
    res.json({ notifications: rows.map(shapeNotification), unread })
  })
)

router.get(
  '/notifications/unread-count',
  asyncHandler(async (req, res) => res.json({ unread: await unreadCount(req.user.id) }))
)

router.post(
  '/notifications/read',
  validate(z.object({ ids: z.array(z.string().uuid()).optional() })),
  asyncHandler(async (req, res) => {
    const unread = await markRead(req.user.id, req.body.ids || null)
    res.json({ ok: true, unread })
  })
)

/* ======================================================================
   ANNOUNCEMENTS
   ----------------------------------------------------------------------
   Addressed to one person, or to a whole group. Each recipient gets their
   own notification row, so read state is per person rather than a single
   flag on the message.
   ====================================================================== */

const AUDIENCES = ['user', 'creator', 'all_users', 'all_creators', 'sub_admins', 'everyone']

const announceSchema = z
  .object({
    audience: z.enum(AUDIENCES),
    targetUserId: z.string().uuid().optional(),
    title: z.string().trim().min(3, 'Give the announcement a title').max(140),
    body: z.string().trim().min(3, 'Write the announcement').max(4000),
    alsoEmail: z.boolean().default(false),
  })
  .refine((v) => !['user', 'creator'].includes(v.audience) || Boolean(v.targetUserId), {
    message: 'Choose who this announcement is for',
    path: ['targetUserId'],
  })

/** Who receives this, resolved at send time so the list is never stale. */
async function resolveRecipients(audience, targetUserId) {
  switch (audience) {
    case 'user':
    case 'creator': {
      const p = await one(
        'select id, email, full_name, role from profiles where id = $1 and status <> $2',
        [targetUserId, 'blocked']
      )
      if (!p) throw notFound('That account was not found, or it is blocked')
      if (audience === 'creator' && p.role !== 'creator') {
        throw badRequest('That account is not a creator')
      }
      return [p]
    }
    case 'all_users':
      return many(
        `select id, email, full_name, role from profiles
          where role = 'viewer' and status = 'active'`
      )
    case 'all_creators':
      return many(
        `select id, email, full_name, role from profiles
          where role = 'creator' and status = 'active'`
      )
    case 'sub_admins':
      return many(
        `select id, email, full_name, role from profiles
          where role = 'sub_admin' and status = 'active'`
      )
    case 'everyone':
      return many(
        `select id, email, full_name, role from profiles
          where status = 'active'`
      )
    default:
      throw badRequest('Unknown audience')
  }
}

router.post(
  '/announcements',
  validate(announceSchema),
  asyncHandler(async (req, res) => {
    const { audience, targetUserId, title, body, alsoEmail } = req.body

    /**
     * A sub-admin may address groups but not a named individual. Picking one
     * person means first browsing the list of people, and browsing accounts is
     * exactly what a sub-admin is not allowed to do.
     */
    if (req.user.role !== 'admin' && ['user', 'creator'].includes(audience)) {
      throw forbidden(
        'Sub-admins can announce to a group, but addressing one named person requires an administrator.'
      )
    }

    const recipients = await resolveRecipients(audience, targetUserId)
    if (!recipients.length) throw badRequest('Nobody currently matches that audience')

    const announcement = await one(
      `insert into announcements
         (author_id, author_name, author_email, author_role, audience, target_user_id,
          title, body, recipient_count)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [
        req.user.id,
        req.user.full_name,
        req.user.email,
        req.user.role,
        audience,
        ['user', 'creator'].includes(audience) ? targetUserId : null,
        title,
        body,
        recipients.length,
      ]
    )

    await notifyMany(
      recipients.map((r) => r.id),
      {
        kind: 'announcement',
        title,
        body,
        actor: req.user,
        action: 'announce',
        entityType: 'announcement',
        entityId: announcement.id,
        announcementId: announcement.id,
      }
    )

    // Email is opt-in per announcement. Sending it in the background means a
    // slow mail server never holds up the response.
    let emailed = 0
    if (alsoEmail && capabilities.email) {
      const tpl = announcementEmail({ title, body, fromName: req.user.full_name || 'MTONYO+' })
      emailed = recipients.length
      ;(async () => {
        for (const r of recipients) {
          try {
            await sendMail({ to: r.email, subject: tpl.subject, html: tpl.html })
          } catch (err) {
            log.warn(`announcement email to ${r.email} failed: ${err.message}`)
          }
        }
      })()
    }

    await recordStaffAction(req, {
      action: 'ANNOUNCEMENT_SENT',
      entityType: 'announcement',
      entityId: announcement.id,
      summary: `${req.user.full_name || req.user.email} announced "${title}"`,
      body: `Sent to ${recipients.length} recipient(s) · ${audience.replace(/_/g, ' ')}`,
      detail: { audience, targetUserId: targetUserId || null, recipients: recipients.length },
    })

    res.status(201).json({
      announcement: shapeAnnouncement(announcement),
      delivered: recipients.length,
      emailed,
    })
  })
)

router.get(
  '/announcements',
  validateQuery(
    z.object({
      mine: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
  ),
  asyncHandler(async (req, res) => {
    // A sub-admin sees what they themselves sent. The admin sees everything.
    const mineOnly = req.user.role !== 'admin' || req.validatedQuery.mine === true
    const rows = await many(
      `select * from announcements
        ${mineOnly ? 'where author_id = $2' : ''}
        order by created_at desc limit $1`,
      mineOnly ? [req.validatedQuery.limit, req.user.id] : [req.validatedQuery.limit]
    )
    res.json({ announcements: rows.map(shapeAnnouncement) })
  })
)

router.delete(
  '/announcements/:id',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const row = await one('delete from announcements where id = $1 returning id, title', [req.params.id])
    if (!row) throw notFound('Announcement not found')
    await recordStaffAction(req, {
      action: 'ANNOUNCEMENT_DELETED',
      entityType: 'announcement',
      entityId: row.id,
      summary: `${req.user.full_name || req.user.email} deleted the announcement "${row.title}"`,
    })
    res.json({ ok: true })
  })
)

const shapeAnnouncement = (a) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  audience: a.audience,
  targetUserId: a.target_user_id,
  recipientCount: a.recipient_count,
  createdAt: a.created_at,
  author: { id: a.author_id, name: a.author_name, email: a.author_email, role: a.author_role },
})

/* ======================================================================
   SUB-ADMINS — admin only, from start to finish
   ====================================================================== */

router.get(
  '/sub-admins',
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select p.id, p.email, p.full_name, p.status, p.created_at,
              (select max(created_at) from audit_log a where a.actor_id = p.id) as last_action_at,
              (select count(*)::int from audit_log a where a.actor_id = p.id)   as action_count,
              exists (select 1 from password_resets r
                       where r.user_id = p.id and r.purpose = 'invite'
                         and r.used_at is null and r.expires_at > now())        as invite_pending,
              coalesce(
                (select array_agg(sp.module::text order by sp.module)
                   from staff_permissions sp where sp.user_id = p.id),
                '{}'
              )                                                                 as permissions
         from profiles p
        where p.role = 'sub_admin'
        order by p.created_at desc`
    )
    // No password material is selected here, and there is none to select: the
    // database stores a bcrypt hash and nothing can turn it back into a
    // password. Not even the admin who created the account can see it.
    res.json({
      subAdmins: rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        status: r.status,
        createdAt: r.created_at,
        lastActionAt: r.last_action_at,
        actionCount: r.action_count,
        invitePending: r.invite_pending,
        permissions: r.permissions || [],
      })),
      /* So the interface offers the real list rather than one kept in step by
         hand — the enum in the database is the authority. */
      modules: STAFF_MODULES,
    })
  })
)

/**
 * Set exactly which modules a sub-admin may open.
 *
 * Replaces the whole set rather than adding one at a time: the screen presents
 * a list of checkboxes, and "what they have now" is the thing being saved. It
 * is also the honest shape for an audit entry — the record says what they were
 * left holding, not which box was clicked.
 *
 * Administrator only, and the database refuses anyone else through
 * guard_staff_permissions(), so a sub-admin cannot grant themselves a module
 * even by calling this directly with their own id.
 */
router.put(
  '/sub-admins/:id/permissions',
  requireAdmin(),
  validate(
    z.object({
      modules: z.array(z.enum(STAFF_MODULES)).max(STAFF_MODULES.length),
    })
  ),
  asyncHandler(async (req, res) => {
    const target = await one(`select * from profiles where id = $1 and role = 'sub_admin'`, [
      req.params.id,
    ])
    if (!target) throw notFound('Sub-admin not found')

    const wanted = [...new Set(req.body.modules)]

    const before = await many('select module from staff_permissions where user_id = $1', [target.id])

    await transaction(
      async (c) => {
        await c.query('delete from staff_permissions where user_id = $1', [target.id])
        if (wanted.length) {
          await c.query(
            `insert into staff_permissions (user_id, module, granted_by)
             select $1, unnest($2::staff_module[]), $3`,
            [target.id, wanted, req.user.id]
          )
        }
      },
      { actorRole: 'admin', actorId: req.user.id }
    )

    await recordStaffAction(req, {
      action: 'STAFF_PERMISSIONS_CHANGED',
      entityType: 'profile',
      entityId: target.id,
      summary: `${req.user.full_name || req.user.email} changed what ${target.full_name} can access`,
      body: wanted.length ? wanted.join(', ') : 'No modules — they can see nothing',
      detail: { from: before.map((r) => r.module), to: wanted },
    })

    await notify({
      userId: target.id,
      kind: 'account',
      title: 'Your access has been updated',
      body: wanted.length
        ? `You can now work on: ${wanted.join(', ')}.`
        : 'You currently have no modules assigned. Ask an administrator.',
      actor: req.user,
      action: 'permissions',
      entityType: 'profile',
      entityId: target.id,
    })

    res.json({ ok: true, permissions: wanted })
  })
)

/**
 * Create a sub-admin.
 *
 * The admin supplies a name and an address; the new sub-admin chooses their own
 * password through an emailed link. That is deliberate — the requirement is
 * that an admin can never see a sub-admin's password, and the surest way to
 * guarantee that is for the admin never to have set it.
 */
router.post(
  '/sub-admins',
  requireAdmin(),
  validate(
    z.object({
      email: z.string().email('Enter a valid email address'),
      fullName: z.string().trim().min(2, 'Enter their full name').max(120),
      phone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/).optional().or(z.literal('')),
    })
  ),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase()
    const { fullName, phone } = req.body

    if (!capabilities.email) {
      throw badRequest(
        'Email is not configured, so the invitation cannot be sent. Set SMTP_HOST, SMTP_USER and SMTP_PASS.'
      )
    }

    const existing = await one('select id, role from profiles where lower(email) = $1', [email])
    if (existing) throw conflict('That email already has an account on the platform')

    // A long random password nobody will ever use or see. The account is only
    // reachable through the invitation link until they choose their own.
    const placeholder = `mtonyo-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`

    const profile = await transaction(
      async (client) => {
        const authUser = await createAuthUser(
          { email, password: placeholder, fullName, phone },
          client
        )
        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, phone, role)
           values ($1,$2,$3,$4,'sub_admin') returning *`,
          [authUser.id, email, fullName, phone || null]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: req.user.id }
    )

    const hours = env.tokens.inviteHours
    const token = await issueResetToken({
      userId: profile.id,
      email,
      purpose: 'invite',
      ttlMinutes: hours * 60,
      ip: clientIp(req),
    })

    const url = `${env.adminWebUrl}/reset?token=${encodeURIComponent(token)}`
    const tpl = staffInviteEmail({ name: fullName, url, hours, invitedBy: req.user.full_name })
    await sendMail({ to: email, subject: tpl.subject, html: tpl.html })

    await recordStaffAction(req, {
      action: 'SUB_ADMIN_CREATED',
      entityType: 'profile',
      entityId: profile.id,
      summary: `${req.user.full_name || req.user.email} added ${fullName} as a sub-admin`,
      body: `${fullName} · ${email} — invitation sent, valid for ${hours} hours`,
      detail: { email, fullName },
    })

    res.status(201).json({
      subAdmin: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        status: profile.status,
        createdAt: profile.created_at,
        invitePending: true,
      },
      message: `Invitation sent to ${email}. They choose their own password — it is never visible here.`,
    })
  })
)

/** Send the invitation again. Any previous link stops working immediately. */
router.post(
  '/sub-admins/:id/resend-invite',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const p = await one(`select * from profiles where id = $1 and role = 'sub_admin'`, [req.params.id])
    if (!p) throw notFound('Sub-admin not found')
    if (!capabilities.email) throw badRequest('Email is not configured on the server')

    const hours = env.tokens.inviteHours
    const token = await issueResetToken({
      userId: p.id,
      email: p.email,
      purpose: 'invite',
      ttlMinutes: hours * 60,
      ip: clientIp(req),
    })
    const url = `${env.adminWebUrl}/reset?token=${encodeURIComponent(token)}`
    const tpl = staffInviteEmail({ name: p.full_name, url, hours, invitedBy: req.user.full_name })
    await sendMail({ to: p.email, subject: tpl.subject, html: tpl.html })

    await recordStaffAction(req, {
      action: 'SUB_ADMIN_INVITE_RESENT',
      entityType: 'profile',
      entityId: p.id,
      summary: `${req.user.full_name || req.user.email} re-sent the invitation to ${p.full_name}`,
    })
    res.json({ ok: true, message: `Invitation re-sent to ${p.email}` })
  })
)

/** Suspend or restore a sub-admin's access. */
router.post(
  '/sub-admins/:id/status',
  requireAdmin(),
  validate(z.object({ status: z.enum(['active', 'suspended', 'blocked']) })),
  asyncHandler(async (req, res) => {
    const p = await one(`select * from profiles where id = $1 and role = 'sub_admin'`, [req.params.id])
    if (!p) throw notFound('Sub-admin not found')

    const updated = await transaction(
      async (c) => {
        const { rows } = await c.query(
          'update profiles set status = $2, updated_at = now() where id = $1 returning *',
          [p.id, req.body.status]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: req.user.id }
    )

    await recordStaffAction(req, {
      action: 'SUB_ADMIN_STATUS_CHANGED',
      entityType: 'profile',
      entityId: p.id,
      summary: `${req.user.full_name || req.user.email} set ${p.full_name} to ${req.body.status}`,
      detail: { from: p.status, to: req.body.status },
    })
    await notify({
      userId: p.id,
      kind: 'account',
      title:
        req.body.status === 'active'
          ? 'Your sub-admin access has been restored'
          : `Your sub-admin access is now ${req.body.status}`,
      actor: req.user,
      action: 'status',
    })

    res.json({ subAdmin: { id: updated.id, status: updated.status } })
  })
)

/**
 * Remove a sub-admin outright.
 *
 * Their audit entries survive — the actor id goes null but the recorded name,
 * email and action stay readable. A record of who did what must not disappear
 * because the account did.
 */
router.delete(
  '/sub-admins/:id',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const p = await one(`select * from profiles where id = $1 and role = 'sub_admin'`, [req.params.id])
    if (!p) throw notFound('Sub-admin not found')
    if (p.id === req.user.id) throw badRequest('You cannot remove your own account')

    await recordStaffAction(req, {
      action: 'SUB_ADMIN_REMOVED',
      entityType: 'profile',
      entityId: p.id,
      summary: `${req.user.full_name || req.user.email} removed sub-admin ${p.full_name}`,
      body: `${p.full_name} · ${p.email}`,
      detail: { email: p.email, fullName: p.full_name },
    })

    await deleteAuthUser(p.id) // cascades to profiles
    res.json({ ok: true, message: `${p.full_name} no longer has access` })
  })
)

/* ======================================================================
   MY OWN ACCOUNT — email and password, for admin and sub-admin alike
   ----------------------------------------------------------------------
   This is the only place a staff password changes. There is no sign-up and
   no public reset page in the admin app: an admin changes their own details
   from here, and a sub-admin does the same for theirs.
   ====================================================================== */

router.patch(
  '/account/email',
  validate(
    z.object({
      email: z.string().email('Enter a valid email address'),
      currentPassword: z.string().min(1, 'Confirm your current password'),
    })
  ),
  asyncHandler(async (req, res) => {
    const ok = await verifyPassword(req.user.id, req.body.currentPassword)
    if (!ok) throw badRequest('Your current password is not correct')

    const email = req.body.email.trim().toLowerCase()
    if (email === req.user.email) throw badRequest('That is already your email address')

    const profile = await setAuthEmail(req.user.id, email)

    await recordAudit({
      actorId: req.user.id,
      action: 'CHANGED_OWN_EMAIL',
      entityType: 'profile',
      entityId: req.user.id,
      detail: { from: req.user.email, to: email },
      ip: clientIp(req),
    })

    res.json({
      ok: true,
      message: 'Email updated. Use the new address next time you sign in.',
      user: { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role },
    })
  })
)

router.patch(
  '/account/profile',
  validate(
    z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/).optional().or(z.literal('')),
    })
  ),
  asyncHandler(async (req, res) => {
    const profile = await one(
      `update profiles
          set full_name = coalesce($2, full_name),
              phone     = coalesce(nullif($3,''), phone),
              updated_at = now()
        where id = $1 returning *`,
      [req.user.id, req.body.fullName ?? null, req.body.phone ?? null]
    )
    res.json({
      ok: true,
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        phone: profile.phone,
        role: profile.role,
      },
    })
  })
)

export default router
