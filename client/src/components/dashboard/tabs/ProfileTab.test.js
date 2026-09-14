import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ProfileTab.jsx', import.meta.url), 'utf8')

/**
 * A dual-role account on the Watch side saw Creator name/category, the
 * verified-creator note, and the "Getting paid" payout panel — all gated on
 * `isCreator`, pure capability, with no idea which dashboard was actually
 * open. `showCreatorFields` adds that: capability AND the Create side.
 */
test('creator-only profile fields require both capability and the Create side', () => {
  assert.match(src, /const showCreatorFields = isCreator && accountSide === 'creator'/)

  // The three sections the leak was about must gate on the side-aware flag,
  // not the raw capability it used to be.
  assert.match(src, /\{showCreatorFields && \(/)
  assert.doesNotMatch(src, /\{isCreator && \(/, 'no render gate may go back to capability alone')

  // Both pieces must actually be read from somewhere real.
  assert.match(src, /const \{ reload: reloadAuth, isCreator, accountSide \} = useAuth\(\)/)
})

/**
 * The bio placeholder was the one place this leak survived the
 * showCreatorFields fix above: it read raw `isCreator` in a ternary, not a
 * `{showCreatorFields && (...)}` block, so the doesNotMatch check for that
 * JSX pattern never caught it. A dual-role account's Watch-side Profile
 * showed "Tell people what you make and why they should pay for it" -- the
 * client's own Sep 14 report named this exact string on the exact page it
 * should not appear on (report2.txt SEP14).
 */
test('the bio placeholder is side-aware too, not just capability-aware', () => {
  assert.match(
    src,
    /placeholder=\{\s*showCreatorFields\s*\?\s*'Tell people what you make and why they should pay for it\.'/
  )
  assert.doesNotMatch(
    src,
    /placeholder=\{\s*isCreator\s*\?/,
    'the bio placeholder must not branch on raw capability'
  )
})

test('the payout panel and the verified-creator note are inside a gated block', () => {
  const firstGate = src.slice(src.indexOf('{showCreatorFields && ('), src.indexOf('Social links'))
  assert.match(firstGate, /Creator name/)
  assert.match(firstGate, /Creator category/)
  assert.match(firstGate, /verified-note|Verified creator/)

  // "Getting paid" must appear shortly after the last showCreatorFields
  // gate, with the PayoutForm itself inside that same block.
  const lastGateAt = src.lastIndexOf('{showCreatorFields && (')
  const payoutAt = src.indexOf('Getting paid')
  assert.ok(lastGateAt > -1 && payoutAt > lastGateAt, 'the payout panel must follow a showCreatorFields gate')
  const block = src.slice(lastGateAt, payoutAt + 200)
  assert.match(block, /Getting paid/)
  assert.match(block, /PayoutForm/)
})
