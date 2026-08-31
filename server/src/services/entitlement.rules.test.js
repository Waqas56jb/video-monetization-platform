import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAccess } from './entitlement.js'

/**
 * The paywall rules, run rather than read.
 *
 * `resolveAccess` is the single place access is decided — the player, the signed
 * URL endpoint and the share preview all defer to it — so these call it and
 * assert what comes back. Passing `purchase` explicitly keeps the database out
 * of it: `undefined` means "go and look", `null` means "there is none", and a row
 * means "this one". The lookup's own SQL is asserted next door in
 * entitlement.access.test.js, which is the one thing here that cannot be run
 * without a database.
 *
 * These were written after a viewer reported being shown Unlock on a film they
 * had bought. The server turned out to be right — the cause was a client cache
 * keyed on video alone — but the rules had almost no tests of their own, so a
 * later change could have made the report true without anything failing.
 */

const VIEWER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CREATOR = '33333333-3333-4333-8333-333333333333'

const paidFilm = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  access_type: 'ppv_forever',
  price_tzs: 5000,
  free_preview_seconds: 217,
  duration_seconds: 653,
  ads_enabled: false,
  creator_id: CREATOR,
}
/* A second title, so "unlocks only that video" is a real two-video claim. */
const otherFilm = { ...paidFilm, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', price_tzs: 1000 }
const freeFilm = { ...paidFilm, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', access_type: 'free_with_ads', ads_enabled: true }

const receipt = { id: 'p-1', purchased_at: '2026-08-10T13:23:51.673Z' }

test('the buyer of a video may watch all of it', async () => {
  const a = await resolveAccess({ video: paidFilm, userId: VIEWER, purchase: receipt })
  assert.equal(a.owned, true)
  assert.equal(a.canWatchFull, true)
  assert.equal(a.requiresPayment, false)
  assert.equal(a.purchasedAt, receipt.purchased_at)
})

test('a purchase of A never unlocks B, for the same viewer', async () => {
  // One user, two videos, one receipt. This is the shape of the bug the audit
  // asked about, from the safe side.
  const bought = await resolveAccess({ video: paidFilm, userId: VIEWER, purchase: receipt })
  const notBought = await resolveAccess({ video: otherFilm, userId: VIEWER, purchase: null })
  assert.equal(bought.canWatchFull, true)
  assert.equal(notBought.canWatchFull, false)
  assert.equal(notBought.owned, false)
  assert.equal(notBought.requiresPayment, true)
})

test('a different viewer of the same video gets the preview', async () => {
  const a = await resolveAccess({ video: paidFilm, userId: OTHER, purchase: null })
  assert.equal(a.owned, false)
  assert.equal(a.canWatchFull, false)
  assert.equal(a.requiresPayment, true)
  assert.equal(a.freePreviewSeconds, 217)
})

test('entitlement follows the account, not the session — a new device still owns it', async () => {
  // There is no token, device or session in this function's inputs, and that is
  // the property worth pinning: signing in again somewhere else cannot change
  // the answer, because only user id and video id decide it.
  const first = await resolveAccess({ video: paidFilm, userId: VIEWER, purchase: receipt })
  const secondDevice = await resolveAccess({ video: paidFilm, userId: VIEWER, purchase: receipt })
  assert.deepEqual(secondDevice, first)
  assert.equal(secondDevice.canWatchFull, true)
})

test('an anonymous viewer is never owed full playback', async () => {
  const a = await resolveAccess({ video: paidFilm, userId: null, purchase: null })
  assert.equal(a.owned, false)
  assert.equal(a.canWatchFull, false)
  assert.equal(a.isOwner, false)
})

test('the creator may watch their own film, but it is not recorded as a purchase', async () => {
  const a = await resolveAccess({ video: paidFilm, userId: CREATOR, purchase: null })
  assert.equal(a.canWatchFull, true)
  assert.equal(a.isOwner, true)
  assert.equal(a.owned, false, 'owned is the purchase flag — My Library must not list this')
  assert.equal(a.purchasedAt, null)
})

test('staff may watch anything, and that is flagged rather than disguised', async () => {
  for (const role of ['admin', 'sub_admin']) {
    const a = await resolveAccess({ video: paidFilm, userId: OTHER, userRole: role, purchase: null })
    assert.equal(a.canWatchFull, true, `${role} should be able to review the film`)
    assert.equal(a.isStaff, true, `${role} must be labelled as staff`)
    assert.equal(a.owned, false, `${role} has not bought anything`)
    assert.equal(a.purchasedAt, null)
  }
})

test('an ordinary viewer is not staff', async () => {
  const a = await resolveAccess({ video: paidFilm, userId: VIEWER, userRole: 'viewer', purchase: null })
  assert.equal(a.isStaff, false)
  assert.equal(a.canWatchFull, false)
})

test('a free video is watchable by everyone, signed in or not', async () => {
  const anon = await resolveAccess({ video: freeFilm, userId: null, purchase: null })
  assert.equal(anon.canWatchFull, true)
  assert.equal(anon.requiresPayment, false)
  assert.equal(anon.freePreviewSeconds, null)
  assert.equal(anon.priceTzs, 0)
})

test('someone who paid during a premiere keeps it ad-free after it converts', async () => {
  // The converted premiere is free_with_ads, so `free && ads_enabled` would show
  // adverts to the person who paid full price during the window.
  const buyer = await resolveAccess({ video: freeFilm, userId: VIEWER, purchase: receipt })
  const passerby = await resolveAccess({ video: freeFilm, userId: OTHER, purchase: null })
  assert.equal(buyer.showsAds, false)
  assert.equal(passerby.showsAds, true)
})

test('the creator is not advertised at on their own work', async () => {
  const a = await resolveAccess({ video: freeFilm, userId: CREATOR, purchase: null })
  assert.equal(a.showsAds, false)
})

test('full playback is signed only when access says so', () => {
  // The rules above decide; this is the wiring that acts on them. If these two
  // ever drift apart, a locked video could be signed with the full asset.
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../modules/playback.routes.js'),
    'utf8'
  )
  assert.match(src, /if \(access\.canWatchFull\) \{/)
  const full = src.indexOf("kind: 'full'")
  const preview = src.indexOf("kind: 'preview'")
  assert.ok(full > -1 && preview > -1)
  assert.ok(full < preview, 'the full branch returns before the preview fallback')
})
