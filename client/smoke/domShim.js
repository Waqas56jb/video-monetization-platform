/**
 * The smallest browser these components will accept.
 *
 * Not jsdom — a few dozen lines of stubs, because the question is only "does the
 * component body throw when React calls it", and every one of these is reached
 * during render or in a layout effect that React runs on the server anyway.
 * Anything genuinely missing surfaces as a clear "x is not a function" rather
 * than being silently papered over.
 */
const noop = () => {}
const el = () => ({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, removeAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
  addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  contains: () => false, focus: noop, blur: noop, scrollTo: noop, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
  children: [], parentNode: null, insertBefore: noop, remove: noop,
})
const doc = {
  ...el(),
  documentElement: el(), head: el(), body: el(),
  createElement: el, createTextNode: () => ({}), getElementById: () => null,
  visibilityState: 'visible', title: '', cookie: '', readyState: 'complete',
}
globalThis.document = globalThis.document || doc
globalThis.window = globalThis.window || globalThis
/* Node defines `navigator` as a getter-only global, so Object.assign throws on
   it. Define each one individually and skip whatever already exists. */
const define = (name, value) => {
  if (name in globalThis && globalThis[name] != null) return
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  } catch {
    /* a getter-only global that is already present is fine — we wanted a value
       there and there is one */
  }
}

define('navigator', { userAgent: 'smoke', share: undefined, clipboard: { writeText: noop } })
define('location', { state: null, hash: '', href: 'https://smoke.test/watch/live-at-arusha-full-set', pathname: '/watch/live-at-arusha-full-set', search: '', origin: 'https://smoke.test' })
define('localStorage', { getItem: () => null, setItem: noop, removeItem: noop, clear: noop })
define('sessionStorage', { getItem: () => null, setItem: noop, removeItem: noop, clear: noop })
define('matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }))
define('requestAnimationFrame', (f) => setTimeout(f, 0))
define('cancelAnimationFrame', noop)
define('requestIdleCallback', (f) => setTimeout(f, 0))
define('cancelIdleCallback', noop)
define('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
define('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
define('MutationObserver', class { observe() {} disconnect() {} })
define('history', { state: null, length: 1, pushState: noop, replaceState: noop, back: noop, forward: noop, go: noop })
define('scrollTo', noop)
define('getComputedStyle', () => ({ getPropertyValue: () => '' }))

export default true
