import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * A back button that actually goes back.
 *
 * The obvious way to write one is `navigate('/dashboard')`, and it is wrong in
 * a way that is easy to miss: pushing a route is not returning to one. It
 * discards whatever the person was looking at and drops them on that page's
 * default — which is why leaving the dashboard for Explore and pressing Back
 * landed on Overview rather than the tab they had left. The button said back
 * and behaved like a link.
 *
 * `navigate(-1)` is the real thing, but it cannot be used unconditionally:
 * somebody who arrived on a shared link has nothing of ours behind them, and
 * going back would take them off the site entirely — usually to the app they
 * clicked the link in.
 *
 * React Router stamps an index onto every history entry it creates. Anything
 * above zero means there is a page of ours to return to. Zero, or missing,
 * means this is where their session began, and the fallback is used instead —
 * replacing rather than pushing, so the dead-end entry is not left behind.
 */
export default function useGoBack(fallback = '/') {
  const navigate = useNavigate()

  return useCallback(() => {
    const idx = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}

/** Is there somewhere of ours to go back to? Lets a label tell the truth. */
export function hasHistory() {
  const idx = window.history.state?.idx
  return typeof idx === 'number' && idx > 0
}
