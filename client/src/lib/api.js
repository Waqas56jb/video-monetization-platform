import { getItem, setItem, removeItem } from './safeStorage'

/**
 * The single door to the backend.
 *
 * Holds the session, attaches the access token, and refreshes it once when the
 * server says it has expired — so a long session never dumps the viewer back
 * on the login screen mid-video.
 */

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

const ACCESS_KEY = 'mtonyo.access'
const REFRESH_KEY = 'mtonyo.refresh'

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/* ------------------------------------------------------------- session */

export const getAccessToken = () => getItem(ACCESS_KEY)
export const getRefreshToken = () => getItem(REFRESH_KEY)

export function saveSession(session) {
  if (!session?.accessToken) return
  setItem(ACCESS_KEY, session.accessToken)
  if (session.refreshToken) setItem(REFRESH_KEY, session.refreshToken)
}

export function clearSession() {
  removeItem(ACCESS_KEY)
  removeItem(REFRESH_KEY)
}

/** Anything that wants to know the session died (e.g. to bounce to /login). */
const listeners = new Set()
export const onSessionExpired = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const announceExpiry = () => listeners.forEach((fn) => fn())

/**
 * Fetch failed before an HTTP status existed. Say that plainly — a host URL
 * and CORS lecture is how a dropped 4G connection used to look like a broken
 * product.
 */
function unreachable(err) {
  if (err?.name === 'AbortError') return err

  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)
  const onLocalhost =
    typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

  return new ApiError(
    local && !onLocalhost
      ? `This site is trying to reach the API at ${BASE}, which only exists on a ` +
        `developer machine. Set VITE_API_URL to the deployed API address and rebuild.`
      : 'We could not reach the server just now. Check your connection and try again.',
    { code: 'NETWORK' }
  )
}

/* ------------------------------------------------------------- request */

let refreshing = null

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  // Collapse parallel 401s into one refresh call.
  refreshing =
    refreshing ||
    fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (res.ok) {
          const { session } = await res.json()
          saveSession(session)
          return session.accessToken
        }

        /**
         * The server has looked at the refresh token and said no. That is a
         * real answer, and the session is genuinely finished.
         */
        clearSession()
        announceExpiry()
        return null
      })
      .catch(() => {
        /**
         * The request never reached the server — offline, a dropped
         * connection, or the page navigating away mid-flight.
         *
         * The session is NOT thrown away here. It used to be, and the effect
         * was that clicking a link while any request was still in the air
         * logged you straight out: the browser aborts the fetch, this ran, and
         * the tokens were gone before the next page had even started. A
         * momentary loss of signal did the same thing. Nothing about a failed
         * connection says the credentials are bad.
         */
        return null
      })
      .finally(() => {
        refreshing = null
      })

  return refreshing
}

async function request(path, { method = 'GET', body, auth = true, retry = true, signal } = {}) {
  const token = auth ? getAccessToken() : null

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw unreachable(err)
  }

  if (res.status === 401 && auth && retry && getRefreshToken()) {
    const fresh = await refreshAccessToken()
    if (fresh) return request(path, { method, body, auth, retry: false, signal })
  }

  if (res.status === 204) return null

  let payload = null
  try {
    payload = await res.json()
  } catch {
    /* some errors carry no body */
  }

  if (!res.ok) {
    const e = payload?.error || {}
    if (res.status === 401) {
      clearSession()
      announceExpiry()
    }
    throw new ApiError(e.message || `Request failed (${res.status})`, {
      status: res.status,
      code: e.code,
      details: e.details,
    })
  }

  return payload
}

/**
 * Send a file.
 *
 * Deliberately not the JSON helper: the browser must set its own multipart
 * boundary on Content-Type, and setting that header by hand produces a request
 * the server cannot parse. Everything else — the token, the 401 refresh, the
 * error shape — works the same way.
 */
async function sendFile(path, file, { field = 'image', method = 'POST' } = {}) {
  const body = new FormData()
  body.append(field, file, file.name)

  const token = getAccessToken()
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    })
  } catch (err) {
    throw unreachable(err)
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const e = payload?.error || {}
    throw new ApiError(e.message || `Upload failed (${res.status})`, { status: res.status, code: e.code })
  }
  return payload
}

/**
 * Two components asking for the same thing at the same moment make one request.
 *
 * The landing page mounts Hero, ForCreators and Testimonials together, and all
 * three independently ask for `/api/stats`. That is three identical requests to
 * one host, on a page that also wants its images from somewhere — and a browser
 * will only keep about six connections open to a host at a time, so the
 * duplicates were competing with the content for the same slots.
 *
 * This is deduplication, not caching. Only requests that are genuinely in
 * flight together are shared; once one settles the next call goes to the
 * network exactly as before. Nothing is held, nothing goes stale, and no
 * component had to change.
 *
 * GET only, no body, and never when the caller passed an AbortSignal — one
 * component unmounting must not cancel a request another one is still waiting
 * on.
 */
