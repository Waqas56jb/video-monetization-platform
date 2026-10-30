/**
 * Creator access comes only from an approved application (client, 2026-10-30):
 * VIEWER → APPLY → APPLICATION FORM → SUPER ADMIN REVIEWS → APPROVE/REJECT →
 * ONLY APPROVED CREATOR GETS STUDIO. No self-service path may remain.
 * Source-text, like the other page tests.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(src, p), 'utf8').replace(/\r\n/g, '\n')
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f)) out.push(p)
  }
  return out
}

test('login and signup have no Watch / Create toggle and never offer a self-made creator account', () => {
  for (const page of ['pages/Login.jsx', 'pages/Signup.jsx']) {
    const s = read(page)
    assert.doesNotMatch(s, /RoleToggle/, `${page}: no side toggle`)
    assert.doesNotMatch(s, /I want to Create/, `${page}: no "I want to Create"`)
    assert.doesNotMatch(s, /Log in as Creator/, page)
  }
  assert.doesNotMatch(read('pages/Login.jsx'), /account for this email/, 'no "create a creator account for this email"')
})

test('nothing in the app offers to add a creator account — only the application', () => {
  for (const file of walk(src)) {
    const s = readFileSync(file, 'utf8')
    assert.doesNotMatch(s, /Add a Creator account|Sign up on Create|creator account for this email/, file)
  }
  const sidebar = read('components/dashboard/Sidebar.jsx')
  assert.match(sidebar, /missingSide === 'creator' \? dashboardPath\('become'\)/)
  assert.match(sidebar, /Apply to become a creator/)
})

test('wanting to publish leads to the application: signed in → the form; new → account, then the form', () => {
  const s = read('pages/Signup.jsx')
  assert.match(s, /if \(applying && !isCreator\) \{\n\s+navigate\(dashboardPath\('become'\)/)
  assert.match(s, /result\.needsCreatorApplication \? dashboardPath\('become'\)/)
  assert.match(read('lib/accountSide.js'), /if \(panel === 'apply' \|\| panel === 'become'\) return '\/dashboard\?tab=become'/)
})

test('a login sends no side unless one is asked for; the studio is reached only with the creator side', () => {
  const ctx = read('context/AuthContext.jsx')
  assert.match(ctx, /\.\.\.\(side === 'creator' \|\| side === 'viewer' \? \{ side \} : \{\}\)/)
  const login = read('pages/Login.jsx')
  assert.match(login, /signIn\(\{ email, password \}\)/)
  assert.match(login, /preferred === 'creator' && result\.sides\?\.creator/)
})
