/**
 * When a warmed payload may still be used.
 *
 * This lives in its own module with no imports so it can be tested for real.
 * `prefetchWatch.js` reaches `@/lib/api`, which reaches Vite's `import.meta.env`
 * and the `@` alias, so nothing there can be imported by `node --test` — the
 * rule would have had to be asserted by matching source text, which is exactly
 * the kind of test that keeps passing after the behaviour breaks.
 *
 * Two conditions, and both matter:
 *
 * **Freshness.** A preview playback token lives fifteen minutes. Cards warm on
 * scroll, so browsing for a quarter of an hour and then tapping a title handed
 * the player a JWT that had already expired.
 *
 * **Identity.** `/api/playback/:id/playback` answers per viewer: a preview to a
 * stranger, the full film to whoever bought it. Keyed by video alone, a payload
 * fetched while signed out was served ten minutes later to the owner — Unlock on
 * a video they had paid for. The other direction is worse: one viewer's *full*
 * signed URL, still in the map, handed to the next account to sign in on that
 * browser.
 */
export const WARM_TTL_MS = 10 * 60 * 1000

/**
 * @param entry   `{ at, auth }` recorded when the payload was warmed
 * @param now     current epoch ms
 * @param auth    the current viewer's access token, or null when signed out
 */
export function warmEntryUsable(entry, now, auth) {
  if (!entry) return false
  /* Strict: a refreshed token is a new string and discards the entry. That
     costs one round trip and is the safe direction to be wrong in. */
  if (entry.auth !== auth) return false
  return now - entry.at < WARM_TTL_MS
}