const inFlight = new Map()

function dedupedGet(path, opts = {}) {
  if (opts.body !== undefined || opts.signal) return request(path, { ...opts, method: 'GET' })

  // Keyed by token as well: the same path answers differently to a signed-in
  // viewer and an anonymous one.
  const key = `${path}|${(opts.auth === false ? '' : getAccessToken()) || 'anon'}`
  const running = inFlight.get(key)
  if (running) return running

  const pending = request(path, { ...opts, method: 'GET' }).finally(() => inFlight.delete(key))
  inFlight.set(key, pending)
  return pending
}

const get = (path, opts) => dedupedGet(path, opts)
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body })
const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body })
const put = (path, body, opts) => request(path, { ...opts, method: 'PUT', body })
const del = (path, opts) => request(path, { ...opts, method: 'DELETE' })

/** Build a querystring, dropping empty values. */
const qs = (params = {}) => {
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'All' && v !== 'All Access') s.set(k, v)
  })
  const str = s.toString()
  return str ? `?${str}` : ''
}

/* ---------------------------------------------------------------- API */

export const api = {
  health: () => get('/health', { auth: false }),

  /** Public platform figures — no session needed. */
  stats: {
    platform: () => get('/api/stats', { auth: false }),
    topCreators: () => get('/api/stats/top-creators', { auth: false }),
  },

  auth: {
    register: (body) => post('/api/auth/register', body, { auth: false }),
    login: (body) => post('/api/auth/login', body, { auth: false }),
    me: () => get('/api/auth/me'),
    updateProfile: (body) => patch('/api/auth/me', body),
    becomeCreator: () => post('/api/auth/become-creator'),
    logout: () => post('/api/auth/logout'),
    forgotPassword: (email) => post('/api/auth/forgot-password', { email }, { auth: false }),
    checkResetToken: (token) =>
      get(`/api/auth/reset-token?token=${encodeURIComponent(token)}`, { auth: false }),
    resetPassword: (body) => post('/api/auth/reset-password', body, { auth: false }),
    changePassword: (body) => post('/api/auth/change-password', body),
    checkEmail: (email) => post('/api/auth/check-email', { email }, { auth: false }),
    creator: (id) => get(`/api/auth/creators/${id}`, { auth: false }),
  },

  videos: {
    list: (params) => get(`/api/videos${qs(params)}`, { auth: Boolean(getAccessToken()) }),
    categories: () => get('/api/videos/categories', { auth: false }),
    one: (idOrSlug) => get(`/api/videos/${idOrSlug}`, { auth: Boolean(getAccessToken()) }),
    mine: () => get('/api/videos/mine'),
    create: (body) => post('/api/videos', body),
    update: (id, body) => patch(`/api/videos/${id}`, body),
    status: (id) => get(`/api/videos/${id}/status`),
    uploadThumbnail: (id, file) => sendFile(`/api/videos/${id}/thumbnail`, file),
    removeThumbnail: (id) => del(`/api/videos/${id}/thumbnail`),
    /**
     * The Creator Agreement's rights representation is made here, and the
     * server refuses the submission without it.
     */
    submit: (id, body = {}) =>
      post(`/api/videos/${id}/submit`, { confirmRights: body.confirmRights === true }),
    /** Report a video. Works signed out — infringement should not need an account. */
    report: (idOrSlug, body) => post(`/api/videos/${idOrSlug}/report`, body, { auth: Boolean(getAccessToken()) }),
    requestDeletion: (id, reason) => post(`/api/videos/${id}/request-deletion`, { reason }),
    recordView: (id, body) => post(`/api/videos/${id}/view`, body),
  },

  playback: (idOrSlug) => get(`/api/playback/${idOrSlug}/playback`, { auth: Boolean(getAccessToken()) }),

  payments: {
    initiate: (body) => post('/api/payments/initiate', body),
    one: (id) => get(`/api/payments/${id}`),
    mine: () => get('/api/payments'),
    simulate: (id, outcome) => post(`/api/payments/${id}/simulate`, { outcome }),
  },

  library: {
    list: () => get('/api/library'),
    purchases: () => get('/api/library/purchases'),
    entitlement: (videoId) => get(`/api/library/entitlement/${videoId}`),
  },

  earnings: {
    summary: () => get('/api/earnings'),
    transactions: () => get('/api/earnings/transactions'),
    withdrawals: () => get('/api/earnings/withdrawals'),
    requestWithdrawal: (body) => post('/api/earnings/withdrawals', body),
    cancelWithdrawal: (id) => del(`/api/earnings/withdrawals/${id}`),
  },

  share: {
    payload: (id) => get(`/api/share/${id}`, { auth: Boolean(getAccessToken()) }),
    generate: (id) => post(`/api/share/${id}/generate`),
  },

  /**
   * Where the viewer got to, so the video can be picked up again.
   *
   * Stored per viewer per video on the server rather than in the page, so it
   * survives the reload that follows a purchase — which is the whole point:
   * paying must continue the film, not restart it.
   */
  saveProgress: (videoId, seconds) =>
    put(`/api/playback/${videoId}/progress`, { seconds }, { auth: Boolean(getAccessToken()) }),

  ads: {
    /**
     * Every ad break for this video in one call — pre-roll, mid-roll, post-roll.
     *
     * Asked for once, up front, because the player has to know a mid-roll is
     * coming before it reaches the middle. Fetching it on the way past would
     * stall the video at the exact moment the viewer is watching it.
     */
    breaks: (videoId) => get(`/api/ads/breaks/${videoId}`, { auth: Boolean(getAccessToken()) }),
    preroll: (videoId) => get(`/api/ads/preroll/${videoId}`, { auth: Boolean(getAccessToken()) }),
    impression: (body) => post('/api/ads/impression', body, { auth: Boolean(getAccessToken()) }),
  },

  /** Your own account: details, picture, preferences, how you are getting on. */
  account: {
    get: () => get('/api/account'),
    update: (body) => patch('/api/account', body),
    uploadAvatar: (file) => sendFile('/api/account/avatar', file),
    removeAvatar: () => del('/api/account/avatar'),
    analytics: () => get('/api/account/analytics'),
    close: () => post('/api/account/close', { confirm: 'DELETE' }),
  },

  /** Everyone has an inbox: announcements, and news about their own account. */
  inbox: {
    list: (params) => get(`/api/inbox${qs(params)}`),
    unreadCount: () => get('/api/inbox/unread-count'),
    markRead: (ids) => post('/api/inbox/read', ids ? { ids } : {}),
  },

  admin: {
    overview: () => get('/api/admin/overview'),
    activity: () => get('/api/admin/activity'),
    review: (status) => get(`/api/admin/review${qs({ status })}`),
    approve: (id, body) => post(`/api/admin/review/${id}/approve`, body),
    reject: (id, reason) => post(`/api/admin/review/${id}/reject`, { reason }),
    videos: (params) => get(`/api/admin/videos${qs(params)}`),
    updateVideo: (id, body) => patch(`/api/admin/videos/${id}`, body),
    unpublish: (id) => post(`/api/admin/videos/${id}/unpublish`),
    publish: (id) => post(`/api/admin/videos/${id}/publish`),
    removeVideo: (id) => del(`/api/admin/videos/${id}`),
    deletionRequests: () => get('/api/admin/deletion-requests'),
    decideDeletion: (id, body) => post(`/api/admin/deletion-requests/${id}/decide`, body),
    users: (params) => get(`/api/admin/users${qs(params)}`),
    setUserStatus: (id, body) => post(`/api/admin/users/${id}/status`, body),
    creators: () => get('/api/admin/creators'),
    verifyCreator: (id, verified) => post(`/api/admin/creators/${id}/verify`, { verified }),
    setCreatorSplit: (id, splitPercent) => post(`/api/admin/creators/${id}/split`, { splitPercent }),
    payments: (params) => get(`/api/admin/payments${qs(params)}`),
    withdrawals: () => get('/api/admin/withdrawals'),
    decideWithdrawal: (id, body) => post(`/api/admin/withdrawals/${id}/decide`, body),
    revenue: () => get('/api/admin/revenue'),
    settings: () => get('/api/admin/settings'),
    updateSettings: (body) => patch('/api/admin/settings', body),
    audit: (params) => get(`/api/admin/audit${qs(params)}`),
    ads: () => get('/api/admin/ads'),
    createCampaign: (body) => post('/api/admin/ads', body),
    updateCampaign: (id, body) => patch(`/api/admin/ads/${id}`, body),
    runPremiereExpiry: () => post('/api/admin/jobs/premiere-expiry'),
  },
}

/**
 * Absolute URL for media the API serves on our behalf.
 *
 * Thumbnails come back as a relative path because the API signs them per
 * request — a signed URL expires, so it cannot be stored, and the apps live on
 * a different origin from the API. This turns one stored value into the right
 * address for whichever app is asking.
 */
export const mediaUrl = (path) =>
  !path ? null : /^https?:\/\//i.test(path) ? path : `${BASE}${path}`

export { BASE as API_BASE }
export default api
