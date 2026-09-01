import { useLocation, useNavigate } from 'react-router-dom'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSaved } from '@/context/SavedContext'
import { useToast } from '@/context/ToastContext'
import { loginHref } from '@/lib/loginReturn'

/**
 * Add a video to My List, from a card or from the watch page.
 *
 * `size="sm"` is the version that sits on a card: an icon only, in the corner of
 * the poster, so the tile keeps its shape. The label is on the watch page, where
 * there is room for it and where the viewer is deciding.
 *
 * Signed out it still renders and is still pressable — pressing it goes to sign
 * in carrying the page they were on. A control that is missing until you log in
 * cannot tell you that logging in is what it wants.
 */
export default function SaveButton({ videoId, size = 'md', className = '' }) {
  const { authed } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { isSaved, toggle, pending } = useSaved()

  if (!videoId) return null

  const saved = isSaved(videoId)
  const busy = pending(videoId)
  const label = saved ? 'Saved' : 'Save'

  const onClick = (e) => {
    /* On a card the whole tile is a link and this sits above it, so the press
       must not also open the video. */
    e.preventDefault()
    e.stopPropagation()
    if (!authed) {
      navigate(loginHref(location))
      return
    }
    toggle(videoId).catch((err) => showToast(err?.message || 'Could not update your list'))
  }

  const icon = saved ? <BookmarkCheck size={size === 'sm' ? 16 : 18} /> : <Bookmark size={size === 'sm' ? 16 : 18} />

  if (size === 'sm') {
    return (
      <button
        type="button"
        className={`save-pin ${saved ? 'is-saved' : ''} ${className}`.trim()}
        onClick={onClick}
        aria-busy={busy || undefined}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from My List' : 'Save to My List'}
        title={saved ? 'Remove from My List' : 'Save to My List'}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost save-btn ${saved ? 'is-saved' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-busy={busy || undefined}
      aria-pressed={saved}
      title={saved ? 'Remove from My List' : 'Save to My List'}
    >
      {icon}
      <span className="btn-label">{label}</span>
    </button>
  )
}
