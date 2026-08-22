import { getItem, setItem } from './safeStorage.js'

const KEY = 'mtonyo.accountSide'

/** Which dashboard the person opened: Watch (viewer) or Create (creator). */
export function getAccountSide() {
  return getItem(KEY) === 'creator' ? 'creator' : 'viewer'
}

export function setAccountSide(side) {
  setItem(KEY, side === 'creator' ? 'creator' : 'viewer')
}

export function panelRoleFor(accountRole, side) {
  const real = accountRole || 'viewer'
  if (real === 'admin' || real === 'creator' || real === 'sub_admin') {
    return side === 'viewer' ? 'viewer' : 'creator'
  }
  return 'viewer'
}

export function homeTabFor(panel) {
  return panel === 'creator' ? 'overview' : 'library'
}

export function dashboardPath(panel) {
  return `/dashboard?tab=${homeTabFor(panel)}`
}

export function sideFromSearch(search) {
  const value = new URLSearchParams(search || '').get('side')
  return value === 'creator' ? 'creator' : value === 'viewer' ? 'viewer' : null
}
