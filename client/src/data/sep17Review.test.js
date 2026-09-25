/**
 * The client's Sep 17 Milestone 2 close-out review — the client-side wording
 * and cleanup items, pinned. Source-text, matching the rest of this suite.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = join(dir, '..')
const read = (rel) => readFileSync(join(src, rel), 'utf8')

test('item 6: the upload declaration covers owning OR holding the necessary rights, and never says "confirm"', () => {
  const upload = read('components/dashboard/tabs/UploadTab.jsx')
  assert.match(upload, /I declare that I own this content or hold the necessary rights to it/)
  assert.match(upload, /every right, permission or licence needed to sell/)
  assert.match(upload, /Declare that you own this content or hold the necessary rights before submitting/)
  assert.doesNotMatch(upload, /Confirm you hold the rights/)
})

test('item 7: no absolute "never disappears" — access is kept, with the legal/rights/safety exception stated', () => {
  const testi = read('components/landing/Testimonials.jsx')
  assert.doesNotMatch(testi, /never disappears/)
  assert.match(testi, /unless it ever has to be withdrawn for a legal, rights or safety reason/)
  const legal = read('data/legal.js')
  assert.doesNotMatch(legal, /cannot simply disappear/)
  assert.match(legal, /Access is withdrawn only where a legal, rights or safety requirement makes it necessary/)
})

test('item 8: the hero counts creators who actually earned, and says "Creators" otherwise — never "earning" over a headcount', () => {
  const hero = read('components/landing/Hero.jsx')
  assert.match(hero, /s\.creatorsEarning > 0/)
  assert.match(hero, /count: s\.creatorsEarning, prefix: '', suffix: '', label: 'Creators earning'/)
  assert.match(hero, /count: s\.creators, prefix: '', suffix: '', label: 'Creators on MTONYO\+'/)
  assert.doesNotMatch(hero, /count: s\.creators, prefix: '', suffix: '', label: 'Creators earning'/)
})

test('cleanup: only the launch payment methods are shown — no Visa, no Mastercard, no "+ more"', () => {
  // Comments stripped: the component's own comment records what USED to be here.
  const mock = read('components/landing/PhoneMockup.jsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(mock, /<span>VISA<\/span>|aria-label="Mastercard"|\+ more/)
  assert.match(mock, /<span>M-PESA<\/span>\s*<span>AIRTEL MONEY<\/span>/)
  const css = read('styles/global.css')
  assert.doesNotMatch(css, /\.ph-mc\b/)
})

test('cleanup: the Library "remove from history" X sits top-right, away from the top-left access badge', () => {
  const css = read('styles/global.css')
  assert.match(css, /\.lib-forget\{position:absolute;top:10px;right:10px;left:auto;/)
  assert.match(css, /\.vid-tag\{position:absolute;top:12px;left:12px;/)
})

test('item 1/2: the public Creator Capital pages carry no literal "6 months" — the number comes from the platform rule', () => {
  for (const f of ['components/landing/CreatorCapital.jsx', 'pages/CreatorCapitalInfo.jsx']) {
    const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    assert.doesNotMatch(text, /\b6 months\b|\bsix months\b/, `${f} must not render a literal six`)
    assert.match(text, /capitalMonthsRequired/)
  }
})

/**
 * "Please confirm 70/30 is controlled by the global Super Admin split and
 * not hardcoded in multiple pages." Every rendered split reads a live value,
 * and nothing stands in a number for it while it loads (split-literal-audit
 * enforces that). This walks every source file in client/src and fails on any
 * rendered "70/30".
 */
function walk(d, out = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|css)$/.test(name) && !/\.test\.js$/.test(name)) out.push(p)
  }
  return out
}

test('no page renders a literal "70/30" — the split is the Super Admin setting everywhere', () => {
  const offenders = []
  for (const file of walk(src)) {
    const text = readFileSync(file, 'utf8')
    // Strip comments: the history of the old hard-coded split lives there and is fine.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
    if (/\b70\s*\/\s*30\b|\b70\/30\b/.test(code)) offenders.push(file.replace(src, ''))
  }
  assert.deepEqual(offenders, [], `rendered 70/30 literal in: ${offenders.join(', ')}`)
})

test('a Watch-side dashboard heading never uses creator language (category, sales, payouts)', async () => {
  const { DASH_TITLES } = await import('./copy.js')
  for (const tab of ['library', 'purchases', 'analytics', 'profile', 'settings', 'inbox']) {
    const [title, subtitle] = DASH_TITLES[tab]('Asha', '', 'viewer')
    assert.doesNotMatch(`${title} ${subtitle}`, /category|sales|payout|earn|approv|reject/i, `viewer ${tab}: "${title} — ${subtitle}"`)
  }
  // The Create side keeps its own wording.
  assert.match(DASH_TITLES.profile('Asha', '', 'creator')[1], /category/)
  assert.match(DASH_TITLES.analytics('Asha', '', 'creator')[1], /sales/)
})
