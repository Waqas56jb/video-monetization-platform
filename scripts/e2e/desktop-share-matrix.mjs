/**
 * Desktop WhatsApp share — the acceptance matrix, against production.
 *
 * Every request shape a desktop client has been observed (or suspected) to
 * fetch a link preview with, run against a FRESH url (`?v=<now>` — WhatsApp
 * caches a preview per exact URL for days, so a URL it has already seen tells
 * you nothing). For each: which document we served, the first-bytes offsets of
 * the four og: tags WhatsApp reads, whether og:title is the real DB title and
 * og:description names the creator; then the og:image fetched through the same
 * origins — status, type, size, redirect, CORS, time.
 *
 * RAW SOCKETS, NOT fetch(). Node's fetch() quietly adds `sec-fetch-mode: cors`,
 * `accept`, `accept-language` and `accept-encoding` to every request (captured
 * live, 2026-09-14), and `sec-fetch-mode` is the exact header the server
 * branches on — so a "bare" request built with fetch() is not bare, and the
 * first version of this matrix reported eight crawler documents for what were
 * really eight cors fetches. Every request below goes out over node:https with
 * precisely the headers listed and nothing else, and the headers actually sent
 * are printed as evidence.
 *
 *   node scripts/e2e/desktop-share-matrix.mjs
 *   SLUGS=a,b node scripts/e2e/desktop-share-matrix.mjs
 *
 * Exit code is the number of failed checks, so CI can gate on it.
 */
import https from 'node:https'

const WEB = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const SLUGS = (process.env.SLUGS || 'ugali-samaki-sunday-cooking,how-to-cook-pilau-properly')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const HEAD_BYTES = 10 * 1024
const IMAGE_MAX_BYTES = 300 * 1024
const IMAGE_MAX_MS = 1000

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const ELECTRON_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) WhatsApp/2.2412.54 Chrome/124.0.6367.243 Electron/30.0.9 Safari/537.36'
const ELECTRON_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) WhatsApp/2.2412.54 Chrome/124.0.6367.243 Electron/30.0.9 Safari/537.36'
const WA_ORIGIN = 'https://web.whatsapp.com'

/**
 * The shapes. `preflight` runs an OPTIONS first, the way a browser would.
 * `expectDoc` is what the server is supposed to answer with; every shape must
 * still carry complete og: tags in its first bytes whichever document it is.
 */
const SHAPES = [
  {
    id: 'i-a',
    label: 'WhatsApp crawler UA, Web/Desktop (N)',
    expectDoc: 'crawler',
    headers: { 'user-agent': 'WhatsApp/2.23.20.0 N' },
  },
  {
    id: 'i-b',
    label: 'WhatsApp crawler UA, Android (A)',
    expectDoc: 'crawler',
    headers: { 'user-agent': 'WhatsApp/2.24.15.78 A' },
  },
  {
    id: 'i-c',
    label: 'WhatsApp crawler UA, iOS (I)',
    expectDoc: 'crawler',
    headers: { 'user-agent': 'WhatsApp/2.24.15.78 I' },
  },
  {
    id: 'ii',
    label: 'browser-side fetch from web.whatsapp.com (preflight + cors GET)',
    expectDoc: 'crawler',
    preflight: true,
    headers: {
      'user-agent': CHROME_MAC,
      origin: WA_ORIGIN,
      referer: `${WA_ORIGIN}/`,
      accept: '*/*',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
    },
  },
  {
    id: 'iii-a',
    label: 'Electron / WhatsApp Desktop UA (Mac), no Sec-Fetch at all',
    expectDoc: null,
    headers: { 'user-agent': ELECTRON_MAC, accept: '*/*' },
  },
  {
    id: 'iii-b',
    label: 'Electron / WhatsApp Desktop UA (Windows), fetch-shaped Sec-Fetch',
    expectDoc: 'crawler',
    headers: {
      'user-agent': ELECTRON_WIN,
      accept: '*/*',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'none',
    },
  },
  {
    id: 'iv-a',
    label: 'bare GET, curl-like UA, no Sec-Fetch, no Accept',
    expectDoc: null,
    headers: { 'user-agent': 'curl/8.4.0' },
  },
  {
    id: 'iv-b',
    label: 'bare GET, ordinary Chrome UA, no Sec-Fetch (Accept */*)',
    expectDoc: null,
    headers: { 'user-agent': CHROME_MAC, accept: '*/*' },
  },
  {
    id: 'nav',
    label: 'a real browser navigation (the SPA shell path)',
    expectDoc: 'shell',
    headers: {
      'user-agent': CHROME_MAC,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'upgrade-insecure-requests': '1',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
    },
  },
]

