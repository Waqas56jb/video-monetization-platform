#!/usr/bin/env node
/**
 * Admin account management.
 *
 * No one can become an admin by signing up — that is deliberate, and enforced
 * by the API. This is the only way in, and it needs the service-role key,
 * which lives on the server and nowhere else.
 *
 *   node src/cli/admin.js create <email> [password]
 *   node src/cli/admin.js promote <email>
 *   node src/cli/admin.js list
 */
import readline from 'node:readline'
import crypto from 'node:crypto'
import { one, query, closePool } from '../db/pool.js'
import { createUserAsAdmin, findAuthUserByEmail } from '../lib/supabase.js'
import { capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

const [, , command, emailArg, passwordArg] = process.argv

const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      const onData = (char) => {
        if (['\n', '\r', ''].includes(String(char))) process.stdin.removeListener('data', onData)
        else process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length))
      }
      process.stdin.on('data', onData)
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })

const strongPassword = () =>
  `Mt${crypto.randomBytes(9).toString('base64url')}!${crypto.randomInt(10, 99)}`

async function create() {
  const email = (emailArg || (await ask('Admin email: '))).trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not a valid email address')

  const existingProfile = await one('select id, role from profiles where lower(email) = $1', [email])
  if (existingProfile) {
    if (existingProfile.role === 'admin') {
      log.warn(`${email} is already an admin`)
      return
    }
    await query(`update profiles set role = 'admin' where id = $1`, [existingProfile.id])
    log.ok(`${email} promoted to admin`)
    return
  }

  const password = passwordArg || (await ask('Password (blank to generate): ', { hidden: true })) || strongPassword()
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const existingAuth = await findAuthUserByEmail(email)
  const authUser = existingAuth || (await createUserAsAdmin({ email, password, fullName: 'MTONYO+ Admin' }))

  await query(
    `insert into profiles (id, email, full_name, role)
     values ($1,$2,$3,'admin')
     on conflict (id) do update set role = 'admin'`,
    [authUser.id, email, 'MTONYO+ Admin']
  )

  log.ok(`admin created: ${email}`)
  if (!passwordArg) {
    console.log(`\n  email:    ${email}`)
    console.log(`  password: ${password}`)
    console.log('\n  Save this now — it is not stored anywhere and cannot be shown again.\n')
  }
}

async function promote() {
  const email = (emailArg || (await ask('Email to promote: '))).trim().toLowerCase()
  const profile = await one('select id, role from profiles where lower(email) = $1', [email])
  if (!profile) throw new Error(`No account found for ${email} — they must register first`)
  if (profile.role === 'admin') return log.warn(`${email} is already an admin`)

  await query(`update profiles set role = 'admin' where id = $1`, [profile.id])
  await query(
    `insert into audit_log (actor_id, action, entity_type, entity_id, detail)
     values ($1,'PROMOTED_TO_ADMIN','profile',$1,$2)`,
    [profile.id, JSON.stringify({ email, via: 'cli' })]
  )
  log.ok(`${email} is now an admin`)
}

async function list() {
  const rows = await query(
    `select email, full_name, status, created_at from profiles where role = 'admin' order by created_at`
  )
  if (!rows.rowCount) return log.warn('no admin accounts yet — run: npm run admin:create')
  console.log('\n  admins:')
  rows.rows.forEach((r) =>
    console.log(`   · ${r.email.padEnd(30)} ${r.status.padEnd(10)} ${new Date(r.created_at).toISOString().slice(0, 10)}`)
  )
  console.log('')
}

async function main() {
  console.log('\n\x1b[35m  MTONYO+ \x1b[0m admin accounts\n')

  if ((command === 'create' || command === undefined) && !capabilities.supabaseAuth) {
    throw new Error(
      'Creating an admin needs SUPABASE_SERVICE_ROLE_KEY in server/.env ' +
        '(Supabase → Project Settings → API). Use "promote" instead if the account already exists.'
    )
  }

  switch (command) {
    case 'create': await create(); break
    case 'promote': await promote(); break
    case 'list': await list(); break
    default:
      console.log(`  usage:
    node src/cli/admin.js create <email> [password]   create (or promote) an admin
    node src/cli/admin.js promote <email>             promote an existing account
    node src/cli/admin.js list                        list admins
`)
  }
}

main()
  .catch((err) => {
    log.error(err.message)
    process.exitCode = 1
  })
  .finally(() => closePool().catch(() => {}))
