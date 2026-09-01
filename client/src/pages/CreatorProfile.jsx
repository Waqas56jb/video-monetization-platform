import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Eye, MapPin, Play, Share2 } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import FollowButton from '@/components/ui/FollowButton'
import ShareSheet from '@/components/watch/ShareSheet'
import Icon from '@/components/ui/Icon'
import { ErrorState, Skeleton } from '@/components/ui/States'
import useApi, { compact } from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import { socialIcon, socialLabel } from '@/lib/socialLinks'
import api, { mediaUrl } from '@/lib/api'
import useGoBack from '@/hooks/useGoBack'
import { useAuth } from '@/context/AuthContext'
import { useNotify } from '@/context/ToastContext'
import { useState } from 'react'

/**
 * Watch and Share, on every release.
 *
 * A creator page is where somebody decides whether this person is worth
 * following — and where they are most likely to want to send one of the
 * releases to a friend. Until now the only way to share a video was to open it
 * first and find the button on the watch page.
 *
 * Share opens the SAME sheet the watch page uses, rather than a second, simpler
 * one. The sheet needs a `share` payload that only `GET /api/videos/:slug`
 * carries, so it is fetched when the button is pressed — one request, and only
 * for the release somebody actually chose. Loading it for every card up front
 * would be a request per card on a page that can hold a whole catalogue.
 */
function ReleaseActions({ video, onShare, sharing }) {
  return (
    <div className="release-actions">
      <Link className="btn btn-gold btn-sm" to={videoLink(video)} state={{ preview: toCard(video) }}>
        <Play size={15} />
        Watch
      </Link>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onShare(video)}
        aria-busy={sharing || undefined}
      >
        <Share2 size={15} />
        {sharing ? 'Opening…' : 'Share'}
      </button>
    </div>
  )
}

function Grid({ videos, onShare, sharingId }) {
  if (!videos?.length) return null
  return (
    <div className="vid-grid">
      {videos.map((v) => {
        const card = toCard(v)
        return (
          <div className="release" key={v.id}>
            <VideoCard video={card} to={videoLink(v)} state={{ preview: card }} />
            <ReleaseActions video={v} onShare={onShare} sharing={sharingId === v.id} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Public creator storefront — a destination, not a database dump.
 *
 * Header is the person (avatar, name, bio, place, socials, counts). Below
 * that: featured, latest, most watched, then the full catalogue. Follow is
 * the action on the page.
 */
export default function CreatorProfile() {
  const { creatorId } = useParams()
  const goBack = useGoBack('/explore')
  const { user } = useAuth()
  const profile = useApi(() => api.auth.creator(creatorId), [creatorId])
  const notify = useNotify()
  const c = profile.data
  const videos = c?.videos || []

  /* One sheet for the whole page. `sharingId` is only so the pressed button can
     say "Opening…" while its payload is on the way. */
  const [sharingId, setSharingId] = useState(null)
  const [shareFor, setShareFor] = useState(null)

  const openShare = async (video) => {
    if (sharingId) return
    setSharingId(video.id)
    try {
      const res = await api.videos.one(video.slug || video.id)
      setShareFor({ video: res.video, share: res.share })
    } catch (err) {
      notify.error(err?.message || 'Could not open sharing for this video')
    } finally {
      setSharingId(null)
    }
  }

  return (
    <>
      <Header solid />
      <main className="page creator-page">
        <div className="container">
          <button className="explore-back" type="button" onClick={goBack} aria-label="Go back">
            <ArrowLeft size={18} />
            Back
          </button>

          {profile.loading ? (
            <Skeleton rows={6} />
          ) : profile.error || !c ? (
            <ErrorState
              title="Creator not found"
              error={profile.error || 'This profile is not available.'}
              onRetry={profile.reload}
            />
          ) : (
            <>
              <header className="creator-hero">
                {c.avatarUrl ? (
                  <img src={mediaUrl(c.avatarUrl)} alt="" className="creator-hero-avatar" />
                ) : (
                  <span className="creator-hero-avatar is-initials" aria-hidden="true">
                    {(c.name || 'C').slice(0, 1)}
                  </span>
                )}
                <div className="creator-hero-copy">
                  <h1>
                    {c.name}
                    {c.verified && <BadgeCheck className="verified-tick" aria-label="Verified" />}
                  </h1>
                  <div className="creator-hero-tags">
                    {c.location && (
                      <span>
                        <MapPin size={14} />
                        {c.location}
                      </span>
                    )}
                    {c.category && <span className="pill gold">{c.category}</span>}
                  </div>
                  {c.bio && <p className="creator-hero-bio">{c.bio}</p>}
                  <p className="creator-hero-meta">
                    <span>
                      <Play size={14} />
                      {compact(c.videoCount)} {c.videoCount === 1 ? 'video' : 'videos'}
                    </span>
                    <span>
                      <Eye size={14} />
                      {compact(c.totalViews)} views
                    </span>
                  </p>
                  {c.socials?.length > 0 && (
                    <ul className="creator-socials">
                      {c.socials.map((url) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <Icon name={socialIcon(url)} />
                            {socialLabel(url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="creator-hero-actions">
                  {c.isOwn ? (
                    <p className="creator-hero-followers">
                      {compact(c.followers)} {Number(c.followers) === 1 ? 'Follower' : 'Followers'}
                    </p>
                  ) : (
                    /* The same control as the watch page and the cards. Three
                       implementations of one button is three places for the
                       state to disagree, and "follows do not stick" is what the
                       client reported. The count and the current state are
                       seeded from this page's own payload, so the button is
                       right on first paint rather than after a round trip. */
                    <FollowButton
                      className="creator-follow"
                      creatorId={c.id}
                      followers={c.followers}
                      isFollowing={c.isFollowing}
                    />
                  )}
                </div>
              </header>

              {c.featured && (
                <section className="creator-section">
                  <h2>Featured release</h2>
                  <Link
                    className="creator-featured"
                    to={videoLink(c.featured)}
                    state={{ preview: toCard(c.featured) }}
                  >
                    <img src={mediaUrl(c.featured.thumbnailUrl)} alt="" />
                    <div>
                      <small>Featured</small>
                      <h3>{c.featured.title}</h3>
                      {c.featured.description && <p>{c.featured.description}</p>}
                      <span>
                        {compact(c.featured.views)} views
                        {c.featured.category ? ` · ${c.featured.category}` : ''}
                      </span>
                    </div>
                  </Link>
                  <ReleaseActions
                    video={c.featured}
                    onShare={openShare}
                    sharing={sharingId === c.featured.id}
                  />
                </section>
              )}

              {c.latest?.length > 0 && (
                <section className="creator-section">
                  <h2>Latest releases</h2>
                  <Grid videos={c.latest} onShare={openShare} sharingId={sharingId} />
                </section>
              )}

              {c.mostWatched?.length > 0 && videos.length > 1 && (
                <section className="creator-section">
                  <h2>Most watched</h2>
                  <Grid videos={c.mostWatched} onShare={openShare} sharingId={sharingId} />
                </section>
              )}

              <section className="creator-section">
                <h2>Full catalogue</h2>
                {!videos.length ? (
                  <p className="creator-empty">No published videos yet.</p>
                ) : (
                  <Grid videos={videos} onShare={openShare} sharingId={sharingId} />
                )}
              </section>
            </>
          )}

          {shareFor && (
            <ShareSheet
              open
              video={shareFor.video}
              share={shareFor.share}
              onClose={() => setShareFor(null)}
            />
          )}

          <p className="creator-foot">
            <Link to="/explore">Browse all videos</Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  )
}
