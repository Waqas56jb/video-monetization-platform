import { Play } from 'lucide-react'
import Icon from './Icon'
import Reveal from './Reveal'

/**
 * The trending / library video card. Used on the landing grid and inside the
 * dashboard library, with the same hover-zoom + pulsing play button.
 *
 * Set `reveal` to animate it in on scroll (landing); omit it inside the
 * dashboard where cards are already in view when their tab opens.
 */
export default function VideoCard({ video, onClick, reveal = false, delay = 0, eager = false }) {
  const {
    tag,
    thumb,
    time,
    title,
    author,
    avatar,
    byline,
    price,
    priceNote,
    priceColor,
    views,
    action,
  } = video

  const imgLoading = eager ? 'eager' : 'lazy'

  const body = (
    <>
      <div className="vid-thumb">
        {tag && <span className={`vid-tag ${tag.cls}`}>{tag.label}</span>}
        <img
          src={thumb}
          alt=""
          loading={imgLoading}
          decoding="async"
          {...(eager ? { fetchpriority: 'high' } : {})}
        />
        {/* A gradient foot rather than a flat crop: the thumbnail reads as a
            still from a film instead of a product photo, and the badge and
            duration sitting on it stay legible whatever the frame is. */}
        <span className="vid-shade" aria-hidden="true" />
        {time && <span className="vid-time">{time}</span>}
        <div className="vid-play">
          <span>
            <Play />
          </span>
        </div>
      </div>
      <div className="vid-info">
        <h4>{title}</h4>
        <div className="by">
          {avatar && <img src={avatar} alt="" loading={imgLoading} decoding="async" />}
          {author || byline}
        </div>
        <div className="vid-meta">
          <div className="vid-price" style={priceColor ? { color: priceColor } : undefined}>
            {price}
            <small>{priceNote}</small>
          </div>
          <span className="vid-views">
            <Icon name={action ? action.icon : 'eye'} />
            {action ? action.label : views}
          </span>
        </div>
      </div>
    </>
  )

  if (reveal) {
    return (
      <Reveal as="button" type="button" className="vid-card" delay={delay} onClick={onClick}>
        {body}
      </Reveal>
    )
  }

  return (
    <button type="button" className="vid-card" onClick={onClick}>
      {body}
    </button>
  )
}
