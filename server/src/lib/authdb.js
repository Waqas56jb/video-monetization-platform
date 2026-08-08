import crypto from 'node:crypto'
import { query, one, transaction } from '../db/pool.js'
import { conflict, badRequest, notFound } from './errors.js'

/**
 * Account records, written straight into the auth schema.
 *
 * Why this exists rather than the hosted admin API: that API needs the
 * service-role key, and the hosted mailer it drives is rate limited to a
 * couple of messages an hour. Both were blocking real sign-ups. We own this
 * database, so we create the record ourselves and send our own email.
 *
 * Sign-in is untouched — it still goes through the auth service with the
 * public key, which reads exactly these columns. Verified end to end against
 * this project: an account created here signs in, refreshes and changes its
 * password like any other.
 *
 * Two details matter and are easy to get wrong:
 *
 *  1. The token columns must be '' and never NULL. The auth service reads them
 *     into plain Go strings, and a NULL there makes every request from that
 *     account fail with "Database error querying schema" — a message that
 *     points nowhere near the real cause. Found the hard way.
 *
 *  2. Passwords are hashed with bcrypt at cost 10, matching what the auth
 *     service writes itself, so the hashes are indistinguishable from ones it
 *     produced. Nothing here ever stores or returns a plaintext password.
 */

const BCRYPT_COST = 10

/** True if this address already has an account. */
export async function emailExists(email) {
  const row = await one('select id from auth.users where lower(email) = lower($1)', [email])
  return Boolean(row)
}

export async function findAuthUserByEmail(email) {
  return one(
    `select id, email, email_confirmed_at, banned_until, created_at, last_sign_in_at
       from auth.users where lower(email) = lower($1)`,
    [email]
  )
}

/**
 * Create an account that is ready to sign in immediately.
 *
 * There is no emailed confirmation step and no one-time code: the client asked
 * for neither, and adding one would strand people behind a mailer we do not
 * control. The address is still verified in the one place it counts — a
 * password can only be reset through a link sent to that mailbox.
 */
