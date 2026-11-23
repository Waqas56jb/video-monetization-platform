import { DiscoverTile } from './Brand'
import VideoCard from './VideoCard'
import { toCard, videoLink } from '@/lib/videoView'

/* The tile that takes the empty columns of a short grid is the client's
   "Discover More on MTONYO+" artwork (2026-11-23); see Brand.jsx. Client,
   2026-11-22: one to four videos on the left and a wall of black to their
   right "gives the impression that the website is broken". */
export { DiscoverTile as ExploreTile } from './Brand'

const defaultItem = (v) => {
  const card = toCard(v)
  return <VideoCard key={v.id} video={card} to={videoLink(v)} state={{ preview: card }} />
}

/**
 * How many cards the last row holds at 4, 3 and 2 columns. The explore tile
 * reads these (`.explore-tile` in global.css) and spans exactly the gap the
 * last row leaves at the current width, or hides when the row is full.
 */
export const rowRemainders = (n) => ({ 'data-r4': n % 4, 'data-r3': n % 3, 'data-r2': n % 2 })

/**
 * A video grid that looks finished at any count: no wall of black after the
 * last card, whether there are 1, 2, 3, 5 or 7 of them.
 *
 * `renderItem` lets a page wrap each card (the creator page adds Watch and
 * Share under it). `fill={false}` leaves the last row as it is.
 */
export default function VideoGrid({ videos, renderItem = defaultItem, fill = true, className = 'vid-grid' }) {
  if (!videos?.length) return null
  return (
    <div className={className} data-count={videos.length} {...rowRemainders(videos.length)}>
      {videos.map(renderItem)}
      {fill && <DiscoverTile />}
    </div>
  )
}
