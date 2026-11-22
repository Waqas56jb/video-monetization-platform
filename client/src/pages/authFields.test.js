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
    assert.match(src, /new FormData\((e\.currentTarget|formEl)\)/)
  })
}

test('Login: one more read after a frame before any "Enter your…" error (Chrome releases autofill on the tap)', () => {
  const src = FILES['client Login']
  const wait = src.indexOf('setTimeout(r, i === 0 ? 30 : 80)')
  const err = src.indexOf("'Enter your email and password'")
  assert.ok(wait > 0 && err > wait, 'the re-read happens before the error')
  assert.match(src, /for \(let i = 0; worthWaiting && i < 12 && \(!email \|\| !password\); i\+\+\)/, 'keeps reading for ~1s, not one frame')
  assert.match(src, /const worthWaiting = Boolean\(email \|\| password\) \|\| browserHolds\(\)/, 'an empty form is answered at once')
  assert.match(src, /:-webkit-autofill/, 'a browser-held password gets an honest message, not "Enter your password"')
  assert.match(src, /setBusy\(true\) \/\/ also covers the one-frame wait/)
  assert.match(FILES.Signup, /requestAnimationFrame/)
})

test('Remember me is wired: unchecked keeps the session for this browser session only', () => {
  const login = FILES['client Login']
  assert.match(login, /name="remember" defaultChecked/)
  assert.match(login, /signIn\(\{ email, password, remember \}\)/)
  const api = readFileSync(fileURLToPath(new URL('../lib/api.js', import.meta.url)), 'utf8')
  assert.match(api, /export function saveSession\(session, \{ remember \} = \{\}\)/)
  assert.match(api, /window\.sessionStorage\.setItem/)
  const auth = readFileSync(fileURLToPath(new URL('../context/AuthContext.jsx', import.meta.url)), 'utf8')
  assert.match(auth, /saveSession\(data\.session, \{ remember: remember !== false \}\)/)
})

/**
 * An EMPTY password box must not look filled.
 *
 * The client's iPad (2026-11-22): Safari filled the email from the contact
 * card, the password box stayed empty and showed the placeholder "••••••••" —
 * eight grey dots, indistinguishable at a glance from a saved password. Every
 * "Enter your password" after that read as the login being broken.
 */
test('no password box uses dots as its placeholder, anywhere', () => {
  const files = [
    'pages/Login.jsx', 'pages/Signup.jsx',
    'components/dashboard/tabs/ProfileTab.jsx', 'components/dashboard/tabs/SettingsTab.jsx',
    '../../admin/src/pages/Login.jsx', '../../admin/src/components/tabs/SettingsTab.jsx',
  ]
  for (const f of files) {
    const src = readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8')
    assert.doesNotMatch(src, /placeholder="[•·*]+"/, `${f}: a dotted placeholder looks like a filled password`)
  }
})

test('the box a failed attempt found empty is marked and focused (login + signup)', () => {
  for (const f of ['Login.jsx', 'Signup.jsx']) {
    const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8')
    assert.match(src, /aria-invalid=\{empty\.password \|\| undefined\}/, `${f}: password box not marked`)
    assert.match(src, /\?\.focus\(\)/, `${f}: empty box not focused`)
  }
  const css = readFileSync(fileURLToPath(new URL('../styles/global.css', import.meta.url)), 'utf8')
  assert.match(css, /\.input-wrap input\[aria-invalid="true"\]\{border-color:/)
})
