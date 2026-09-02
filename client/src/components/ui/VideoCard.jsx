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
 * THE CARD IS NOT ONE BIG ANCHOR. It carries three more controls now — the
 * creator's name, Follow, and Save — and an anchor inside an anchor is invalid
 * HTML that browsers resolve by silently closing the outer one, which breaks the
 * card differently in every engine.
 *
 * So the card is an `<article>`, and the link that opens the video is a REAL
 * ELEMENT — the last child, absolutely positioned over the whole tile. The
 * controls sit above it on a higher z-index and take their own presses.
 *
 * IT WAS A `::after` PSEUDO-ELEMENT FIRST, AND THAT SHIPPED BROKEN.
 * The client found it: only the title opened a video, and pressing the picture
 * did nothing except leave the top progress bar running. Two things were wrong.
 * `.vid-play` covered the whole poster above the overlay — fixed by making every
 * decorative layer `pointer-events:none`. But even after that the poster still
 * would not navigate, and the reason is worth writing down: `.vid-card:active`
 * applies `opacity:.92` and a transform, which turns the card into a stacking
 * context mid-press, and the pseudo-element then lost to the poster image
 * between mousedown and mouseup — so the two landed on different elements and
 * the browser fired `click` on their common ancestor instead of on the link.
 * Measured, not guessed: while the button was held, `elementFromPoint` over the
 * poster returned the `<img>`, and with a real anchor in the same place it
 * returns the anchor and the press navigates.
 *
 * A real element does not have that problem, and it is also far easier to reason
 * about than a pseudo-element competing with its siblings.
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
    if (e?.target?.closest?.('button:not(.vid-open), a:not(.vid-open)')) return
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
    if (e?.target?.closest?.('button:not(.vid-open), a:not(.vid-open)')) return
    if (warmed.current) return
    prefetchWatchLight(slug || id)
  }

  /* The chunk is worth having ready; the per-card payload is not. Warming the
     route's JavaScript costs one request for the whole page, not one per card. */
  useEffect(() => {
    if (inView) prefetchWatchChunk()
  }, [inView])

  const name = author || byline

  /**
   * The one control that opens the video: a real element covering the tile,
   * rendered last so nothing decorative can paint over it. Its accessible name
   * is the title, which is drawn separately in normal flow.
   */
  const opener = to ? (
    <Link className="vid-open" to={to} state={state} aria-label={title} />
  ) : (
    <button className="vid-open" type="button" onClick={onClick} aria-label={title} />
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
        <h4>{title}</h4>
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
      {opener}
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
