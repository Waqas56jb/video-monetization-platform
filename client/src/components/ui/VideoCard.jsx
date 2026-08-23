import { useState } from 'react'
import { Play } from 'lucide-react'
import Icon from './Icon'
import Reveal from './Reveal'
import useInView from '@/hooks/useInView'

/**
 * The trending / library video card. Used on the landing grid and inside the
 * dashboard library, with the same hover-zoom + pulsing play button.
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

  const [imgOn, setImgOn] = useState(false)
  const [ref, inView] = useInView({ skip: eager })
  const showImg = eager || inView
  const imgLoading = eager ? 'eager' : 'lazy'

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

  if (reveal) {
    return (
      <Reveal as="button" type="button" className="vid-card" delay={delay} onClick={onClick}>
        {body}
      </Reveal>
    )
  }

  return (
    <button ref={ref} type="button" className="vid-card" onClick={onClick} style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' }}>
      {body}
    </button>
  )
}
