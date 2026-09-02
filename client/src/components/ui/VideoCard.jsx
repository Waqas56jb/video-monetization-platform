import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import Icon from './Icon'
import Reveal from './Reveal'
import FollowButton from './FollowButton'
import SaveButton from './SaveButton'
import useInView from '@/hooks/useInView'
import { prefetchWatch, prefetchWatchLight, prefetchWatchChunk } from '@/lib/prefetchWatch'
import { useProgress } from '@/context/ProgressContext'
import { markPerf } from '@/lib/perfLog'

/**
 * The trending / library video card. Used on the landing grid and inside the
 * dashboard library, with the same hover-zoom + pulsing play button.
 *
 * THE CARD IS NO LONGER ONE BIG ANCHOR. It carries two more controls now — the
 * creator's name, which goes to their page, and Follow — and an anchor inside an
 * anchor is invalid HTML that browsers resolve by silently closing the outer
 * one, which breaks the card in ways that differ per engine.
 *
 * The pattern instead: the card is an `<article>`, the title holds the only link
 * to the video, and `.vid-open::after` stretches that link over the whole tile.
 * A tap anywhere still activates a real anchor — so it still navigates natively
 * on the first tap, which is the behaviour the client reported and which was
 * fixed at some cost — while the creator link and Follow sit above it on their
 * own stacking level and take their own taps.
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
    creatorId,
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

  /**
   * One warm per card, whichever event gets here first.
   *
   * iOS fires pointerdown AND touchstart for a single tap, so this ran twice —
   * harmless only because the cache collapses the second call, which is a thin
   * thing to rely on. `warmed` makes it explicit.
   */
  const warmed = useRef(false)
  /**
   * Warm the video, but not when the press was meant for something else.
   *
   * `warm` starts the top progress bar, and the bar is stopped by the
   * navigation that follows. Save and Follow sit on the card and do not
   * navigate, so a press on either used to start a bar that then ran for its
   * full eight-second cap with nothing happening — which reads as the page
   * having hung. Anything that is its own control handles its own press.
   */
  const warm = (e) => {
    if (e?.target?.closest?.('button, a:not(.vid-open)')) return
    if (warmed.current) return
    warmed.current = true
    markPerf('cardTap')
    start?.()
    prefetchWatch(slug || id)
  }

  /**
   * Hover is real intent; being on screen is not.
   *
   * This used to fire on viewport entry, so Explore warmed one playback payload
   * per visible card — six, measured, before anyone tapped anything. Warm, that
   * costs nothing. Cold, they compete with the request the viewer is actually
   * waiting for. A pointer resting on a card is the earliest honest signal, and
   * on touch there is no hover, so the tap path above is the one that matters.
   */
  const hover = (e) => {
    if (e?.target?.closest?.('button, a:not(.vid-open)')) return
    if (warmed.current) return
    prefetchWatchLight(slug || id)
  }

  /* The chunk is worth having ready; the per-card payload is not. Warming the
     route's JavaScript costs one request for the whole page, not one per card. */
  useEffect(() => {
    if (inView) prefetchWatchChunk()
  }, [inView])

  const name = author || byline

  /* The one control that opens the video, stretched over the whole tile. */
  const opener = to ? (
    <Link className="vid-open" to={to} state={state}>
      {title}
    </Link>
  ) : (
    <button className="vid-open" type="button" onClick={onClick}>
      {title}
    </button>
  )

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
        {/* Top-right of the poster, above the stretched link so it takes its own
            tap. Icon only: the tile has no room for a label and the tooltip and
            aria-label carry the meaning. */}
        {id && <SaveButton videoId={id} size="sm" />}
        {time && <span className="vid-time">{time}</span>}
        <div className="vid-play">
          <span>
            <Play />
          </span>
        </div>
      </div>
      <div className="vid-info">
        <h4>{opener}</h4>
        <div className="by">
          {/* The creator is reachable from the card, not only from the watch
              page — every share link and every Explore tap used to land on
              Watch, which made the creator the one thing you could not get to. */}
          {creatorId ? (
            <Link className="vid-by-link" to={`/creator/${creatorId}`}>
              {avatar && showImg && (
                <img src={avatar} alt="" loading={imgLoading} decoding="async" />
              )}
              <span>{name}</span>
            </Link>
          ) : (
            <>
              {avatar && showImg && (
                <img src={avatar} alt="" loading={imgLoading} decoding="async" />
              )}
              <span>{name}</span>
            </>
          )}
          {creatorId && <FollowButton creatorId={creatorId} size="sm" showCount={false} />}
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
    onPointerEnter: hover,
  }

  if (reveal) {
    return (
      <Reveal as="article" delay={delay} {...shared}>
        {body}
      </Reveal>
    )
  }

  return (
    <article ref={ref} {...shared}>
      {body}
    </article>
  )
}