export async function createAuthUser({ email, password, fullName, phone }, client = null) {
  const run = async (c) => {
    const exec = (sql, params) => (c ? c.query(sql, params) : query(sql, params))

    const existing = await exec('select id from auth.users where lower(email) = lower($1)', [email])
    if (existing.rows.length) {
      throw conflict('That email is already registered — try signing in instead')
    }

    const { rows } = await exec(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new,
         email_change, email_change_token_current, phone_change,
         phone_change_token, reauthentication_token
       ) values (
         '00000000-0000-0000-0000-000000000000',
         gen_random_uuid(), 'authenticated', 'authenticated',
         lower($1), crypt($2, gen_salt('bf', ${BCRYPT_COST})),
         now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', $3::text, 'phone', $4::text),
         now(), now(),
         '', '', '', '', '', '', '', ''
       )
       returning id, email`,
      [email, password, fullName || null, phone || null]
    )

    const user = rows[0]

    // The auth service expects a matching identity row for the email provider;
    // without it, some flows (notably re-authentication) refuse the account.
    await exec(
      `insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::text, $1::uuid,
               jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
               'email', now(), now(), now())
       on conflict do nothing`,
      [user.id, user.email]
    )

    return user
  }

  return client ? run(client) : transaction((c) => run(c), { actorRole: 'admin' })
}

/** Replace an account's password. Used by reset, invite and self-service change. */
export async function setAuthPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }
  const { rowCount } = await query(
    `update auth.users
        set encrypted_password = crypt($2, gen_salt('bf', ${BCRYPT_COST})),
            updated_at = now(),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            recovery_token = '',
            recovery_sent_at = null
      where id = $1`,
    [userId, newPassword]
  )
  if (!rowCount) throw notFound('That account no longer exists')
  return true
}

/** Confirm a password without creating a session — used before sensitive changes. */
export async function verifyPassword(userId, password) {
  const row = await one(
    `select (encrypted_password = crypt($2, encrypted_password)) as ok
       from auth.users where id = $1`,
    [userId, password]
  )
  return Boolean(row?.ok)
}

/**
 * Change the address on an account. Both the auth record and the profile move
 * together, so there is never a window where they disagree.
 */
export async function setAuthEmail(userId, newEmail) {
  const taken = await one(
    'select id from auth.users where lower(email) = lower($1) and id <> $2',
    [newEmail, userId]
  )
  if (taken) throw conflict('That email is already used by another account')

  return transaction(
    async (c) => {
      await c.query(
        `update auth.users
            set email = lower($2), updated_at = now(),
                email_confirmed_at = now(),
                email_change = '', email_change_token_new = '', email_change_token_current = '',
                raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                     || jsonb_build_object('email', lower($2::text))
          where id = $1`,
        [userId, newEmail]
      )
      await c.query(
        `update auth.identities
            set identity_data = identity_data || jsonb_build_object('email', lower($2::text)),
                updated_at = now()
          where user_id = $1 and provider = 'email'`,
        [userId, newEmail]
      )
      const { rows } = await c.query(
        'update profiles set email = lower($2), updated_at = now() where id = $1 returning *',
        [userId, newEmail]
      )
      return rows[0]
    },
    { actorRole: 'admin', actorId: userId }
  )
}

/** Remove an account outright. Cascades to the profile and everything below it. */
export async function deleteAuthUser(userId) {
  await query('delete from auth.users where id = $1', [userId])
}

/* ------------------------------------------------------- reset / invite tokens */

const TOKEN_BYTES = 32
export const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex')

/**
 * Issue a single-use link token.
 *
 * Only the hash is stored. Someone who reads the whole table still cannot build
 * a working link, which is the entire point of storing it this way.
 */
export async function issueResetToken({ userId, email, purpose = 'reset', ttlMinutes = 60, ip = null }) {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('base64url')

  // Any earlier unused link for this account stops working the moment a new one
  // is asked for, so a forwarded old email cannot be used later.
  await query(
    `update password_resets set used_at = now()
      where user_id = $1 and used_at is null and purpose = $2`,
    [userId, purpose]
  )

  await query(
    `insert into password_resets (user_id, email, token_hash, purpose, expires_at, requested_ip)
     values ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval, $6)`,
    [userId, email, hashToken(raw), purpose, String(ttlMinutes), ip]
  )

  return raw
}

/** Look a token up without spending it, so the page can show a clear error first. */
export async function peekResetToken(raw) {
  if (!raw) return null
  return one(
    `select r.*, p.full_name, p.role, p.status
       from password_resets r join profiles p on p.id = r.user_id
      where r.token_hash = $1`,
    [hashToken(raw)]
  )
}

/**
 * Spend a token and set the new password, in one transaction. Marking it used
 * inside the same transaction is what stops the same link being replayed by two
 * requests arriving together.
 */
export async function consumeResetToken(raw, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }

  return transaction(
    async (c) => {
      const { rows } = await c.query(
        `select r.*, p.full_name, p.email as profile_email
           from password_resets r join profiles p on p.id = r.user_id
          where r.token_hash = $1
          for update of r`,
        [hashToken(raw)]
      )
      const rec = rows[0]
      if (!rec) throw badRequest('This link is not valid. Request a new one.')
      if (rec.used_at) throw badRequest('This link has already been used. Request a new one.')
      if (new Date(rec.expires_at) < new Date()) {
        throw badRequest('This link has expired. Request a new one.')
      }

      await c.query(
        `update auth.users
            set encrypted_password = crypt($2, gen_salt('bf', ${BCRYPT_COST})),
                updated_at = now(),
                email_confirmed_at = coalesce(email_confirmed_at, now()),
                recovery_token = '', recovery_sent_at = null
          where id = $1`,
        [rec.user_id, newPassword]
      )
      await c.query('update password_resets set used_at = now() where id = $1', [rec.id])

      return { userId: rec.user_id, email: rec.profile_email, fullName: rec.full_name, purpose: rec.purpose }
    },
    { actorRole: 'admin' }
  )
}
