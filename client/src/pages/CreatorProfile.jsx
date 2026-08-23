import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, MapPin, Play } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import { ErrorState, Skeleton, SkeletonCards } from '@/components/ui/States'
import useApi, { compact } from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api, { mediaUrl } from '@/lib/api'
import useGoBack from '@/hooks/useGoBack'

/**
 * Public creator page — the storefront that was missing.
 *
 * Watch only showed a name next to the player. There was no URL a viewer
 * could open, share, or browse. This is that page: who they are, and every
 * published video they sell.
 */
export default function CreatorProfile() {
  const { creatorId } = useParams()
  const goBack = useGoBack('/explore')

  const profile = useApi(() => api.auth.creator(creatorId), [creatorId])
  const catalogue = useApi(
    () => api.videos.list({ creatorId, sort: 'newest', limit: 48 }),
    [creatorId]
  )

  const c = profile.data
  const videos = catalogue.data?.videos || []

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
            <Skeleton rows={4} />
          ) : profile.error || !c ? (
            <ErrorState
              title="Creator not found"
              error={profile.error || 'This profile is not available.'}
              onRetry={profile.reload}
            />
          ) : (
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
                {c.location && (
                  <p className="creator-hero-loc">
                    <MapPin size={14} />
                    {c.location}
                  </p>
                )}
                {c.bio && <p className="creator-hero-bio">{c.bio}</p>}
                <p className="creator-hero-meta">
                  <Play size={14} />
                  {compact(c.videoCount || videos.length)}{' '}
                  {(c.videoCount || videos.length) === 1 ? 'video' : 'videos'}
                  {c.followers > 0 && <> · {compact(c.followers)} followers</>}
                </p>
              </div>
            </header>
          )}

          <h2 className="creator-grid-title">Videos</h2>
          {catalogue.loading ? (
            <SkeletonCards />
          ) : catalogue.error ? (
            <ErrorState error={catalogue.error} onRetry={catalogue.reload} />
          ) : !videos.length ? (
            <p className="creator-empty">No published videos yet.</p>
          ) : (
            <div className="vid-grid">
              {videos.map((v) => {
                const card = toCard(v)
                return (
                  <VideoCard
                    key={v.id}
                    video={card}
                    to={videoLink(v)}
                    state={{ preview: card }}
                  />
                )
              })}
            </div>
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
