import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('Watch does not block the film iframe on ad-break loading', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.doesNotMatch(src, /Loading advert/)
  assert.doesNotMatch(src, /adBreaks\.loading && !activeAd/)
  assert.match(src, /takeWarmedPlayback/)
  assert.match(src, /Preview is being prepared/)
  assert.match(src, /unavailable/)
  assert.match(src, /This video is unavailable/)
})

test('after payment Watch drops the warmed preview and waits for the full film', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /dropWarmedWatch/)
  assert.match(src, /key=\{`\$\{v\.id\}-\$\{p\.playback\.kind\}`\}/)
  assert.doesNotMatch(src, /justPaid \? 'paid'/)
  assert.match(src, /justPaid && p\.playback\.kind !== 'full'/)
  assert.match(src, /stopAt=\{p\.playback\.kind === 'preview' \? previewSeconds : 0\}/)
})

test('nothing of ours is ever drawn over the Cloudflare player', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Our poster held the frame behind "Connecting to player…" until the SDK
  // relayed an event — a still image over a player that was, in most cases,
  // already painting its own poster. Every failure of that cover looked like a
  // broken video: a blocked SDK script left it up for ever, and a 12s timer put
  // an error over a film that was playing underneath it.
  for (const gone of ['stream-poster', 'stream-boot-msg', 'stream-tap', 'Connecting to player', 'taking longer than usual']) {
    assert.ok(!src.includes(gone), `${gone} must be gone from the player`)
  }
  assert.doesNotMatch(src, /setReady|setTimedOut|setNeedsGesture|markReady/)

  // The iframe is the whole shell, mounted the moment there is a source.
  assert.match(src, /<div className="stream-shell is-live">/)
  assert.match(src, /className=\{`stream-frame \$\{painted \? 'is-painted' : ''\}`/)

  // `painted` is not a loading state — it skips the embed document's own white
  // background, which is what the poster was really hiding. It is revealed by
  // the iframe's load, by the SDK's first event, and unconditionally after a
  // moment, so a working player can never be left invisible.
  assert.match(src, /setTimeout\(\(\) => setPainted\(true\), 1500\)/)
  assert.match(src, /onLoad=\{\(\) => \{\s*\n[^}]*setPainted\(true\)/)
  assert.match(src, /const announceReady = \(\) => \{\s*\n\s*setPainted\(true\)/)

  const css = readFileSync(join(dir, '../styles/realdata.css'), 'utf8')
  assert.match(css, /\.stream-frame\.is-painted \{\s*\n\s*opacity: 1;/)
  // Black underneath, so what is skipped is white and never content.
  assert.match(css, /\.stream-shell \{[\s\S]*?background: #000;/)

  // What depended on our cover now fires on the SDK's own events.
  assert.match(src, /const announceReady = \(\) => \{/)
  assert.match(src, /player\.addEventListener\('loadeddata', announceReady\)/)
  assert.match(src, /player\.addEventListener\('canplay', announceReady\)/)
  assert.match(src, /onReadyRef\.current\?\.\(\)/)
  assert.match(src, /player\.videoWidth/)
  assert.match(src, /onMediaSizeRef/)

  // Ads still refuse to count a black buffer as airtime.
  assert.match(src, /if \(requireAirtimeRef\.current\) return/)
  assert.match(src, /AD_AIRTIME_FLOOR/)
  assert.match(src, /if \(!alive \|\| aired \|\| pausedRef\.current\)/)
  assert.match(src, /ensureStreamSdk/)
})

test('the only overlay left is a real failure', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Nothing time-based. Only the SDK saying error, or the iframe failing.
  assert.match(src, /player\.addEventListener\('error', \(\) => \{/)
  assert.match(src, /onError=\{\(\) => setFailed\(true\)\}/)
  assert.match(src, /\{failed && \(/)
  assert.ok(!src.includes('12000'), 'no timeout may decide the player is broken')

  // A plain message with Try again — no spinner.
  const panel = src.slice(src.indexOf('{failed && ('))
  assert.match(panel, /Try again/)
  assert.doesNotMatch(panel, /spin|Loading|Connecting/)
})

test('the ad layer exists only while an advert is on screen', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /\{activeAd && \(\s*\n\s*<div className="player-ad-layer">/)
})

test('Watch keeps the film mounted under a pre-roll so Play is not a second boot', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /takeWarmedAds/)
  assert.match(src, /player-ad-layer/)
  assert.match(src, /paused=\{Boolean\(activeAd\)\}/)
  assert.doesNotMatch(src, /paused=\{Boolean\(activeAd\) \|\|/)
})

test('Watch sizes the player to the file, not a forced 16:9 box', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /videoShape/)
  assert.match(src, /is-\$\{shape\.orientation\}/)
  assert.match(src, /--player-aspect/)
  assert.match(src, /onMediaSize/)

  const css = readFileSync(join(dir, '../styles/realdata.css'), 'utf8')
  assert.match(css, /--player-aspect/)
  assert.match(css, /--player-ratio/)
  assert.match(css, /--player-max-h/)
  assert.doesNotMatch(css, /\.watch-wrap \.player \{[^}]*max-height: min\(56\.25vw, 62dvh\)/)
})

test('a purchase of A remounts Watch and cannot unlock B', () => {
  const app = readFileSync(join(dir, '../App.jsx'), 'utf8')
  assert.match(app, /<Watch key=\{videoId \|\| location\.pathname\} \/>/)

  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /justPaidFor/)
  assert.match(src, /playbackRouteMatches/)
  assert.match(src, /setJustPaidFor\(v\?\.id \|\| videoId\)/)
  assert.match(src, /showLockGate/)

  /**
   * The rule that `justPaidFor` is compared against this video — rather than
   * being a boolean that stayed true on the next one — moved to
   * `@/lib/watchLock.js`, where it is tested by being run instead of matched.
   * What is left here is that the page defers to it.
   */
  assert.match(src, /import \{ watchLockState \} from '@\/lib\/watchLock'/)
  assert.match(src, /const \{ accessReady, locked, justPaid, owned, needsPayment \} = watchLockState\(/)

  const rule = readFileSync(join(dir, '../lib/watchLock.js'), 'utf8')
  assert.match(rule, /justPaidFor === video\?\.id/)
})

test('the iframe URL is pinned to its source — a growing startAt never reloads the player', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // The re-pin was the freeze: startAt grows on its own (the page derives it
  // from the position saved every ten seconds), so any re-render during
  // playback re-navigated a live cross-origin iframe.
  assert.doesNotMatch(src, /else if \(playOnReady && Number\(startAt\)/)
  assert.doesNotMatch(src, /pin\.current\.startAt \|\| 0\) \+ 0\.4/)

  // Exactly one place may write the pin, and only when the source changes.
  const writes = src.match(/pin\.current = \{ src,/g) || []
  assert.equal(writes.length, 1, 'the pin must only be written when src changes')
  assert.match(src, /if \(src !== pin\.current\.src\) \{\s*\n\s*pin\.current = \{ src,/)

  // iframeSrc therefore depends on nothing that moves during playback.
  assert.match(src, /\[src, resumeAt, controls\]/)
})

test('moving a running player is a seek, not a new iframe', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  assert.match(src, /seekRequest = null/)
  assert.match(src, /const pendingSeek = useRef/)
  // Held until the player exists: the request can arrive before the SDK boots.
  assert.match(src, /player\.addEventListener\('loadedmetadata', runPendingSeek\)/)
  assert.match(src, /player\.addEventListener\('canplay', runPendingSeek\)/)
  // Only when the player is genuinely elsewhere, so it cannot fight a scrub.
  assert.match(src, /Math\.abs\(at - want\.seconds\) <= 2/)

  // A cross-origin currentTime write can be dropped silently, so landing is
  // observed rather than asserted — and the asking is bounded.
  assert.match(src, /want\.tries >= 5/)
  assert.match(src, /want\.done = true/)

  // A seek belongs to one source. If the film moved on, it is retired, not
  // re-armed against whatever is playing now.
  assert.match(src, /if \(want\.src !== srcRef\.current\)/)
})

test('an advert can never leave the film frozen with no way back', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Once the film has aired every other restart has retired: shown() clears the
  // watchdog and start() returns early on `aired`. The resume after a mid-roll
  // is the only thing left, so it may not be fire-and-forget: play() rejects
  // asynchronously and a synchronous try/catch never sees it.
  assert.match(src, /await Promise\.resolve\(player\.play\?\.\(\)\)/)
  assert.doesNotMatch(src, /else if \(playOnReady \|\| autoplay\) player\.play\?\.\(\)/)
  assert.doesNotMatch(src, /overlay \/ watchdog still cover a refused play/)

  // Refused unmuted -> retry muted. If even that is refused the film is paused
  // on a frame with Cloudflare's own controls over it, and that is the tap —
  // we no longer put a second play button on top of theirs.
  assert.match(src, /if \(alive\) setSilent\(true\)/)
  assert.doesNotMatch(src, /setNeedsGesture/)
})

test('a torn-down player is not left reachable', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  // A seek, a tap or the page reading the position would otherwise be talking
  // to a wrapper around an iframe that has gone.
  assert.match(src, /if \(playerRef\.current === player\) playerRef\.current = null/)
})

test('the mid-roll resume is a seek, and the film publishes its own position', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  // setResumeHint here used to rebuild the whole iframe on every mid-roll, and
  // once the start second was pinned it stopped reaching the player at all.
  assert.doesNotMatch(src, /setResumeHint\(mainProgress\.current\)/)
  assert.match(src, /setSeekTo\(\{ seconds: at, nonce: `mid_roll:\$\{at\}` \}\)/)

  assert.match(src, /seekRequest=\{seekTo\}/)
  assert.match(src, /positionRef=\{livePosition\}/)
  // Per-video, like everything else on this page.
  assert.match(src, /livePosition\.current = 0/)

  const player = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  // Published before the branch that halts a finished preview stops reporting.
  assert.match(player, /if \(positionRefProp && at > 0\) positionRefProp\.current = at/)
})

test('the start second is decided once per player, not on every render', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  // recallProgress advances while the film plays. Reading it on every render
  // produced a climbing startAt, which the player took as "start elsewhere".
  assert.match(src, /const startFrom = useRef\(\{ key: null, value: 0 \}\)/)
  assert.match(src, /if \(playerKey && startFrom\.current\.key !== playerKey\)/)
  assert.match(src, /const resumeAt = startFrom\.current\.value/)

  // recallProgress may only be reached from inside the keyed block.
  const guarded = src.slice(src.indexOf('if (playerKey && startFrom.current.key'))
  const before = src.slice(0, src.indexOf('if (playerKey && startFrom.current.key'))
  assert.doesNotMatch(before, /resumeAt = justPaid/)
  assert.match(guarded, /recallProgress\(videoId\)/)

  // The pin key must be the key the player is mounted under, or the two can
  // disagree about which film they are describing.
  assert.match(src, /const playerKey = p\?\.playback\?\.iframe \? `\$\{v\?\.id\}-\$\{p\.playback\.kind\}` : null/)
  assert.match(src, /key=\{`\$\{v\.id\}-\$\{p\.playback\.kind\}`\}/)

  // A start point belongs to one video.
  assert.match(src, /startFrom\.current = \{ key: null, value: 0 \}/)
})

test('nothing unmutes the film without a person asking', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Unmuting an autoplaying video asks for a permission never granted, and the
  // browser answers by pausing it. The film started and stopped.
  assert.doesNotMatch(src, /player\.muted = false\s*\n\s*unmutedAt/)
  assert.doesNotMatch(src, /unmutedAt/)

  // The "recovery" that was meant to catch it guarded on !aired, and aired was
  // already true by then — unreachable. It is gone rather than left to mislead.
  assert.doesNotMatch(src, /const onPause = /)
  assert.doesNotMatch(src, /addEventListener\('pause', onPause\)/)

  // muted=false may now only appear inside a click handler. Comments describe
  // the old behaviour on purpose, so they are not code and must not be read
  // as such.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const unmutes = [...code.matchAll(/player\.muted = false/g)]
  assert.ok(unmutes.length > 0, 'sound must still be reachable')
  for (const m of unmutes) {
    const before = code.slice(Math.max(0, m.index - 400), m.index)
    assert.match(before, /onClick=\{|kickFromGesture/, 'unmute must follow a gesture')
  }

  // The pill appears as soon as it is airing muted, not 1.2s later.
  assert.doesNotMatch(src, /}, 1200\)/)
  assert.match(src, /setSilent\(Boolean\(player\.muted\)\)/)
  assert.match(src, /addEventListener\('volumechange'/)
})

test('the position is captured at the paywall and at checkout, from the player', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  assert.match(src, /const capturePosition = useCallback\(/)
  // The player's clock leads the page's copy.
  assert.match(src, /Math\.floor\(Number\(livePosition\.current\) \|\| 0\)/)
  assert.match(src, /Math\.max\(live, watchedTo\.current, recallProgress\(videoId\)\)/)

  // Both moments, and BEFORE anything else happens to the page.
  assert.match(src, /if \(!needsPayment\) return\s*\n\s*\/\* Take the position BEFORE[\s\S]*?const at = capturePosition\(\)/)
  assert.match(src, /onStopReached=\{\(\) => \{\s*\n\s*capturePosition\(\)/)

  // It is what resumePoint is given first.
  assert.match(src, /captured: capturePosition\(\)/)

  // Per video, like everything else here.
  assert.match(src, /paywallAt\.current = 0/)
})

test('after payment the film is nudged by seek, never by a new start second', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /nonce: `paid:\$\{v\?\.id \|\| videoId\}:\$\{at\}`/)
  assert.match(src, /p\?\.playback\?\.kind !== 'full'/)
  // And the viewer is told where they are being put back.
  assert.match(src, /Resuming from \$\{duration\(Math\.floor\(resumeAt\)\)\}/)
})

test('a Play tap issues no request and cannot move the iframe URL', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Nothing in the player may reach the network at all: no token is minted on
  // Play, so there is nothing to wait for between the tap and the frame.
  assert.doesNotMatch(src, /\bfetch\s*\(/)
  assert.doesNotMatch(src, /from '@\/lib\/api'/)
  assert.doesNotMatch(src, /api\.(videos|playback|ads)\b/)

  // There is no Play control of ours left to audit. Cloudflare's own button is
  // the one the viewer presses, and it cannot reach our code at all — so the
  // strongest statement available is that the file has no network in it.
  assert.doesNotMatch(src, /kickFromGesture/)

  // And the URL is derived from nothing a tap can touch.
  assert.match(src, /const iframeSrc = useMemo\(\s*\n?\s*\(\) => \(src \? buildSrc\(src, resumeAt, controls\) : null\),\s*\n?\s*\[src, resumeAt, controls\]/)
  assert.match(src, /const resumeAt = pin\.current\.startAt/)

  // Only the explicit retry controls may rebuild, and they are not Play.
  const boots = src.match(/setBoot\(\(n\)/g) || []
  assert.equal(boots.length, 1, 'there is exactly one place that rebuilds the iframe')
  const retry = src.slice(src.indexOf('const retry = ()'), src.indexOf('useEffect', src.indexOf('const retry = ()')))
  assert.match(retry, /setBoot\(\(n\) => n \+ 1\)/, 'and it is retry()')
})

test('the halted preview reports once, not five times a second forever', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // The 200ms poll runs whether or not anything changed. With the report
  // outside the guard, a viewer sitting on the paywall produced five forced
  // progress reports a second — five sessionStorage writes and five PUTs — for
  // as long as they stayed there, against an API allowing 120 a minute.
  const halt = src.slice(src.indexOf('const haltIfDue'), src.indexOf("player.addEventListener('timeupdate', haltIfDue)"))
  const guard = halt.indexOf('if (!stopped) {')
  const report = halt.lastIndexOf('onTimeUpdateRef.current?.(limit, player.duration)')
  assert.ok(guard >= 0 && report > guard, 'the stop report must sit inside the !stopped guard')

  // And a scrub back out of the halt re-arms it.
  assert.match(halt, /stopped = false/)
})

test('a missing Stream SDK costs nothing, because nothing was covering the film', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Everything that lifted the poster used to live behind `if (!Stream) return`,
  // while the iframe played on underneath it — audible, never visible. There is
  // no cover to lift now, so the worst a blocked SDK can do is cost us the
  // paywall halt, and the film itself is unaffected.
  assert.doesNotMatch(src, /if \(!alive \|\| !Stream \|\| !frame\.current\) return/)
  assert.match(src, /if \(!alive \|\| !frame\.current\) return/)
  assert.match(src, /if \(!Stream\) \{\s*\n\s*onReadyRef\.current\?\.\(\)/)
  assert.doesNotMatch(src, /const \[ready, setReady\]/)
})

test('opening a video does not fetch the share card or two SPA shells', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  // warmShareFromMeta pulls two lambda-rendered /watch/:slug documents and a
  // 1200x630 JPEG, and it was firing in the same tick as the first segment.
  const effects = src.slice(0, src.indexOf('const primeShare'))
  assert.doesNotMatch(effects, /^\s*warmShareFromMeta\(share\)/m)
  // Intent still warms it — the Share button, well before the sheet can open.
  assert.match(src, /const primeShare = \(\) => \{\s*\n\s*if \(share\?\.watchUrl\) warmShareFromMeta\(share\)/)
  assert.match(src, /onPointerEnter=\{primeShare\}/)

  const warm = readFileSync(join(dir, '../lib/warmShare.js'), 'utf8')
  // The heal guard is never released: releasing it in a .finally landed before
  // React flushed the effect its own setState scheduled, so it re-entered.
  assert.doesNotMatch(warm, /finally\(\(\) => healing\.delete/)
  assert.match(warm, /healing\.add\(slug\)/)
})

test('the origin that actually serves the media is the one warmed', () => {
  const html = readFileSync(join(dir, '../../index.html'), 'utf8')
  // The manifest, the segments and the player bundle all come from here.
  assert.match(html, /rel="preconnect" href="https:\/\/cloudflarestream\.com"/)
  // videodelivery.net stays — it is the poster host Watch fetches first-party.
  assert.match(html, /rel="preconnect" href="https:\/\/videodelivery\.net"/)
})

test('the purple unlock gate comes back when a paid preview runs out', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  // Removing our loader must not have taken the paywall with it: the gate is a
  // sibling of the player, not part of it.
  assert.match(src, /\{showLockGate && \(\s*\n\s*<LockGate/)
  assert.match(src, /onUnlock=\{openCheckout\}/)
  assert.match(src, /needsPayment &&\s*\n\s*\(previewOver \|\|/)

  // Three independent things raise it, so one missed event cannot lose it:
  // the SDK halt, the clip ending, and a wall-clock backstop.
  assert.match(src, /onStopReached=\{\(\) => \{\s*\n\s*capturePosition\(\)/)
  assert.match(src, /previewRanOut\.current = true\s*\n\s*setPreviewOver\(true\)/)
  assert.match(src, /\}, \(stopsAt \+ 8\) \* 1000\)/)

  // It has to sit above the player, which now shows Cloudflare's own controls.
  const css = readFileSync(join(dir, '../styles/realdata.css'), 'utf8')
  const gate = css.slice(css.indexOf('.lock-gate {'), css.indexOf('@keyframes lg-in'))
  assert.match(gate, /position: absolute/)
  assert.match(gate, /inset: 0/)
  assert.match(gate, /z-index: 5/)
  const frame = css.slice(css.indexOf('.stream-frame {'), css.indexOf('.stream-frame.is-painted'))
  assert.match(frame, /z-index: 1/)
  // And the purple is the veil's own gradient.
  assert.match(css, /\.lg-veil \{[\s\S]*?rgba\(124, 58, 237, \.28\)/)
})

test('paying from that gate resumes where the preview stopped, never at zero', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  // Captured at the gate and again when checkout opens — the player's own
  // clock, because a halted preview stops telling the page anything.
  assert.match(src, /const at = capturePosition\(\)/)
  assert.match(src, /captured: capturePosition\(\)/)

  // Handed to the full film as its start second, then nudged by seek if the
  // player landed somewhere else anyway.
  assert.match(src, /startAt=\{resumeAt\}/)
  assert.match(src, /nonce: `paid:\$\{v\?\.id \|\| videoId\}:\$\{at\}`/)
  assert.match(src, /Resuming from \$\{duration\(Math\.floor\(resumeAt\)\)\}/)

  const rp = readFileSync(join(dir, '../lib/resumePoint.js'), 'utf8')
  assert.match(rp, /const from = Math\.max\(seen, watched, saved\)/)
  assert.match(rp, /if \(stop > 2 && previewEnded\) return stop/)
})

test('the player says something while it is still coming, and offers a retry', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')

  /**
   * ~3.5 s of the wait is Cloudflare's floor, so a silent poster for that long
   * is the normal case. These stages do not make it faster; they stop it looking
   * broken while it is slow.
   */
  assert.match(src, /const BOOT_STAGE_MS = \[1500, 5000, 12000\]/)
  assert.match(src, /'Connecting…'/)
  assert.match(src, /'Slow connection — still connecting'/)

  /**
   * The retry could never render before. `waitingForPlayback` was gated on
   * `!playback.error`, so the timeout set the error, the shell unmounted, and
   * the viewer went straight to a failure screen without being offered the
   * cheaper option of waiting a moment longer. The shell now survives it.
   */
  assert.match(src, /playback\.loading \|\| Boolean\(playback\.error\)/)
  assert.doesNotMatch(src, /!playback\.error && \(playback\.loading/)

  /* Stage 3 must not sit behind the request's own timeout, or the error wins. */
  assert.match(src, /timeoutMs: 12_000/)
  assert.match(src, /bootStage >= 3 &&/)
  assert.match(src, /Try again/)
})

test('a purchase with nothing watched explains why it starts at zero', () => {
  // resumePoint returns 0 for someone who paid without watching the preview.
  // On screen that looks identical to the film forgetting their position.
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /starting from the beginning, you hadn't watched the preview/)
})
