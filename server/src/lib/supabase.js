import { createClient } from '@supabase/supabase-js'
import { env, capabilities } from '../config/env.js'
import { serviceUnavailable, unauthorized, conflict, badRequest } from './errors.js'

/**
 * Two clients, deliberately.
 *
 * `anonClient` does all normal authentication — sign up, sign in, verify a
 * token, refresh, request a password reset, set a new password. Verified
 * against this project: the anon key is enough for every one of those, so the
 * API does not depend on the service-role key to let people in.
 *
 * `adminClient` is only for operations that act ON another account — creating
 * the first admin, or removing a user. It is optional; the API runs without it
 * and only those few endpoints are unavailable.
 */

let anon = null
let admin = null

export function anonClient() {
  if (!env.supabase.url || !env.supabase.anonKey) {
    throw serviceUnavailable('Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)')
  }
  if (!anon) {
    anon = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return anon
}

export function supabaseAdmin() {
  if (!capabilities.serviceRole) {
    throw serviceUnavailable(
      'This action needs the Supabase service-role key. Add SUPABASE_SERVICE_ROLE_KEY ' +
        'to server/.env (Supabase → Project Settings → API).'
    )
  }
  if (!admin) {
    admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return admin
}

/** A client that acts as the signed-in user, for self-service actions. */
export function userClient(accessToken) {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/* ------------------------------------------------------------------ auth */

/** Resolve a bearer token to a Supabase user, or throw 401. */
export async function userFromToken(token) {
  const { data, error } = await anonClient().auth.getUser(token)
  if (error || !data?.user) throw unauthorized('Your session has expired — please sign in again')
  return data.user
}

/**
 * Register with email and password.
 *
 * Returns `{ user, session }`. When the project still requires email
 * confirmation, Supabase withholds the session — we surface that clearly
 * instead of pretending the account is ready.
 */
export async function signUp({ email, password, fullName, phone }) {
  const { data, error } = await anonClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || null, phone: phone || null } },
  })

  if (error) {
    if (/already registered|already been registered|User already/i.test(error.message)) {
      throw conflict('That email is already registered — try signing in instead')
    }
    if (/rate limit/i.test(error.message)) {
      throw serviceUnavailable(
        'Supabase’s built-in email is rate limited. Turn off "Confirm email" in ' +
          'Authentication → Providers → Email, or configure a custom SMTP provider.'
      )
    }
    if (/invalid/i.test(error.message) && /email/i.test(error.message)) {
      throw badRequest('Supabase rejected that email address — use a real, deliverable address')
    }
    throw badRequest(error.message)
  }

  if (!data.user) throw badRequest('Could not create the account')

  return {
    user: data.user,
    session: data.session, // null while "Confirm email" is on
    needsEmailConfirmation: !data.session,
  }
}

/** Exchange email + password for a session. */
export async function signInWithPassword({ email, password }) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password })
  if (error || !data?.session) {
    if (/email not confirmed/i.test(error?.message || '')) {
      throw unauthorized('Please confirm your email address before signing in')
    }
    throw unauthorized('Email or password is incorrect')
  }
  return { session: data.session, user: data.user }
}

export async function refreshSession(refreshToken) {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data?.session) throw unauthorized('Session could not be refreshed')
  return data.session
}

/**
 * Send a password-reset link.
 *
 * The caller checks the address exists in `profiles` first, so we never email
 * a stranger; but the API still answers the same either way so the endpoint
 * cannot be used to discover which addresses are registered.
 */
export async function sendPasswordReset(email, redirectTo) {
  const { error } = await anonClient().auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    if (/rate limit/i.test(error.message)) {
      throw serviceUnavailable(
        'Email sending is rate limited. Configure a custom SMTP provider in ' +
          'Supabase → Project Settings → Authentication → SMTP Settings.'
      )
    }
    throw badRequest(error.message)
  }
  return true
}

/**
 * Set a new password using the recovery session that came from the emailed
 * link. The token proves the person controls the mailbox, so this is the only
 * place a password can be changed without knowing the old one.
 */
export async function setPasswordWithRecoveryToken({ accessToken, refreshToken, newPassword }) {
  const client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: sessErr } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (sessErr) throw unauthorized('This reset link has expired — request a new one')

  const { data, error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw badRequest(error.message)
  return data.user
}

/**
 * Change your own password while signed in.
 *
 * Re-authenticating with the current password is what proves it is really you
 * and not someone who walked up to an unlocked phone.
 */
export async function changePassword({ email, currentPassword, newPassword }) {
  const { session } = await signInWithPassword({ email, password: currentPassword })

  const client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  const { error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw badRequest(error.message)
  return true
}

/* ------------------------------------------ admin-only (service role key) */

export async function createUserAsAdmin({ email, password, fullName, phone }) {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null, phone: phone || null },
  })
  if (error) {
    if (/already/i.test(error.message)) throw conflict('That email is already registered')
    throw badRequest(error.message)
  }
  return data.user
}

export async function deleteAuthUser(userId) {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
}

export async function findAuthUserByEmail(email) {
  const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(error.message)
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null
}
