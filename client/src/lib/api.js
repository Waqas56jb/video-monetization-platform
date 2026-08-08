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
        if (!res.ok) throw new Error('refresh failed')
        const { session } = await res.json()
        saveSession(session)
        return session.accessToken
      })
      .catch(() => {
        clearSession()
        announceExpiry()
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
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      { code: 'NETWORK' }
    )
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

const get = (path, opts) => request(path, { ...opts, method: 'GET' })
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body })
const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body })
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
    submit: (id) => post(`/api/videos/${id}/submit`),
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

  ads: {
    preroll: (videoId) => get(`/api/ads/preroll/${videoId}`, { auth: Boolean(getAccessToken()) }),
    impression: (body) => post('/api/ads/impression', body, { auth: Boolean(getAccessToken()) }),
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

export { BASE as API_BASE }
export default api
