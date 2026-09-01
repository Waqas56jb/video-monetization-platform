/**
 * Stands in for `@/lib/api` during the render smoke.
 *
 * The real module reads `import.meta.env` and talks to the network. Neither
 * belongs in a check whose only question is "does this component throw when
 * React calls it", and a smoke that made real requests would fail for reasons
 * that have nothing to do with the code under test.
 *
 * `useApi` calls the fetcher and keeps loading/error/data, so what each page
 * sees is decided by `globalThis.__SMOKE__` — set per case by the entry file.
 * A promise that never settles is what "still pending" means to those hooks.
 */
/* Each request tags its promise so the useApi stub knows which fixture the
   caller is asking for, without depending on the order the page calls them in. */
const tag = (name, value) => {
  const p = value == null ? new Promise(() => {}) : Promise.resolve(value)
  p.__smokeTag = name
  return p
}
const pending = () => new Promise(() => {})
const give = (value) => (value == null ? pending() : Promise.resolve(value))

const videoResponse = () => {
  const s = globalThis.__SMOKE__ || {}
  if (s.videoError) return Promise.reject(new Error(s.videoError))
  return give(s.video)
}

export const api = {
  videos: {
    one: () => tag('video', (globalThis.__SMOKE__ || {}).video),
    list: () => Promise.resolve({ items: [], total: 0 }),
    related: () => Promise.resolve({ items: [] }),
    categories: () => Promise.resolve({ categories: [] }),
    view: () => Promise.resolve(null),
    mine: () => Promise.resolve({ items: [] }),
  },
  playback: () => tag('playback', (globalThis.__SMOKE__ || {}).playback),
  ads: { breaks: () => tag('ads', { breaks: [] }), preroll: () => Promise.resolve({ enabled: false }), impression: () => Promise.resolve(null) },
  share: { one: () => Promise.resolve(null), generate: () => Promise.resolve(null) },
  library: { list: () => Promise.resolve({ items: [] }), purchases: () => Promise.resolve({ items: [] }), entitlement: () => Promise.resolve({ owned: false }) },
  stats: { platform: () => Promise.resolve({}), topCreators: () => Promise.resolve({ creators: [] }) },
  auth: { me: () => pending(), creators: { one: () => Promise.resolve(null) } },
  creators: { one: () => Promise.resolve(null), storefront: () => Promise.resolve(null), follow: () => Promise.resolve(null) },
  earnings: { summary: () => Promise.resolve({}), transactions: () => Promise.resolve({ items: [] }), withdrawals: () => Promise.resolve({ items: [] }) },
  payments: { initiate: () => Promise.resolve(null), one: () => Promise.resolve(null) },
  settings: () => Promise.resolve({}),
  health: () => Promise.resolve({ ok: true }),
}

export default api

export const getAccessToken = () => null
export const getRefreshToken = () => null
export const saveSession = () => {}
export const clearSession = () => {}
export const onSessionExpired = () => () => {}
export class ApiError extends Error {}
export const mediaUrl = (u) => u || ''
