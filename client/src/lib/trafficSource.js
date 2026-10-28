/**
 * Where did this viewer come from? (Milestone 3: social → payment.)
 *
 * Read once per page load, before the router rewrites anything, and sent with
 * a payment so the admin can see which channel sells. Precedence:
 *
 *   1. an explicit tag on the link: utm_source / via / ref
 *   2. the in-app browser that opened it (Facebook, Instagram, TikTok…)
 *   3. the referrer — including Android's android-app://com.whatsapp/
 *   4. otherwise "direct"
 *
 * The last non-direct source is kept for 7 days, so a viewer who arrives from
 * WhatsApp and pays the next day, or after signing up, is still credited to
 * WhatsApp. A plain reload or in-site navigation never overwrites it.
 *
 * Reporting only: nothing here decides access, and storage failures (private
 * mode, blocked site data) just mean "not recorded".
 */
const KEY = 'mtonyo.trafficSource'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

const ALIASES = [
  ['whatsapp', /^(wa|whatsapp|whats_app|wa_status|status)$/],
  ['facebook', /^(fb|facebook|meta|messenger|fbm)$/],
  ['instagram', /^(ig|insta|instagram)$/],
  ['tiktok', /^(tt|tiktok|tik_tok)$/],
  ['twitter', /^(x|tw|twitter)$/],
  ['youtube', /^(yt|youtube)$/],
  ['telegram', /^(tg|telegram)$/],
  ['search', /^(google|bing|search|duckduckgo)$/],
]

const HOSTS = [
  ['whatsapp', /(^|\.)whatsapp\.(com|net)$|^wa\.me$|^com\.whatsapp(\.w4b)?$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$|^com\.facebook\./],
  ['instagram', /(^|\.)instagram\.com$|^com\.instagram\./],
  ['tiktok', /(^|\.)(tiktok\.com|tiktokv\.com)$|^com\.(zhiliaoapp\.musically|ss\.android\.ugc)/],
  ['twitter', /(^|\.)(twitter\.com|x\.com|t\.co)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['telegram', /(^|\.)(telegram\.org|t\.me)$|^org\.telegram\./],
  ['search', /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com)$|^com\.google\.android\.(gm|googlequicksearchbox)$/],
]

const IN_APP = [
  ['instagram', /Instagram/i],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS|MessengerForiOS/i],
  ['tiktok', /BytedanceWebview|musical_ly|TikTok/i],
  ['whatsapp', /WhatsApp/i],
  ['telegram', /Telegram/i],
]

const tag = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 80) || null

export function classifyVisit({ search = '', referrer = '', userAgent = '', origin = '' } = {}) {
  const params = new URLSearchParams(search)
  const campaign = tag(params.get('utm_campaign'))
  const explicit = tag(params.get('utm_source') || params.get('via') || params.get('ref'))

  let refHost = null
  if (referrer) {
    try {
      const u = new URL(referrer)
      // android-app://com.whatsapp/ → "com.whatsapp"
      refHost = (u.protocol === 'android-app:' ? u.hostname || u.pathname.replace(/^\/+/, '').split('/')[0] : u.hostname).toLowerCase() || null
      if (origin && u.origin === origin) return { internal: true }
    } catch {
      refHost = null
    }
  }

  if (explicit) {
    const known = ALIASES.find(([, re]) => re.test(explicit))?.[0]
    return { source: known || 'other', campaign: campaign || (known ? null : explicit), referrer: refHost }
  }
  const app = IN_APP.find(([, re]) => re.test(userAgent))?.[0]
  if (app) return { source: app, campaign, referrer: refHost }
  if (refHost) {
    const fromHost = HOSTS.find(([, re]) => re.test(refHost))?.[0]
    return { source: fromHost || 'other', campaign, referrer: refHost }
  }
  return { source: 'direct', campaign, referrer: null }
}

function read(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || 'null')
    return v && Date.now() - v.at < TTL_MS ? v : null
  } catch {
    return null
  }
}

/** Call once, at boot. */
export function captureTrafficSource(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return null
  let storage = null
  try { storage = win.localStorage } catch { storage = null }
  const visit = classifyVisit({
    search: win.location?.search || '',
    referrer: win.document?.referrer || '',
    userAgent: win.navigator?.userAgent || '',
    origin: win.location?.origin || '',
  })
  const kept = storage ? read(storage) : null
  // A reload, a link inside the site, or a later direct visit keeps the channel that brought them.
  if (visit.internal || (visit.source === 'direct' && kept)) return kept
  const next = { ...visit, at: Date.now() }
  try { storage?.setItem(KEY, JSON.stringify(next)) } catch { /* not recorded */ }
  return next
}

/** What to send with a payment (or null). */
export function currentTrafficSource(win = typeof window !== 'undefined' ? window : null) {
  let storage = null
  try { storage = win?.localStorage } catch { storage = null }
  const v = storage ? read(storage) : null
  return v ? { source: v.source, campaign: v.campaign || null, referrer: v.referrer || null } : null
}
