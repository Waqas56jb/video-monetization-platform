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
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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
  /* The payload carries the frame's shape so the player can be built at the
     right size before /api/videos lands — the fixture has to match, or the
     comparison below tests a payload the server no longer sends. */
  width: VIDEO.width,
  height: VIDEO.height,
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

/**
 * Rendered through a real route, not as a bare element.
 *
 * Watch reads `useParams().videoId`, and without a matching <Route> that is
 * undefined — so playbackRouteMatches refuses the payload, `p` is null, and the
 * "playback resolved, video pending" case silently tests the loading shell
 * instead of the state it is named after. The frame comparison below is what
 * exposed that: both renders showed the default 16:9 because neither had a
 * player in it.
 */
function frame(node) {
  return (
    <MemoryRouter initialEntries={['/watch/live-at-arusha-full-set']}>
      <ToastProvider>
        <ProgressProvider>
          <AuthProvider>
            <Routes>
              <Route path="/watch/:videoId" element={node} />
              <Route path="*" element={node} />
            </Routes>
          </AuthProvider>
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
const html = {}
for (const [name, make] of CASES) {
  try {
    html[name] = renderToString(frame(make()))
    console.log(`  PASS  ${name}`)
  } catch (err) {
    failed += 1
    console.log(`  FAIL  ${name}`)
    console.log(`        ${String(err && err.message).split('\n')[0]}`)
  }
}

/**
 * The player's frame must not change shape when /api/videos lands.
 *
 * This is why mounting early was slower the first time: the wrapper rendered
 * 16:9 from playback alone, then swapped its class and its CSS custom properties
 * when the video row arrived — underneath a cross-origin iframe still starting
 * up, which cost Cloudflare's player about 900 ms. Comparing the two renders is
 * the requirement stated directly, rather than a source shape standing in for it.
 */
const stage = (markup) => {
  const m = String(markup).match(/class="player[^"]*"[^>]*?style="[^"]*"/)
  return m ? m[0] : null
}
const early = stage(html['Watch · playback resolved, video still pending'])
const late = stage(html['Watch · both resolved'])
console.log('')
console.log('  frame, playback only : ' + (early || '(not found)'))
console.log('  frame, both resolved : ' + (late || '(not found)'))
if (!early || !late) {
  failed += 1
  console.log('  FAIL  could not find the player wrapper in one of the renders')
} else if (early !== late) {
  failed += 1
  console.log('  FAIL  the player frame changes when /api/videos lands — the iframe is resized mid-boot')
} else {
  console.log('  PASS  the player frame is identical before and after the video row lands')
}

console.log(`\n${failed ? `${failed} page(s) threw on render` : 'every page rendered'}`)
process.exit(failed ? 1 : 0)
