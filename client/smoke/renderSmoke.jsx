/**
 * Does the page render at all?
 *
 * Twice now a change has gone to production with every suite green and taken a
 * page down on first render. The share-card key mismatch was invisible because
 * the tests only read source; Route B's temporal dead zone was invisible for the
 * same reason — the assertions were about the shape of the file, all of them
 * true, and all of them true of a file that throws the moment React calls it.
 *
 * So this actually calls the components. `renderToString` needs no DOM, no
 * jsdom, and no second test runner: Vite already understands the JSX and the `@`
 * alias, so the whole thing is a `vite build --ssr` of this file plus `node`.
 *
 * It is not a UI test and does not assert anything about markup. It asserts that
 * rendering does not throw — which is the exact failure that reached viewers,
 * and the one nothing else here could see.
 *
 * Watch is exercised in the four states its early returns branch on, because the
 * bug that shipped only existed in one of them: playback resolved while the
 * video row was still pending.
 */
import './domShim.js'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { ProgressProvider } from '@/context/ProgressContext'
import { AuthProvider } from '@/context/AuthContext'

import Watch from '@/pages/Watch'
import Explore from '@/pages/Explore'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import CreatorProfile from '@/pages/CreatorProfile'

const VIDEO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  slug: 'live-at-arusha-full-set',
  title: 'Live at Arusha',
  description: 'A set.',
  durationSeconds: 653,
  accessType: 'ppv_forever',
  priceTzs: 5000,
  freePreviewSeconds: 217,
  thumbnailUrl: '/api/videos/x/thumb',
  width: 426,
  height: 240,
  isPublished: true,
  creator: { id: 'c1', name: 'Arusha Live', verified: true },
}

const PLAYBACK = {
  videoId: VIDEO.id,
  slug: VIDEO.slug,
  title: VIDEO.title,
  durationSeconds: 653,
  accessType: 'ppv_forever',
  access: {
    canWatchFull: false,
    owned: false,
    isOwner: false,
    isStaff: false,
    requiresPayment: true,
    freePreviewSeconds: 217,
    priceTzs: 5000,
    showsAds: false,
    purchasedAt: null,
  },
  playback: { kind: 'preview', stopsAtSeconds: 217, resumeFromSeconds: 0, iframe: 'https://iframe.videodelivery.net/tok' },
  paywall: { priceTzs: 5000, heading: 'Want to keep watching?', cta: 'UNLOCK', methods: ['M-Pesa'] },
}

/**
 * The fixture is injected through the API stub aliased in at build time, so the
 * pages fetch nothing. Each case says which request has landed and which has not
 * — that distinction is the whole point of the Watch cases.
 */
globalThis.__SMOKE__ = { video: null, playback: null, videoError: null }

function frame(node) {
  return (
    <MemoryRouter initialEntries={['/watch/live-at-arusha-full-set']}>
      <ToastProvider>
        <ProgressProvider>
          <AuthProvider>{node}</AuthProvider>
        </ProgressProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

const CASES = [
  ['Watch · playback resolved, video still pending', () => { globalThis.__SMOKE__ = { video: null, playback: PLAYBACK, videoError: null }; return <Watch /> }],
  ['Watch · both resolved', () => { globalThis.__SMOKE__ = { video: { video: VIDEO }, playback: PLAYBACK, videoError: null }; return <Watch /> }],
  ['Watch · both pending', () => { globalThis.__SMOKE__ = { video: null, playback: null, videoError: null }; return <Watch /> }],
  ['Watch · video errored', () => { globalThis.__SMOKE__ = { video: null, playback: null, videoError: 'not found' }; return <Watch /> }],
  ['Explore', () => { globalThis.__SMOKE__ = { video: null, playback: null, videoError: null }; return <Explore /> }],
  ['Landing', () => <Landing />],
  ['Dashboard', () => <Dashboard />],
  ['CreatorProfile', () => <CreatorProfile />],
]

let failed = 0
for (const [name, make] of CASES) {
  try {
    renderToString(frame(make()))
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed += 1
    console.log(`  FAIL  ${name}`)
    console.log(`        ${String(err && err.message).split('\n')[0]}`)
  }
}

console.log(`\n${failed ? `${failed} page(s) threw on render` : 'every page rendered'}`)
process.exit(failed ? 1 : 0)
