import { Router } from 'express'
import { z } from 'zod'
import { one, query, transaction } from '../db/pool.js'
import { createAuthUser, signInWithPassword, refreshSession, deleteAuthUser } from '../lib/supabase.js'
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { recordAudit, clientIp } from '../services/audit.js'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  role: z.enum(['viewer', 'creator']).default('viewer'),
})

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

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
    const { email, password, fullName, phone, role } = req.body
    const settings = await getSettings()
    if (!settings.registrations_open) throw forbidden('Registrations are closed at the moment')

    const authUser = await createAuthUser({ email, password, fullName, phone })

    try {
      const profile = await transaction(async (client) => {
        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, phone, role)
           values ($1,$2,$3,$4,$5) returning *`,
          [authUser.id, email, fullName, phone || null, role]
        )
        if (role === 'creator') {
          await client.query(
            `insert into creator_profiles (user_id, display_name, payout_phone)
             values ($1,$2,$3) on conflict (user_id) do nothing`,
            [authUser.id, fullName, phone || null]
          )
        }
        return rows[0]
      })

      const { session } = await signInWithPassword({ email, password })
      res.status(201).json(shape(profile, session))
    } catch (err) {
      // Don't leave an auth user behind with no profile row.
      await deleteAuthUser(authUser.id).catch(() => {})
      throw err
    }
  })
)

/* ------------------------------------------------------------------ login */
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body
    const { session, user } = await signInWithPassword({ email, password })

    let profile = await one('select * from profiles where id = $1', [user.id])
    if (!profile) {
      // Auth user created outside this API (e.g. straight in Supabase) — heal it.
      profile = await one(
        `insert into profiles (id, email, full_name, role)
         values ($1,$2,$3,'viewer') returning *`,
        [user.id, user.email, user.user_metadata?.full_name || null]
      )
    }
    if (profile.status === 'blocked') throw forbidden('This account has been blocked')

    res.json(shape(profile, session))
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
    res.json({ ...shape(req.user, null), creator })
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

    if (req.user.role === 'creator') {
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

/* ------------------------------------------- viewer upgrades to a creator */
router.post(
  '/become-creator',
  requireAuth(),
  asyncHandler(async (req, res) => {
    if (req.user.role === 'admin') throw badRequest('Admins already have full access')
    if (req.user.role === 'creator') return res.json(shape(req.user, null))

    const profile = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update profiles set role = 'creator' where id = $1 returning *`,
          [req.user.id]
        )
        await client.query(
          `insert into creator_profiles (user_id, display_name, payout_phone)
           values ($1,$2,$3) on conflict (user_id) do nothing`,
          [req.user.id, req.user.full_name || req.user.email, req.user.phone]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: req.user.id }
    )

    await recordAudit({
      actorId: req.user.id,
      action: 'BECAME_CREATOR',
      entityType: 'profile',
      entityId: req.user.id,
      ip: clientIp(req),
    })
    res.json(shape(profile, null))
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
