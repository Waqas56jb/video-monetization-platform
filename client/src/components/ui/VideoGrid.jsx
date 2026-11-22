import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import VideoCard from './VideoCard'
import { toCard, videoLink } from '@/lib/videoView'

/**
 * The tile that takes the empty columns of a short grid.
 *
 * Client, 2026-11-22: a creator with one to four videos showed the cards on the
 * left and a wall of black to their right, which "gives the impression that the
 * website is broken". A grid with fewer cards than columns now ends in this
 * tile, which spans exactly the columns the cards left empty at each width
 * (see `.explore-tile` in global.css), so the row is always full.
 */
export function ExploreTile({ title = 'Discover more on MTONYO+', text = 'Music, films, cooking and more from Tanzanian creators.' }) {
  return (
    <Link className="explore-tile" to="/explore">
      <Compass aria-hidden="true" />
      <b>{title}</b>
      <span>{text}</span>
      <span className="explore-tile-cta">Browse all videos →</span>
    </Link>
  )
}

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
      {fill && <ExploreTile />}
    </div>
  )
}
