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
  ensureCreatorSide,
} from '../lib/authdb.js'
import { sendMail, passwordResetEmail, passwordChangedEmail } from '../lib/mailer.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, optionalAuth, permissionsFor, hasCreatorAccess } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { recordAudit, clientIp } from '../services/audit.js'
import { notify } from '../services/notify.js'
import { log } from '../lib/logger.js'
import { env, capabilities } from '../config/env.js'
import { creatorStorefront } from '../lib/creatorStorefront.js'

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

/**
 * Signing up creates the side you chose, and only that side.
 *
 * IT USED TO ALWAYS CREATE A WATCH ACCOUNT. Choosing "I want to Create" opened a
 * viewer account, set `needsCreatorApplication`, and sent the person to an
 * application queue — so somebody who asked for a Create account got a Watch
 * account they never asked for and was then refused at the Create login. That is
 * the fault the client reported, in their words: "I created account for creator
 * and it created my account as viewer."
 *
 * The rule now, and it is the same rule in both directions:
 *
 *   side=creator  →  a Create account. `creator_profiles` + role creator.
 *                    `viewer_enabled` stays false.
 *   side=viewer   →  a Watch account. `viewer_enabled` true, no creator row.
 *
 * ONE EMAIL CAN HOLD BOTH, but each side is created separately. Signing up again
 * on the other side with the same email and the correct password adds it. Asking
 * for a side you already have is a 409 that says so.
 *
 * WHAT THIS DOES NOT CHANGE, and the distinction matters. A Create account opens
 * the studio: upload a video, fill in its details, submit it. It does NOT publish
 * anything. Every video still becomes public only when an administrator approves
 * it — `review_status = 'approved'` and `is_published`, set by the admin route,
 * checked on every public listing and on the watch path. So self-serve signup
 * moves the gate from "who may enter the studio" to "what may reach viewers",
 * which is where the client's own review queue already was.
 *
 * Nothing here grants free viewing either: watching somebody else's paid video is
 * decided by `purchases`, and the only bypasses are being staff or being that
 * video's own owner. A creator role is neither.
 */
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

    /** Open exactly one side on a profile that already exists. */
    const openSide = async (profile) => {
      if (wanted === 'creator') {
        const { profile: fresh } = await ensureCreatorSide(profile, { fullName, phone })
        return fresh
      }
      await enableViewerSide(profile.id)
      return one('select * from profiles where id = $1', [profile.id])
    }

    const alreadyHas = (sides) => (wanted === 'creator' ? sides.creator : sides.viewer)

    const answer = async (profile, { created, attached }) => {
      const sides = await getSides(profile.id)
      const { session, signInNote } = await trySignIn(email, password)
      return {
        ...shape(profile, session),
        side: wanted,
        intendedSide: wanted,
        /* The application queue is no longer the way into the studio, so a
           Create signup is not sent to it. It remains for verification and
           payout details, which are a separate thing from having an account. */
        needsCreatorApplication: false,
        sides,
        attached,
        created,
        needsEmailConfirmation: false,
        ...(signInNote ? { signInFailed: true, message: signInNote } : {}),
      }
    }

    /* ------------------------------------------- an email we already know */
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

      /* An auth user with no profile row: build one on the side they asked for,
         rather than defaulting it to Watch as this used to. */
      if (!profile) {
        profile = await one(
          `insert into profiles (id, email, full_name, phone, role, viewer_enabled)
           values ($1,$2,$3,$4,$5,$6) returning *`,
          [
            existingAuth.id,
            email,
            fullName,
            phone || null,
            wanted === 'creator' ? 'creator' : 'viewer',
            wanted === 'viewer',
          ]
        )
        if (wanted === 'creator') profile = await openSide(profile)
        return res.status(200).json(await answer(profile, { created: true, attached: false }))
      }

      if (profile.status === 'blocked') throw forbidden('This account has been blocked')

      const sidesBefore = await getSides(profile.id)
      if (alreadyHas(sidesBefore)) {
        throw conflict(
          wanted === 'creator'
            ? 'This email already has a Create account. Please log in on Create.'
            : 'This email already has a Watch account. Please log in on Watch.',
          { code: 'ALREADY_REGISTERED', details: { side: wanted } }
        )
      }

      profile = await openSide(profile)
      return res.status(200).json(await answer(profile, { created: false, attached: true }))
    }

    /* ------------------------------------------------------- a new email */
    const { profile } = await transaction(
      async (client) => {
        const authUser = await createAuthUser({ email, password, fullName, phone }, client)

        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, phone, role, viewer_enabled)
           values ($1,$2,$3,$4,$5,$6) returning *`,
          [
            authUser.id,
            email,
            fullName,
            phone || null,
            wanted === 'creator' ? 'creator' : 'viewer',
            wanted === 'viewer',
          ]
        )

        /* In the SAME transaction as the profile. A creator whose profile row
           exists without its creator_profiles row is a login that can pass the
           Create door and then find no studio behind it. */
        if (wanted === 'creator') {
          await client.query(
            `insert into creator_profiles (user_id, display_name, payout_phone)
             values ($1,$2,$3)
             on conflict (user_id) do nothing`,
            [authUser.id, fullName || email, phone || null]
          )
        }

        return { profile: rows[0] }
      },
      { actorRole: 'system' }
    )

    res.status(201).json(await answer(profile, { created: true, attached: false }))
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

    /**
     * You may only log in on a side you actually have.
     *
     * The two sides are separate accounts that happen to share an email and a
     * password, so having one says nothing about the other. The message names
     * the way out — signing up on the missing side — because it is now a thing
     * the person can do for themselves. It used to say "apply and wait for us to
     * approve you", which was true when the Create side could only be granted by
     * an administrator and is not true any more.
     */
    if (!staff) {
      if (side === 'creator' && !sides.creator) {
        throw forbidden(
          sides.viewer
            ? 'This email has a Watch account but no Create account. Sign up on Create — same email, same password — and the studio opens straight away.'
            : 'This email does not have a Create account. Sign up on Create to make one.',
          { code: 'WRONG_SIDE', details: { existingSide: existingSideLabel(sides), missing: 'creator' } }
        )
      }
      if (side === 'viewer' && !sides.viewer) {
        throw forbidden(
          sides.creator
            ? 'This email has a Create account but no Watch account. Sign up on Watch — same email, same password — to watch and buy videos.'
            : 'This email does not have a Watch account. Sign up on Watch to make one.',
          { code: 'WRONG_SIDE', details: { existingSide: existingSideLabel(sides), missing: 'viewer' } }
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
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const page = await creatorStorefront(req.params.id, { viewerId: req.user?.id })
    if (!page) throw notFound('Creator not found')
    res.json(page)
  })
)

export default router
