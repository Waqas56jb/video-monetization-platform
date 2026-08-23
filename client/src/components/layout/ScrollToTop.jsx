import { useEffect } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { scrollWhenReady } from '@/hooks/useSectionLink'

/**
 * Jump to the top on route changes. Hash links (#trending) wait for that
 * section to exist, then park it below the sticky header.
 *
 * If the hash is set but the section is not on this page yet (homepage still
 * mounting), do not fall back to scrollTop 0 — that is the black hero flash
 * the client saw after tapping Trending from Explore or Watch.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      if (id) scrollWhenReady(id)
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash])

  // Same route component, different /watch/:videoId — pathname alone does not change.
  const { videoId } = useParams()
  useEffect(() => {
    if (!videoId) return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [videoId])

  return null
}
