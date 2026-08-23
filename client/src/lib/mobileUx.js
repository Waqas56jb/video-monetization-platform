import { isTouchMobile } from '@/lib/socialShare'

/** Re-export for page-size and touch detection. */
export { isTouchMobile, isPhone } from '@/lib/socialShare'

export function explorePageSize() {
  if (typeof window === 'undefined') return 24
  return isTouchMobile() ? 12 : 24
}

export function idle(cb) {
  if (typeof requestIdleCallback !== 'undefined') {
    return requestIdleCallback(cb, { timeout: 2000 })
  }
  return setTimeout(cb, 0)
}

export function cancelIdle(id) {
  if (typeof cancelIdleCallback !== 'undefined' && typeof requestIdleCallback !== 'undefined') {
    cancelIdleCallback(id)
  } else {
    clearTimeout(id)
  }
}
