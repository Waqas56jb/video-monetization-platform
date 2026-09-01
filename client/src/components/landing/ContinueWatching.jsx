import { PlayCircle } from 'lucide-react'
import VideoCard from '@/components/ui/VideoCard'
import useApi from '@/hooks/useApi'
import { toCard, videoLink } from '@/lib/videoView'
import api from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

/**
 * Continue Watching, on the home page, for a viewer who is signed in.
 *
 * The row that gets people back into a film is the one that has to be in front
 * of them when they arrive, not two taps away inside the dashboard. This is the
 * same list as the library's first row, from the same table.
 *
 * IT IS SILENT WHEN IT HAS NOTHING TO SAY. Signed out it makes no request at
 * all — `skip` rather than an early return, so a signed-out visitor does not pay
 * for a request whose answer would be 401. With no unfinished videos it renders
 * nothing: a heading over an empty space on the front page is worse than no
 * heading, and every signed-in viewer would meet it on their first visit.
 *
 * A dedicated endpoint rather than the batched `/api/library`, because that one
 * carries a viewer's entire purchase history and this draws at most four tiles.
 */
const HOME_LIMIT = 4

export default function ContinueWatching() {
  const { authed } = useAuth()
  const { data } = useApi(() => api.library.continueWatching(HOME_LIMIT), [authed], {
    skip: !authed,
  })
  const videos = (data?.videos || []).slice(0, HOME_LIMIT)

  if (!authed || !videos.length) return null

  return (
    <section className="section section-continue" id="continue-watching">
      <div className="container">
        <div className="section-head">
          <span className="badge">
            <PlayCircle style={{ width: 14, height: 14 }} />
            PICK UP WHERE YOU LEFT OFF
          </span>
          <h2>
            Continue <span className="grad-text">Watching</span>
          </h2>
        </div>

        <div className="vid-grid">
          {videos.map((v) => {
            const card = toCard(v)
            return (
              <div className="lib-item" key={v.id}>
                <VideoCard video={card} to={videoLink(v)} state={{ preview: card }} />
                {v.percentWatched != null && (
                  <div
                    className="lib-progress"
                    role="progressbar"
                    aria-valuenow={v.percentWatched}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${v.percentWatched}% watched`}
                  >
                    <span style={{ width: `${v.percentWatched}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
