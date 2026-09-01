/**
 * useApi, with the data already there.
 *
 * `renderToString` runs no effects, so the real hook always reports
 * `{ data: null, loading: true }` on the server. Every page then renders its
 * loading shell and nothing past it — which is why the first version of this
 * smoke passed against the exact Watch.jsx that had just crashed production.
 * The temporal dead zone sat inside `{needsPayment && …}`, and needsPayment is
 * false while playback is still loading, so the branch short-circuited and the
 * dead reference was never touched.
 *
 * A gate that cannot fail on the bug it was written for is worse than no gate,
 * so this hands the fixture over on the first render. Which fixture is decided
 * by a tag the API stub attaches to the promise it returns — explicit, rather
 * than guessing from call order, which would silently mismatch the day someone
 * adds a fourth request to the page.
 */
export * from '../src/hooks/useApi.js'

export default function useApi(fetcher) {
  let tag = null
  try {
    tag = fetcher?.()?.__smokeTag ?? null
  } catch {
    /* a fetcher that throws is the page's problem, and the render below will
       surface it — swallowing it here would hide exactly what we came for */
  }
  const state = globalThis.__SMOKE__ || {}
  if (tag === 'video' && state.videoError) {
    return { data: null, loading: false, error: state.videoError, isRefetching: false, reload: () => {}, setData: () => {} }
  }
  const data = tag ? state[tag] ?? null : null
  return { data, loading: data == null, error: null, isRefetching: false, reload: () => {}, setData: () => {} }
}
