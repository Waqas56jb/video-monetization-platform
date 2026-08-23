import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import Icon from './Icon'
import Reveal from './Reveal'
import useInView from '@/hooks/useInView'
import { prefetchWatch } from '@/lib/prefetchWatch'
import { useProgress } from '@/context/ProgressContext'

/**
 * The trending / library video card. Used on the landing grid and inside the
 * dashboard library, with the same hover-zoom + pulsing play button.
 *
 * Prefer `to` + `state` (real Link) so navigation is native and starts on the
 * first tap. `onClick` remains for rare non-route actions.
 */
export default function VideoCard({
  video,
  to,
  state,
  onClick,
  reveal = false,
  delay = 0,
  eager = false,
}) {
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
    slug,
    id,
  } = video

  const [imgOn, setImgOn] = useState(false)
  const [ref, inView] = useInView({ skip: eager })
  const showImg = eager || inView
  const imgLoading = eager ? 'eager' : 'lazy'
  const { start } = useProgress()

  const warm = () => {
    start?.()
    prefetchWatch(slug || id)
  }

  const body = (
    <>
      <div className="vid-thumb">
        {tag && <span className={`vid-tag ${tag.cls}`}>{tag.label}</span>}
        {!imgOn && <span className="vid-thumb-placeholder" aria-hidden="true" />}
        {showImg && thumb && (
          <img
            src={thumb}
            alt=""
            loading={imgLoading}
            decoding="async"
            className={imgOn ? 'is-on' : ''}
            {...(eager ? { fetchPriority: 'high' } : {})}
            onLoad={() => setImgOn(true)}
          />
        )}
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
          {avatar && showImg && (
            <img src={avatar} alt="" loading={imgLoading} decoding="async" />
          )}
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

  const shared = {
    className: 'vid-card',
    onPointerDown: warm,
    onTouchStart: warm,
  }

  if (reveal) {
    if (to) {
      return (
        <Reveal as={Link} to={to} state={state} delay={delay} {...shared}>
          {body}
        </Reveal>
      )
    }
    return (
      <Reveal as="button" type="button" delay={delay} onClick={onClick} {...shared}>
        {body}
      </Reveal>
    )
  }

  if (to) {
    return (
      <Link ref={ref} to={to} state={state} {...shared}>
        {body}
      </Link>
    )
  }

  return (
    <button ref={ref} type="button" onClick={onClick} {...shared}>
      {body}
    </button>
  )
}
