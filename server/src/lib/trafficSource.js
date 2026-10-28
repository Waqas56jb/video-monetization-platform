/**
 * Traffic source as stored on a payment.
 *
 * The browser classifies the visit (client/src/lib/trafficSource.js); this only
 * makes sure what reaches the database is one of a known set of channels and
 * short, harmless strings — the payload comes from the viewer's browser.
 */
export const TRAFFIC_SOURCES = ['whatsapp', 'facebook', 'instagram', 'tiktok', 'twitter', 'youtube', 'telegram', 'search', 'other', 'direct']

const clean = (v, max) => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase().replace(/[^a-z0-9._\-]/g, '').slice(0, max)
  return s || null
}

export function normalizeTrafficSource(input) {
  if (!input || typeof input !== 'object') return { source: null, campaign: null, referrer: null }
  const raw = clean(input.source, 20)
  return {
    source: raw ? (TRAFFIC_SOURCES.includes(raw) ? raw : 'other') : null,
    campaign: clean(input.campaign, 80),
    // A host, never a path: a full referrer URL can carry someone's tokens.
    referrer: clean(String(input.referrer || '').replace(/^[a-z-]+:\/\//i, '').split(/[/?#]/)[0], 120),
  }
}
