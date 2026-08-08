#!/usr/bin/env node
/**
 * Staff account management, from the command line.
 *
 * Nobody can become an admin by signing up — that is deliberate, enforced by
 * the API and again by a trigger in the database. This is the only way the
 * first one comes into existence.
 *
 *   node src/cli/admin.js create <email> [password]   create or promote an admin
 *   node src/cli/admin.js promote <email>             promote an existing account
 *   node src/cli/admin.js password <email> [password] set a password directly
 *   node src/cli/admin.js list                        list admins and sub-admins
 *
 * Sub-admins are not created here. An admin invites them from the admin app and
 * they choose their own password from an emailed link, so that no one — not
 * even the admin who invited them — ever knows it.
 */
import readline from 'node:readline'
import crypto from 'node:crypto'
import { one, query, closePool, transaction } from '../db/pool.js'
import { createAuthUser, findAuthUserByEmail, setAuthPassword } from '../lib/authdb.js'
import { log } from '../lib/logger.js'

const [, , command, emailArg, passwordArg] = process.argv

const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      const onData = (char) => {
        if (['\n', '\r', ''].includes(String(char))) process.stdin.removeListener('data', onData)
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

const normalise = (e) => (e || '').trim().toLowerCase()
const valid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

async function create() {
  const email = normalise(emailArg || (await ask('Admin email: ')))
  if (!valid(email)) throw new Error('That is not a valid email address')

  const existingProfile = await one('select id, role from profiles where lower(email) = $1', [email])
  if (existingProfile) {
    if (existingProfile.role === 'admin') return log.warn(`${email} is already an admin`)
    await transaction(
      (c) => c.query(`update profiles set role = 'admin' where id = $1`, [existingProfile.id]),
      { actorRole: 'admin', actorId: existingProfile.id }
    )
    return log.ok(`${email} promoted to admin`)
  }

  const generated = !passwordArg
  const password =
    passwordArg || (await ask('Password (blank to generate): ', { hidden: true })) || strongPassword()
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  // An auth record may already exist without a profile — heal that rather than
  // failing, otherwise the only way out is editing the database by hand.
  const existingAuth = await findAuthUserByEmail(email)

  const userId = existingAuth
    ? (await setAuthPassword(existingAuth.id, password), existingAuth.id)
    : (await createAuthUser({ email, password, fullName: 'MTONYO+ Admin' })).id

  await transaction(
    (c) =>
      c.query(
        `insert into profiles (id, email, full_name, role)
         values ($1,$2,$3,'admin')
         on conflict (id) do update set role = 'admin', email = excluded.email`,
        [userId, email, 'MTONYO+ Admin']
      ),
    { actorRole: 'admin', actorId: userId }
  )

  log.ok(`admin ready: ${email}`)
  console.log(`\n  email:    ${email}`)
  if (generated) {
    console.log(`  password: ${password}`)
    console.log('\n  Save this now — only its hash is stored, and it cannot be shown again.\n')
  } else {
    console.log('  password: (the one you supplied)\n')
  }
}

async function promote() {
  const email = normalise(emailArg || (await ask('Email to promote: ')))
  const profile = await one('select id, role from profiles where lower(email) = $1', [email])
  if (!profile) throw new Error(`No account found for ${email} — they must register first`)
  if (profile.role === 'admin') return log.warn(`${email} is already an admin`)

  await transaction(
    (c) => c.query(`update profiles set role = 'admin' where id = $1`, [profile.id]),
    { actorRole: 'admin', actorId: profile.id }
  )
  await query(
    `insert into audit_log (actor_id, action, entity_type, entity_id, detail)
     values ($1,'PROMOTED_TO_ADMIN','profile',$1,$2)`,
    [profile.id, JSON.stringify({ email, via: 'cli' })]
  )
  log.ok(`${email} is now an admin`)
}

/** Recovery hatch: set a password when nobody can get in to reset it. */
async function password() {
  const email = normalise(emailArg || (await ask('Account email: ')))
  const profile = await one('select id, role from profiles where lower(email) = $1', [email])
  if (!profile) throw new Error(`No account found for ${email}`)

  const generated = !passwordArg
  const pw = passwordArg || (await ask('New password (blank to generate): ', { hidden: true })) || strongPassword()
  await setAuthPassword(profile.id, pw)

  log.ok(`password set for ${email}`)
  if (generated) console.log(`\n  password: ${pw}\n`)
}

async function list() {
  const { rows } = await query(
    `select email, full_name, role, status, created_at
       from profiles where role in ('admin','sub_admin')
      order by role, created_at`
  )
  if (!rows.length) return log.warn('no staff accounts yet — run: npm run admin:create')
  console.log('\n  staff:')
  for (const r of rows) {
    console.log(
      `   · ${r.email.padEnd(30)} ${r.role.padEnd(10)} ${r.status.padEnd(10)} ` +
        new Date(r.created_at).toISOString().slice(0, 10)
    )
  }
  console.log('')
}

async function main() {
  console.log('\n\x1b[35m  MTONYO+ \x1b[0m staff accounts\n')

  switch (command) {
    case 'create': await create(); break
    case 'promote': await promote(); break
    case 'password': await password(); break
    case 'list': await list(); break
    default:
      console.log(`  usage:
    node src/cli/admin.js create <email> [password]     create or promote an admin
    node src/cli/admin.js promote <email>               promote an existing account
    node src/cli/admin.js password <email> [password]   set a password directly
    node src/cli/admin.js list                          list admins and sub-admins
`)
  }
}

main()
  .catch((err) => {
    log.error(err.message)
    process.exitCode = 1
  })
  .finally(() => closePool().catch(() => {}))
