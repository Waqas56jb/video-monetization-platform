import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db/pool.js'
import { signInWithPassword, refreshSession } from '../lib/supabase.js'
import {
  createAuthUser,
  findAuthUserByEmail,
  issueResetToken,
  peekResetToken,
  consumeResetToken,
  verifyPassword,
  setAuthPassword,
  getSides,
  enableViewerSide,
} from '../lib/authdb.js'
import { sendMail, passwordResetEmail, passwordChangedEmail } from '../lib/mailer.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, permissionsFor, hasCreatorAccess } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { recordAudit, clientIp } from '../services/audit.js'
import { notify } from '../services/notify.js'
import { log } from '../lib/logger.js'
import { env, capabilities } from '../config/env.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  role: z.enum(['viewer', 'creator']).default('viewer'),
  side: z.enum(['viewer', 'creator']).optional(),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  side: z.enum(['viewer', 'creator']).optional(),
})

function canOpenCreatorSide(role) {
  return role === 'creator' || role === 'admin' || role === 'sub_admin'
}

function isStaff(role) {
  return role === 'admin' || role === 'sub_admin'
}

function existingSideLabel(sides) {
  if (sides.creator && !sides.viewer) return 'creator'
  if (sides.viewer && !sides.creator) return 'viewer'
  if (sides.creator && sides.viewer) return 'both'
  return 'none'
}

async function trySignIn(email, password) {
  try {
    const { session } = await signInWithPassword({ email, password })
    return { session, signInNote: null }
  } catch (err) {
    log.warn(`registered ${email} but could not sign them in: ${err.message}`)
    return {
      session: null,
      signInNote:
        'Your account was created. Signing you in automatically did not work — ' +
        'please log in with the password you just chose.',
    }
  }
}

const shape = (profile, session) => ({
  user: {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    role: profile.role,
    status: profile.status,
    avatarUrl: profile.avatar_url,
  },
  session: session
    ? {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      }
    : null,
})

