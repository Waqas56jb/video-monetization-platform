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

test('StreamPlayer uncovers the film on canplay, ads still wait for airtime', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  assert.match(src, /player\.addEventListener\('loadeddata', uncoverFilm\)/)
  assert.match(src, /player\.addEventListener\('canplay', uncoverFilm\)/)
  assert.match(src, /player\.videoWidth/)
  assert.match(src, /onMediaSizeRef/)
  assert.match(src, /onReadyRef\.current\?\.\(\)/)
  assert.match(src, /if \(requireAirtimeRef\.current\) return/)
  assert.match(src, /if \(!alive \|\| aired \|\| pausedRef\.current\)/)
  assert.match(src, /needsGesture && !timedOut/)
  assert.match(src, /ensureStreamSdk/)
  assert.doesNotMatch(src, /!ready && !timedOut && \(\s*<button type="button" className="stream-tap"/)
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
  assert.match(src, /justPaidFor === v\?\.id/)
  assert.match(src, /setJustPaidFor\(v\?\.id \|\| videoId\)/)
  assert.match(src, /showLockGate/)
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

  // Refused unmuted -> retry muted -> and only then hand the tap back.
  assert.match(src, /if \(alive\) setNeedsGesture\(true\)/)

  // The tap must be able to disappear again, which means clearing it cannot sit
  // behind the `aired` guard.
  const shown = src.slice(src.indexOf('const shown = () => {'))
  const guard = shown.indexOf('if (aired) return')
  const clear = shown.indexOf('setNeedsGesture(false)')
  assert.ok(clear >= 0 && clear < guard, 'needsGesture must clear before the aired guard')
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

  // The two Play paths do exactly two things each.
  const kick = src.slice(src.indexOf('const kickFromGesture'), src.indexOf('const markReady'))
  assert.match(kick, /player\?\.play\?\.\(\)/)
  assert.doesNotMatch(kick, /setBoot|onRetry|iframeSrc|pin\.current/)

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

test('a missing Stream SDK uncovers the player instead of hiding it forever', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // Everything that lifts the poster used to live behind `if (!Stream) return`,
  // while the iframe played on underneath it — audible, never visible.
  assert.doesNotMatch(src, /if \(!alive \|\| !Stream \|\| !frame\.current\) return/)
  assert.match(src, /if \(!alive \|\| !frame\.current\) return/)
  assert.match(src, /if \(!Stream\) \{\s*\n\s*setReady\(true\)/)
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
