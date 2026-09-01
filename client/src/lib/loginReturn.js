import { authUrl } from './nextPath.js'

/**
 * Where the header's "Log in" should send someone, from wherever they stand.
 *
 * The Unlock button already carried the destination (`Watch.jsx`), but the two
 * "Log in" buttons in the chrome — desktop header and mobile menu — went to a
 * bare `/login`. A viewer halfway through a preview who used the header instead
 * of Unlock signed in successfully and arrived at the dashboard, with no route
 * back to the video they were watching. That is the second half of the client's
 * "it forgets where I was".
 *
 * The landing page is the one exception. There is nothing there to return to,
 * and "Log in" from the front door has always meant "take me to my account" —
 * so it keeps the dashboard. Everywhere else, signing in is an interruption and
 * finishing it puts you back.
 *
 * Alternative considered: carry the destination from every page with no
 * exception, which is a shorter rule. Rejected because it changes a behaviour
 * nobody has complained about, on the one page where the current one is right.
 */
export function loginHref(location, extra = {}) {
  const path = String(location?.pathname || '/')
  const search = String(location?.search || '')
  const here = path === '/' ? null : `${path}${search}`
  return authUrl('login', here, extra)
}
