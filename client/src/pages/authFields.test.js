/**
 * Auth boxes must be uncontrolled.
 *
 * Client, 2026-11-16: "email aur password bharne ke baad bhi red box 'Enter
 * your email and password' aata hai". Reproduced in Chromium and WebKit: when
 * autofill / Keychain / a password manager fills a box without firing
 * onChange, a controlled input (`value={state}`) is reset to React's empty
 * copy on the very next re-render — typing in the other box or tapping the eye
 * is enough — and the form posts nothing. With `defaultValue` the browser owns
 * the text and submit reads it from the form, so nothing can wipe it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const FILES = {
  'client Login': read('./Login.jsx'),
  Signup: read('./Signup.jsx'),
  ForgotPassword: read('./ForgotPassword.jsx'),
  Reset: read('./Reset.jsx'),
  'admin Login': read('../../../admin/src/pages/Login.jsx'),
}

for (const [name, src] of Object.entries(FILES)) {
  test(`${name}: no controlled auth boxes, values read from the form`, () => {
    assert.doesNotMatch(src, /\svalue=\{/, 'a controlled box comes back — autofill gets wiped on re-render')
    assert.match(src, /new FormData\(e\.currentTarget\)/)
  })
}