const IMAGE_ORIGINS = [
  { id: 'bot', label: 'no Origin (native crawler)', headers: { 'user-agent': 'WhatsApp/2.23.20.0 N' } },
  {
    id: 'web',
    label: 'Origin: web.whatsapp.com (preflight + cors GET)',
    preflight: true,
    headers: {
      'user-agent': CHROME_MAC,
      origin: WA_ORIGIN,
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
    },
  },
  { id: 'electron', label: 'Electron UA, no Sec-Fetch', headers: { 'user-agent': ELECTRON_MAC } },
]

/* ------------------------------------------------------------------ util */

let failures = 0
const fail = (msg) => {
  failures += 1
  console.log(`      FAIL  ${msg}`)
}
const ok = (msg) => console.log(`      ok    ${msg}`)
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

/** Exactly these headers, nothing added. Never follows a redirect. */
function raw(url, { method = 'GET', headers = {} } = {}) {
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const req = https.request(
      { method, host: u.hostname, path: u.pathname + u.search, headers, agent: false },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            buf: Buffer.concat(chunks),
            ms: Math.round(performance.now() - t0),
            sent: req.getHeaders(),
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const attr = (html, re) => {
  const m = html.match(re)
  return m ? { value: decode(m[1]), offset: Buffer.byteLength(html.slice(0, m.index)) } : null
}

function ogTags(html) {
  const head = html.slice(0, HEAD_BYTES)
  const tag = (prop) =>
    attr(head, new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
    attr(head, new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${prop}["']`, 'i'))
  return {
    title: tag('og:title'),
    description: tag('og:description'),
    image: tag('og:image'),
    url: tag('og:url'),
    htmlTitle: attr(head, /<title>([^<]*)<\/title>/i),
  }
}

function printHeaders(h, keys) {
  for (const k of keys) if (h[k] != null) console.log(`      ${k}: ${h[k]}`)
}

const printSent = (sent) => console.log(`    sent: ${JSON.stringify(sent)}`)

/* --------------------------------------------------------------- probes */

async function expected(slug) {
  const r = await fetch(`${API}/api/public/videos/${slug}/share-meta`, {
    headers: { accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`share-meta ${r.status} for ${slug}`)
  return r.json()
}

async function preflight(url, origin, method = 'GET') {
  const r = await raw(url, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': method,
      'access-control-request-headers': 'content-type',
    },
  })
  console.log(`    OPTIONS -> ${r.status} in ${r.ms}ms`)
  printHeaders(r.headers, [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-max-age',
  ])
  check(r.status === 204 || r.status === 200, `preflight status ${r.status}`)
  check(r.headers['access-control-allow-origin'] === '*', 'preflight ACAO *')
  check(/GET/.test(r.headers['access-control-allow-methods'] || ''), 'preflight allows GET')
}

async function probeDocument(slug, want, shape) {
  const url = `${WEB}/watch/${slug}?v=${Date.now()}-${shape.id}`
  console.log(`\n  [${shape.id}] ${shape.label}`)
  console.log(`    GET ${url}`)
  if (shape.preflight) await preflight(url, shape.headers.origin)

  const r = await raw(url, { headers: shape.headers })
  printSent(r.sent)
  const html = r.buf.toString('utf8')
  console.log(`    -> ${r.status} in ${r.ms}ms, ${r.buf.length} bytes`)
  printHeaders(r.headers, [
    'content-type',
    'x-doc',
    'x-crawler',
    'x-build',
    'x-vercel-cache',
    'x-vercel-id',
    'cache-control',
    'vary',
    'access-control-allow-origin',
  ])

  check(r.status === 200, `status ${r.status}`)
  check(/text\/html/.test(r.headers['content-type'] || ''), 'content-type text/html')
  check(r.headers['access-control-allow-origin'] === '*', 'ACAO * on the document')
  if (shape.expectDoc) check(r.headers['x-doc'] === shape.expectDoc, `served the ${shape.expectDoc} document`)
  else ok(`served the ${r.headers['x-doc']} document (either is acceptable if the tags below hold)`)
  if (r.headers['x-doc'] === 'shell') {
    check(/<div id="root">/.test(html), 'the shell still boots the app (<div id="root">)')
  }

  const og = ogTags(html)
  for (const [k, v] of Object.entries(og)) {
    console.log(
      `      ${k.padEnd(12)} @${v ? String(v.offset).padStart(5) : '    -'}  ${v ? JSON.stringify(v.value) : '(absent in first 10KB)'}`
    )
  }
  check(og.title && og.title.value === want.title, `og:title is the real DB title (${JSON.stringify(want.title)})`)
  check(
    og.description && want.creator && og.description.value.includes(want.creator),
    `og:description names the creator (${JSON.stringify(want.creator)})`
  )
  check(og.image && /^https:\/\//.test(og.image.value), 'og:image is absolute https')
  check(og.url && og.url.value === `${WEB}/watch/${slug}`, `og:url is the canonical /watch/${slug}`)
  const offsets = Object.values(og)
    .filter(Boolean)
    .map((v) => v.offset)
  const last = offsets.length ? Math.max(...offsets) : Infinity
  check(last < HEAD_BYTES, `all og tags inside the first 10KB (last at byte ${last})`)

  return { doc: r.headers['x-doc'], image: og.image?.value || null, ms: r.ms, cache: r.headers['x-vercel-cache'] }
}

async function probeImage(imageUrl, origin) {
  console.log(`\n  [image/${origin.id}] ${origin.label}`)
  console.log(`    GET ${imageUrl}`)
  if (origin.preflight) await preflight(imageUrl, origin.headers.origin)

  const r = await raw(imageUrl, { headers: origin.headers })
  printSent(r.sent)
  console.log(`    -> ${r.status} in ${r.ms}ms, ${r.buf.length} bytes`)
  printHeaders(r.headers, [
    'content-type',
    'content-length',
    'location',
    'x-share-card',
    'x-bucket',
    'x-vercel-cache',
    'x-vercel-id',
    'cache-control',
    'access-control-allow-origin',
  ])
  check(r.status === 200, `status ${r.status} (no redirect)`)
  check(!r.headers.location, 'no Location header')
  check(/^image\/jpeg/.test(r.headers['content-type'] || ''), 'content-type image/jpeg')
  check(r.buf.length > 1000 && r.buf.length < IMAGE_MAX_BYTES, `size ${r.buf.length} bytes (< ${IMAGE_MAX_BYTES})`)
  check(r.buf[0] === 0xff && r.buf[1] === 0xd8, 'bytes begin with a JPEG SOI marker')
  check(r.headers['access-control-allow-origin'] === '*', 'ACAO *')
  check(r.ms < IMAGE_MAX_MS, `served in ${r.ms}ms (< ${IMAGE_MAX_MS}ms) [edge: ${r.headers['x-vercel-cache']}]`)
  return r
}

/* ----------------------------------------------------------------- main */

console.log(`Desktop share matrix · ${WEB} · ${new Date().toISOString()}`)
const timings = []

for (const slug of SLUGS) {
  const want = await expected(slug)
  console.log(`\n=== ${slug}`)
  console.log(`    expected title:   ${JSON.stringify(want.title)}`)
  console.log(`    expected creator: ${JSON.stringify(want.creator)}`)

  const images = new Set()
  const docs = {}
  for (const shape of SHAPES) {
    const out = await probeDocument(slug, want, shape)
    docs[shape.id] = out.doc
    timings.push({ slug, what: `doc ${shape.id}`, ms: out.ms, cache: out.cache })
    if (out.image) images.add(out.image)
  }

  console.log(`\n  documents served: ${JSON.stringify(docs)}`)
  console.log(`  distinct og:image urls: ${images.size}`)
  for (const image of images) {
    for (const origin of IMAGE_ORIGINS) {
      const r = await probeImage(image, origin)
      timings.push({ slug, what: `image ${origin.id}`, ms: r.ms, cache: r.headers['x-vercel-cache'] })
    }
  }
}

console.log('\n### timings (ms, with the edge cache status the response reported)')
for (const t of timings) console.log(`  ${t.slug.padEnd(32)} ${t.what.padEnd(16)} ${String(t.ms).padStart(6)}  ${t.cache || '-'}`)

console.log(`\n${failures ? `${failures} FAILED CHECK(S)` : 'ALL CHECKS PASSED'}`)
process.exit(failures ? 1 : 0)
