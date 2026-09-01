import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserCheck, UserPlus } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useFollow } from '@/context/FollowContext'
import { useToast } from '@/context/ToastContext'
import { loginHref } from '@/lib/loginReturn'

function compact(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`
  return String(v)
}

/**
 * Follow a creator, from wherever the viewer happens to be.
 *
 * One control for the watch page, the cards and the creator's own page, because
 * three implementations of the same button is three places for the state to
 * disagree — and the client's report was about follows not sticking.
 *
 * SIGNED OUT, IT DOES NOT LIE. It renders and it is pressable, and pressing it
 * goes to sign in carrying the page the viewer was on, so they come back to the
 * creator they were looking at rather than the dashboard.
 *
 * `size="sm"` is the version that sits inside a video card: no count, short
 * label, quiet until pressed.
 */
export default function FollowButton({
  creatorId,
  followers,
  isFollowing: seedFollowing,
  size = 'md',
  showCount = true,
  className = '',
}) {
  const { authed, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const { isFollowing, countFor, toggle, pending, seedCount } = useFollow()

  // What the page already knows goes in, so the button shows a real count on
  // first paint instead of a dash that fills in a moment later.
  useEffect(() => {
    seedCount(creatorId, followers, seedFollowing)
  }, [creatorId, followers, seedFollowing, seedCount])

  if (!creatorId) return null
  // Nobody follows themselves, and offering it reads as a bug.
  if (user?.id && user.id === creatorId) return null

  const following = isFollowing(creatorId)
  const count = countFor(creatorId) ?? followers
  const busy = pending(creatorId)

  const onClick = (e) => {
    /* Inside a card the whole tile is a link. This button sits above it, so the
       click must not also open the video. */
    e.preventDefault()
    e.stopPropagation()
    if (!authed) {
      navigate(loginHref(location))
      return
    }
    toggle(creatorId).catch((err) => {
      showToast(err?.message || 'Could not update follow')
    })
  }

  const label = following ? 'Following' : 'Follow'

  return (
    <button
      type="button"
      className={`btn follow-btn follow-${size} ${following ? 'btn-ghost is-following' : 'btn-gold'} ${className}`.trim()}
      onClick={onClick}
      /* Not `disabled` while in flight: the state has already flipped
         optimistically, and a button that greys out after every press is the
         sluggishness this was meant to remove. `aria-busy` says the same thing
         without taking the control away. */
      aria-busy={busy || undefined}
      aria-pressed={following}
      title={following ? 'Unfollow this creator' : 'Follow this creator'}
    >
      {following ? <UserCheck size={size === 'sm' ? 14 : 18} /> : <UserPlus size={size === 'sm' ? 14 : 18} />}
      <span className="follow-label">{label}</span>
      {showCount && count != null && <span className="follow-count">{compact(count)}</span>}
    </button>
  )
}
