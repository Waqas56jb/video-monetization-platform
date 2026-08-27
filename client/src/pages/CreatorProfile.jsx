import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Eye, MapPin, Play } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import VideoCard from '@/components/ui/VideoCard'
import Icon from '@/components/ui/Icon'
import { ErrorState, Skeleton, SkeletonCards } from '@/components/ui/States'
import useApi, { compact } from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import { socialIcon, socialLabel } from '@/lib/socialLinks'
import api, { mediaUrl } from '@/lib/api'
import useGoBack from '@/hooks/useGoBack'

function Grid({ videos }) {
  if (!videos?.length) return null
  return (
    <div className="vid-grid">
      {videos.map((v) => {
        const card = toCard(v)
        return (
          <VideoCard key={v.id} video={card} to={videoLink(v)} state={{ preview: card }} />
        )
      })}
    </div>
  )
}

/**
 * Public creator storefront.
 *
 * Not a name and a dump of videos. A page a viewer can open, share, and browse:
 * who this person is, proof they are verified, what they make, then featured,
 * latest, most watched, and the full catalogue.
 */
export default function CreatorProfile() {
  const { creatorId } = useParams()
  const goBack = useGoBack('/explore')
  const profile = useApi(() => api.auth.creator(creatorId), [creatorId])
  const c = profile.data
  const videos = c?.videos || []

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
                  <p className="creator-hero-meta">
                    <span>
                      <Play size={14} />
                      {compact(c.videoCount)} {c.videoCount === 1 ? 'video' : 'videos'}
                    </span>
                    <span>
                      <Eye size={14} />
                      {compact(c.totalViews)} views
                    </span>
                    {c.followers > 0 && <span>{compact(c.followers)} followers</span>}
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
              </header>

              {c.bio && (
                <section className="creator-about">
                  <h2>About</h2>
                  <p>{c.bio}</p>
                </section>
              )}

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
                </section>
              )}

              {c.latest?.length > 0 && (
                <section className="creator-section">
                  <h2>Latest releases</h2>
                  <Grid videos={c.latest} />
                </section>
              )}

              {c.mostWatched?.length > 0 && videos.length > 1 && (
                <section className="creator-section">
                  <h2>Most watched</h2>
                  <Grid videos={c.mostWatched} />
                </section>
              )}

              <section className="creator-section">
                <h2>All published videos</h2>
                {!videos.length ? (
                  <p className="creator-empty">No published videos yet.</p>
                ) : (
                  <Grid videos={videos} />
                )}
              </section>
            </>
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
