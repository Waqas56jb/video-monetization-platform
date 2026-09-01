/**
 * How many players does one play create?
 *
 * A remount is invisible in a timing chart — the numbers just get worse — and it
 * is the specific way a "mount the player earlier" change can end up slower than
 * what it replaced: React unmounts the iframe and builds a second cold one.
 *
 * So this counts iframe elements rather than timing anything. Exactly one per
 * play, except a Free + Ads title, which legitimately mounts an ad player as
 * well.
 *
 * Three earlier versions of this counter were wrong, and the way they were wrong
 * is the reason the comments inside are long. A network filter on
 * `resourceType === 'document'` missed the iframe navigations entirely.
 * `frameattached` plus `waitForURL` also reported zero. A MutationObserver
 * inspecting `src` at insertion time missed them too, because React inserts
 * these iframes empty and sets `src` a moment later — only the ad player, whose
 * src is set before insertion, was ever counted.
 *
 * All three reported ZERO for videos that were demonstrably playing, so the
 * fourth disagreement looked like a fourth bug in the counter. It was not: the
 * page was genuinely crashing. The lesson is in the tool now — when the
 * instrument and the code disagree, read the instrument's raw output, not its
 * summary. `--debug` dumps the DOM instead of the count for that reason.
 *
 *   PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs  *     node scripts/count-player-mounts.mjs
 *   RUNS=3 node scripts/count-player-mounts.mjs
 */
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE)
const BASE = 'https://video-monetization-platform-chi.vercel.app'
const SLUGS = ['live-at-arusha-full-set', 'how-to-cook-pilau-properly', 'rpreplay-final1589783013-2']
const RUNS = Number(process.env.RUNS || 5)
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })

/* Count iframe CREATIONS from inside the page. A remount inserts a new <iframe>
   element with the same src, which no network or frame-attach filter separates
   reliably from the first one. A MutationObserver sees the element itself. */
const INIT = `
window.__players = [];
(function attach() {
  // Count each iframe ELEMENT once, the first time its src becomes a player URL.
  //
  // Two earlier attempts reported zero for videos that were demonstrably
  // playing. The first observed document.documentElement, which can be null at
  // document-start, so the observer threw and died. The second only inspected
  // src at insertion time — but React inserts these iframes with no src and sets
  // it a moment later, so the URL was never there to see. Only the free+ads
  // title, whose ad player is inserted with its src already set, was counted.
  var root = document.documentElement || document;
  var seen = new WeakSet();
  function check(el) {
    if (!el || el.tagName !== 'IFRAME' || seen.has(el)) return;
    var src = el.getAttribute('src') || el.src || '';
    if (!/videodelivery|cloudflarestream/.test(src)) return;
    seen.add(el);
    window.__players.push(src.slice(0, 50));
  }
  function scan(n) {
    if (!n || n.nodeType !== 1) return;
    if (n.tagName === 'IFRAME') check(n);
    if (n.querySelectorAll) { var q = n.querySelectorAll('iframe'); for (var i = 0; i < q.length; i++) check(q[i]); }
  }
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') { check(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
      }
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  } catch (e) { window.__observerError = String(e); }
})();
`

for (const slug of SLUGS) {
  const counts = []
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    await page.addInitScript(INIT)
    try {
      await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
      const link = page.locator(`a[href*="${slug}"]`).first()
      await link.waitFor({ state: 'visible', timeout: 60000 })
      await link.click()
      const deadline = Date.now() + 45000
      let playing = false
      while (Date.now() < deadline && !playing) {
        for (const f of page.frames()) {
          if (!/videodelivery|cloudflarestream/.test(f.url())) continue
          const t = await f.evaluate(() => document.querySelector('video')?.currentTime ?? -1).catch(() => -1)
          if (t > 0.25) playing = true
        }
        if (!playing) await page.waitForTimeout(100)
      }
      await page.waitForTimeout(4000)   // catch any late remount
      counts.push(await page.evaluate(() => window.__players.length).catch(() => -1))
    } catch { counts.push(-1) }
    await ctx.close()
  }
  const expect = slug === 'how-to-cook-pilau-properly' ? 2 : 1
  const over = counts.filter((c) => c > expect).length
  const missing = counts.filter((c) => c < 1).length
  console.log(`  ${slug.padEnd(34)} player iframes created per play: [${counts.join(', ')}]  expected ${expect}  ` +
    (over ? `*** ${over} run(s) REMOUNTED ***` : missing ? `*** ${missing} run(s) never mounted ***` : 'no remount'))
}
await browser.close(); process.exit(0)