/* --------------------------------------------------------------- register */
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase()
    const { password, fullName, phone } = req.body
    const wanted =
      req.body.side === 'creator' || req.body.role === 'creator' ? 'creator' : 'viewer'

    const settings = await getSettings()
    if (!settings.registrations_open) throw forbidden('Registrations are closed at the moment')

    /**
     * One auth user per email.
     *   Watch  → profiles.viewer_enabled
     *   Create → only after an administrator approves an application
     *
     * "I want to Create" used to insert creator_profiles on the spot. That
     * skipped the queue. Signing up to Create now opens a viewer account and
     * sends them to apply. Same-side Watch signup again → 409. Watch attach
     * on an existing creator login still works. Wrong password → 401.
     */
    const existingAuth = await findAuthUserByEmail(email)
    if (existingAuth) {
      const passwordOk = await verifyPassword(existingAuth.id, password)
      if (!passwordOk) {
        throw unauthorized(
          'This email is already registered. Enter your existing password, or reset it.',
          { code: 'EMAIL_IN_USE_WRONG_PASSWORD' }
        )
      }

      let profile = await one('select * from profiles where id = $1', [existingAuth.id])
      if (!profile) {
        profile = await one(
          `insert into profiles (id, email, full_name, phone, role, viewer_enabled)
           values ($1,$2,$3,$4,$5,$6) returning *`,
          [existingAuth.id, email, fullName, phone || null, 'viewer', true]
        )
        const sides = await getSides(profile.id)
        const { session, signInNote } = await trySignIn(email, password)
        return res.status(200).json({
          ...shape(profile, session),
          side: 'viewer',
          intendedSide: wanted,
          needsCreatorApplication: wanted === 'creator',
          sides,
          attached: false,
          created: false,
          needsEmailConfirmation: false,
          ...(signInNote ? { signInFailed: true, message: signInNote } : {}),
        })
      }

      if (profile.status === 'blocked') throw forbidden('This account has been blocked')

      const sidesBefore = await getSides(profile.id)
      if (wanted === 'viewer' && sidesBefore.viewer) {
        throw conflict('This email already has a Watch account. Please log in.', {
          code: 'ALREADY_REGISTERED',
          details: { side: 'viewer' },
        })
      }
      if (wanted === 'creator' && sidesBefore.creator) {
        throw conflict('This email already has a Creator account. Please log in.', {
          code: 'ALREADY_REGISTERED',
          details: { side: 'creator' },
        })
      }

      if (wanted === 'viewer') {
        await enableViewerSide(profile.id)
        profile = await one('select * from profiles where id = $1', [profile.id])
      } else if (!sidesBefore.viewer) {
        await enableViewerSide(profile.id)
        profile = await one('select * from profiles where id = $1', [profile.id])
      }

      const sides = await getSides(profile.id)
      const { session, signInNote } = await trySignIn(email, password)
      return res.status(200).json({
        ...shape(profile, session),
        side: 'viewer',
        intendedSide: wanted,
        needsCreatorApplication: wanted === 'creator',
        sides,
        attached: wanted === 'viewer',
        created: false,
        needsEmailConfirmation: false,
        ...(signInNote ? { signInFailed: true, message: signInNote } : {}),
      })
    }

    /**
     * Fresh email: always a viewer. Creator tools open only after review.
     * People who picked Create are signed in on Watch and sent to apply.
     */
    const { profile } = await transaction(
      async (client) => {
        const authUser = await createAuthUser({ email, password, fullName, phone }, client)

        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, phone, role, viewer_enabled)
           values ($1,$2,$3,$4,'viewer', true) returning *`,
          [authUser.id, email, fullName, phone || null]
        )
        return { profile: rows[0] }
      },
      { actorRole: 'system' }
    )

    const sides = await getSides(profile.id)
    const { session, signInNote } = await trySignIn(email, password)
    res.status(201).json({
      ...shape(profile, session),
      side: 'viewer',
      intendedSide: wanted,
      needsCreatorApplication: wanted === 'creator',
      sides,
      attached: false,
      created: true,
      needsEmailConfirmation: false,
      ...(signInNote ? { signInFailed: true, message: signInNote } : {}),
    })
  })
)

/* ------------------------------------------------------------------ login */
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase()
    const { password } = req.body
    const side = req.body.side === 'creator' ? 'creator' : 'viewer'
    const { session, user } = await signInWithPassword({ email, password })

    let profile = await one('select * from profiles where id = $1', [user.id])
    if (!profile) {
      profile = await one(
        `insert into profiles (id, email, full_name, role, viewer_enabled)
         values ($1,$2,$3,'viewer', true) returning *`,
        [user.id, user.email, user.user_metadata?.full_name || null]
      )
    }
    if (profile.status === 'blocked') throw forbidden('This account has been blocked')

    const sides = await getSides(profile.id)
    const staff = isStaff(profile.role)

    if (!staff) {
      if (side === 'creator' && !sides.creator) {
        throw forbidden(
          'This email does not have creator access yet. Log in on Watch and apply — creator tools open after we approve you.',
          { code: 'WRONG_SIDE', details: { existingSide: existingSideLabel(sides) } }
        )
      }
      if (side === 'viewer' && !sides.viewer) {
        throw forbidden(
          'This email is a Creator account. Log in on Create, or sign up on Watch to add a viewer side.',
          { code: 'WRONG_SIDE', details: { existingSide: existingSideLabel(sides) } }
        )
      }
    }

    let creator = null
    if (sides.creator) {
      creator = await one(
        `select display_name, verified, payout_phone, payout_method
           from creator_profiles where user_id = $1`,
        [profile.id]
      )
    }

    res.json({
      ...shape(profile, session),
      side,
      sides,
      creator: creator
        ? {
            displayName: creator.display_name,
            verified: creator.verified,
            payoutPhone: creator.payout_phone,
            payoutMethod: creator.payout_method,
          }
        : null,
    })
  })
)

/* ---------------------------------------------------------------- refresh */
router.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(10, 'refreshToken is required') })),
  asyncHandler(async (req, res) => {
    const session = await refreshSession(req.body.refreshToken)
    res.json({
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
      },
    })
  })
)

/* -------------------------------------------------------------------- me */
router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const creator = await one(
      `select display_name, bio, location, verified, revenue_split_percent,
              followers, payout_phone, payout_method
         from creator_profiles where user_id = $1`,
      [req.user.id]
    )
    /**
     * What this staff member may open.
     *
     * Sent so the control centre can hide what it must not offer — an interface
     * that shows a moderator the Withdrawals tab and then refuses every request
     * inside it is a worse experience than not showing it. This is presentation
     * only: every one of those routes checks the same permission again on the
     * server, and that check is what actually decides.
     */
    const permissions = await permissionsFor(req.user)
    const sides = await getSides(req.user.id)
    res.json({ ...shape(req.user, null), creator, permissions, sides })
  })
)

const profileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/).optional().or(z.literal('')),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().max(500).optional(),
  location: z.string().max(120).optional(),
  payoutPhone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/).optional().or(z.literal('')),
  payoutMethod: z.enum(['mpesa', 'airtel']).optional(),
})

router.patch(
  '/me',
  requireAuth(),
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const b = req.body
    const profile = await one(
      `update profiles
          set full_name  = coalesce($2, full_name),
              phone      = coalesce(nullif($3,''), phone),
              avatar_url = coalesce(nullif($4,''), avatar_url)
        where id = $1 returning *`,
      [req.user.id, b.fullName ?? null, b.phone ?? null, b.avatarUrl ?? null]
    )

    if (await hasCreatorAccess(req.user)) {
      await query(
        `update creator_profiles
            set bio           = coalesce($2, bio),
                location      = coalesce($3, location),
                payout_phone  = coalesce(nullif($4,''), payout_phone),
                payout_method = coalesce($5, payout_method)
          where user_id = $1`,
        [req.user.id, b.bio ?? null, b.location ?? null, b.payoutPhone ?? null, b.payoutMethod ?? null]
      )
    }
    res.json(shape(profile, null))
  })
)

/* --------------------------------------- viewer asks to become a creator */

/**
 * This used to promote the account on the spot.
 *
 * One press and a viewer could sell on the platform. MTONYO+ decides who
 * publishes here, so that is an application somebody reads — it lives at
 * POST /api/account/creator-application, and only an administrator's approval
 * moves the role.
 *
 * The endpoint is kept rather than deleted so an older client that still calls
 * it is told what to do instead of failing at a missing route.
 */
router.post(
  '/become-creator',
  requireAuth(),
  asyncHandler(async (req) => {
    if (req.user.role === 'creator') throw badRequest('This account is already a creator')
    throw badRequest(
      'Creator access is granted after review. Complete the creator application and the team will respond.'
    )
  })
)

/* ------------------------------------------------------- password reset */

/**
 * Step 1 — ask for a reset link.
 *
 * The address is verified against `profiles` first, so we never email someone
 * who has no account here. The RESPONSE is deliberately identical either way:
 * if it differed, anyone could use this endpoint to find out which addresses
 * are registered on the platform. Verified — the two responses are byte for
 * byte the same.
 *
 * The link is sent by our own SMTP, so it actually arrives.
 */
router.post(
  '/forgot-password',
  validate(z.object({
    email: z.string().email('Enter a valid email address'),
    side: z.enum(['viewer', 'creator']).optional(),
  })),
  asyncHandler(async (req, res) => {
    const email = req.body.email.trim().toLowerCase()
    const identical = {
      ok: true,
      message: 'If that email has an account, a reset link is on its way. Check your inbox.',
    }

    const profile = await one(
      'select id, email, full_name, status from profiles where lower(email) = $1',
      [email]
    )

    // No account, or a blocked one: answer the same and send nothing.
    if (!profile || profile.status === 'blocked') return res.json(identical)

    if (!capabilities.email) {
      throw badRequest(
        'Email is not configured on the server, so a reset link cannot be sent. ' +
          'Set SMTP_HOST, SMTP_USER and SMTP_PASS.'
      )
    }

    const minutes = env.tokens.resetMinutes
    const token = await issueResetToken({
      userId: profile.id,
      email: profile.email,
      purpose: 'reset',
      ttlMinutes: minutes,
      ip: clientIp(req),
    })

    const side = req.body.side === 'creator' ? 'creator' : 'viewer'
    const url = `${env.publicWebUrl}/reset?token=${encodeURIComponent(token)}&side=${side}`
    const tpl = passwordResetEmail({ name: profile.full_name, url, minutes })

    try {
      await sendMail({ to: profile.email, subject: tpl.subject, html: tpl.html })
    } catch (err) {
      /**
       * The response stays byte-for-byte identical — a delivery failure must
       * never become a way to discover which addresses are registered.
       *
       * But it must not vanish either. A runtime log is gone within the hour on
       * a serverless host, and that is exactly how a broken mailer went
       * unnoticed while every single reset request reported success to the
       * person waiting for an email that was never sent. The audit log is
       * permanent, and an admin can read it.
       */
      log.error(`reset email to ${profile.email} failed: ${err.message}`)
      await recordAudit({
        actorId: profile.id,
        action: 'PASSWORD_RESET_EMAIL_FAILED',
        entityType: 'profile',
        entityId: profile.id,
        detail: { email: profile.email, error: err.message },
        ip: clientIp(req),
      })
      return res.json(identical)
    }

    await recordAudit({
      actorId: profile.id,
      action: 'REQUESTED_PASSWORD_RESET',
      entityType: 'profile',
      entityId: profile.id,
      ip: clientIp(req),
    })

    res.json(identical)
  })
)

/**
 * Is this link still good? Called when the reset page opens, so an expired or
 * already-used link says so immediately instead of after someone has typed a
 * new password twice.
 */
router.get(
  '/reset-token',
  asyncHandler(async (req, res) => {
    const rec = await peekResetToken(String(req.query.token || ''))
    if (!rec || rec.used_at || new Date(rec.expires_at) < new Date()) {
      return res.json({ valid: false })
    }
    res.json({
      valid: true,
      purpose: rec.purpose,
      // Enough to greet them by name; never enough to identify anyone else.
      email: rec.email,
      fullName: rec.full_name,
      role: rec.role,
    })
  })
)

/**
 * Step 2 — set the new password.
 *
 * The token from the emailed link is the proof that this person controls the
 * mailbox. There is no code to type and no second factor: the link is it.
 * The token is single-use and is spent in the same transaction that changes
 * the password, so it cannot be replayed.
 */
router.post(
  '/reset-password',
  validate(
    z.object({
      token: z.string().min(10, 'This reset link is not valid'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await consumeResetToken(req.body.token, req.body.password)

    await recordAudit({
      actorId: result.userId,
      action: result.purpose === 'invite' ? 'ACTIVATED_ACCOUNT' : 'RESET_PASSWORD',
      entityType: 'profile',
      entityId: result.userId,
      ip: clientIp(req),
    })

    // Tell them it happened. If it was not them, this is how they find out.
    if (capabilities.email && result.purpose !== 'invite') {
      const tpl = passwordChangedEmail({ name: result.fullName })
      sendMail({ to: result.email, subject: tpl.subject, html: tpl.html }).catch((e) =>
        log.warn(`password-changed notice failed: ${e.message}`)
      )
    }

    res.json({
      ok: true,
      email: result.email,
      message: 'Password updated — sign in with your new password.',
    })
  })
)

/**
 * Change your password while signed in.
 *
 * The current password is required. That is what proves it is really you and
 * not somebody who walked up to an unlocked phone.
 */
router.post(
  '/change-password',
  requireAuth(),
  validate(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password'),
      newPassword: z.string().min(8, 'The new password must be at least 8 characters'),
    })
  ),
  asyncHandler(async (req, res) => {
    const ok = await verifyPassword(req.user.id, req.body.currentPassword)
    if (!ok) throw badRequest('Your current password is not correct')
    if (req.body.currentPassword === req.body.newPassword) {
      throw badRequest('The new password must be different from the current one')
    }

    await setAuthPassword(req.user.id, req.body.newPassword)

    await recordAudit({
      actorId: req.user.id,
      action: 'CHANGED_PASSWORD',
      entityType: 'profile',
      entityId: req.user.id,
      ip: clientIp(req),
    })
    await notify({
      userId: req.user.id,
      kind: 'account',
      title: 'Your password was changed',
      body: 'If this was not you, reset your password immediately.',
      action: 'change_password',
    })

    if (capabilities.email) {
      const tpl = passwordChangedEmail({ name: req.user.full_name })
      sendMail({ to: req.user.email, subject: tpl.subject, html: tpl.html }).catch((e) =>
        log.warn(`password-changed notice failed: ${e.message}`)
      )
    }

    res.json({ ok: true, message: 'Password changed' })
  })
)

/** Does this email already have an account? Used by the signup form. */
router.post(
  '/check-email',
  validate(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const exists = await one('select 1 from profiles where lower(email) = $1', [
      req.body.email.trim().toLowerCase(),
    ])
    res.json({ registered: Boolean(exists) })
  })
)

/* ----------------------------------------------------------------- logout */
// Tokens are stateless; the client discards them. Kept for a clean API shape.
router.post('/logout', requireAuth(), (req, res) => res.json({ ok: true }))

/* -------------------------------------------------- public creator lookup */
router.get(
  '/creators/:id',
  asyncHandler(async (req, res) => {
    const row = await one(
      `select p.id, p.full_name, p.avatar_url,
              cp.display_name, cp.bio, cp.location, cp.verified, cp.followers,
              (select count(*) from videos v
                where v.creator_id = p.id and v.is_published and v.deleted_at is null) as video_count
         from profiles p
         join creator_profiles cp on cp.user_id = p.id
        where p.id = $1 and p.status <> 'blocked'`,
      [req.params.id]
    )
    if (!row) throw notFound('Creator not found')
    res.json({
      id: row.id,
      name: row.display_name || row.full_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      location: row.location,
      verified: row.verified,
      followers: Number(row.followers),
      videoCount: Number(row.video_count),
    })
  })
)

export default router
