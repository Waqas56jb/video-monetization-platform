/**
 * The single door to the backend, for the control centre.
 *
 * Holds the session, attaches the access token, and refreshes it once when the
 * server says it has expired — so a moderator working through a review queue is
 * never dumped back on the login screen halfway down it.
 */

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

// Deliberately different keys from the public app: if both are ever served from
// one origin, an admin session and a viewer session must not overwrite each
// other.
const ACCESS_KEY = 'mtonyo.admin.access'
const REFRESH_KEY = 'mtonyo.admin.refresh'

/**
 * Safari in Private Browsing throws on the mere act of touching localStorage,
 * so every access is wrapped. Losing the session is survivable; a white screen
 * on the login page is not.
 */
const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

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

/**
 * Memory is the live session; localStorage is a backup.
 * A rejected storage write used to make the first login look like it failed.
 */
let accessMem = store.get(ACCESS_KEY)
let refreshMem = store.get(REFRESH_KEY)

export const getAccessToken = () => accessMem || store.get(ACCESS_KEY)
export const getRefreshToken = () => refreshMem || store.get(REFRESH_KEY)

export function saveSession(session) {
  if (!session?.accessToken) return
  accessMem = session.accessToken
  if (session.refreshToken) refreshMem = session.refreshToken
  store.set(ACCESS_KEY, session.accessToken)
  if (session.refreshToken) store.set(REFRESH_KEY, session.refreshToken)
}

export function clearSession() {
  accessMem = null
  refreshMem = null
  store.remove(ACCESS_KEY)
  store.remove(REFRESH_KEY)
}

const listeners = new Set()
export const onSessionExpired = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const announceExpiry = () => listeners.forEach((fn) => fn())

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
    if (err.name === 'AbortError') throw err

    /**
     * A failed fetch tells us nothing about why, so say what we tried.
     *
     * The unhelpful version of this message cost real time: a deployed site
     * was pointed at http://localhost:4000 because VITE_API_URL was never set
     * on the host, and every screen simply said "check your connection" — which
     * sent everyone looking at their wifi instead of at the build.
     */
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)
    const onLocalhost =
      typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

    throw new ApiError(
      local && !onLocalhost
        ? `This site is trying to reach the API at ${BASE}, which only exists on a ` +
          `developer machine. Set VITE_API_URL to the deployed API address and rebuild.`
        : `Cannot reach the API at ${BASE}. Either it is not running, or it is ` +
          `refusing requests from ${typeof window !== 'undefined' ? window.location.origin : 'this page'} ` +
          `— a blocked origin looks exactly like an offline server from in here.`,
      { code: 'NETWORK' }
    )
  }

  const tokenStillCurrent = !token || getAccessToken() === token

  if (res.status === 401 && auth && retry) {
    if (!tokenStillCurrent) {
      return request(path, { method, body, auth, retry: false, signal })
    }
    if (getRefreshToken()) {
      const fresh = await refreshAccessToken()
      if (fresh) return request(path, { method, body, auth, retry: false, signal })
    }
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
    if (res.status === 401 && auth && tokenStillCurrent) {
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

const get = (path, opts) => request(path, { ...opts, method: 'GET' })
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body })
const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body })
/* Replacing a whole set rather than amending one — permissions are saved as
   "what they hold now", which is a PUT. */
const put = (path, body, opts) => request(path, { ...opts, method: 'PUT', body })
const del = (path, opts) => request(path, { ...opts, method: 'DELETE' })

/** Build a querystring, dropping empty values and the "All" filter defaults. */
const qs = (params = {}) => {
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    if (typeof v === 'string' && /^All\b/.test(v)) return
    s.set(k, v)
  })
  const str = s.toString()
  return str ? `?${str}` : ''
}

/* ---------------------------------------------------------------- API */

export const api = {
  health: () => get('/health', { auth: false }),

  auth: {
    login: (body) => post('/api/auth/login', body, { auth: false }),
    me: () => get('/api/auth/me'),
    logout: () => post('/api/auth/logout'),
    changePassword: (body) => post('/api/auth/change-password', body),
    // Used by a sub-admin activating their account from an invitation link.
    checkResetToken: (token) =>
      get(`/api/auth/reset-token?token=${encodeURIComponent(token)}`, { auth: false }),
    resetPassword: (body) => post('/api/auth/reset-password', body, { auth: false }),
  },

  /** Staff work: the inbox, announcements, and the moderation team. */
  staff: {
    notifications: (params) => get(`/api/staff/notifications${qs(params)}`),
    unreadCount: () => get('/api/staff/notifications/unread-count'),
    markRead: (ids) => post('/api/staff/notifications/read', ids ? { ids } : {}),

    announcements: (params) => get(`/api/staff/announcements${qs(params)}`),
    announce: (body) => post('/api/staff/announcements', body),
    deleteAnnouncement: (id) => del(`/api/staff/announcements/${id}`),

    subAdmins: () => get('/api/staff/sub-admins'),
    createSubAdmin: (body) => post('/api/staff/sub-admins', body),
    resendInvite: (id) => post(`/api/staff/sub-admins/${id}/resend-invite`),
    setSubAdminStatus: (id, status) => post(`/api/staff/sub-admins/${id}/status`, { status }),
    removeSubAdmin: (id) => del(`/api/staff/sub-admins/${id}`),

    updateEmail: (body) => patch('/api/staff/account/email', body),
    updateProfile: (body) => patch('/api/staff/account/profile', body),
  },

  /**
   * Watch a video that is being reviewed.
   *
   * Staff get full playback from the server — deciding whether something may
   * be published means watching it, and until this existed the review queue
   * asked for a verdict on a file nobody could open.
   */
  playback: (idOrSlug) => get(`/api/playback/${idOrSlug}/playback`),

  admin: {
    overview: () => get('/api/admin/overview'),
    activity: () => get('/api/admin/activity'),

    review: (status) => get(`/api/admin/review${qs({ status })}`),
    approve: (id, body) => post(`/api/admin/review/${id}/approve`, body),
    reject: (id, reason) => post(`/api/admin/review/${id}/reject`, { reason }),
    /** Send it back for a correction without discarding the submission. */
    requestChanges: (id, note) => post(`/api/admin/review/${id}/request-changes`, { note }),
    /**
     * Record a refund: marks the payment, ends the entitlement and reverses the
     * creator's credit. It does not move money — that is done by hand in the
     * provider's portal.
     */
    refundPayment: (id, reason) => post(`/api/admin/payments/${id}/refund`, { reason }),
    /** What viewers have flagged, and deciding it. */
    reports: (params) => get(`/api/admin/reports${qs(params)}`),
    /** Exactly which modules a sub-admin may open. Administrator only. */
    setPermissions: (id, modules) => put(`/api/staff/sub-admins/${id}/permissions`, { modules }),
    decideReport: (id, body) => post(`/api/admin/reports/${id}/decide`, body),
    /** Is outbound email actually working, or only configured? */
    emailHealth: () => get('/api/admin/health/email'),
    sendTestEmail: () => post('/api/admin/health/email'),

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
    deleteCampaign: (id) => del(`/api/admin/ads/${id}`),
    /** Ask Cloudflare for somewhere to put the advert, then send it there. */
    adUploadTicket: (id) => post(`/api/admin/ads/${id}/upload`, {}),
    adMedia: (id) => get(`/api/admin/ads/${id}/media`),

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
