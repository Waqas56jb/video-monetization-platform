import { createClient } from '@supabase/supabase-js'
import { env, capabilities } from '../config/env.js'
import { serviceUnavailable, unauthorized } from './errors.js'

let admin = null

/**
 * Server-side Supabase client using the service role key.
 *
 * This bypasses RLS by design — the API is the trusted layer and applies its
 * own authorisation. It must never be exposed to the browser.
 */
export function supabaseAdmin() {
  if (!capabilities.supabaseAuth) {
    throw serviceUnavailable(
      'Supabase auth is not configured. Set SUPABASE_SERVICE_ROLE_KEY in server/.env ' +
        '(Supabase → Project Settings → API).'
    )
  }
  if (!admin) {
    admin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return admin
}

/** Resolve a bearer token to a Supabase user, or throw 401. */
export async function userFromToken(token) {
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data?.user) throw unauthorized('Your session has expired — please sign in again')
  return data.user
}

/** Create an auth user. Returns the Supabase user. */
export async function createAuthUser({ email, password, fullName, phone }) {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    phone: phone || undefined,
    email_confirm: true, // V1 has no mail provider wired up yet
    user_metadata: { full_name: fullName || null, phone: phone || null },
  })
  if (error) {
    const msg = /already registered|already been registered/i.test(error.message)
      ? 'That email is already registered'
      : error.message
    throw Object.assign(new Error(msg), { status: /already/i.test(msg) ? 409 : 400, expected: true })
  }
  return data.user
}

/** Exchange email + password for a session (access + refresh token). */
export async function signInWithPassword({ email, password }) {
  const client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session) throw unauthorized('Email or password is incorrect')
  return { session: data.session, user: data.user }
}

/** Refresh an expired access token. */
export async function refreshSession(refreshToken) {
  const client = createClient(env.supabase.url, env.supabase.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data?.session) throw unauthorized('Session could not be refreshed')
  return data.session
}

export async function deleteAuthUser(userId) {
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
}
