import { useEffect, useRef, useState } from 'react'
import { SkipForward } from 'lucide-react'
import StreamPlayer from './StreamPlayer'
import api from '@/lib/api'

/**
 * An advert playing in the place of the video.
 *
 * This is where "Free + Ads" stops being a label and starts being income. An
 * expired Paid Premiere earns through this component: the advert plays, the
 * impression is recorded, and the creator's share of it is written to the
 * ledger by the server.
 *
 * Two things it deliberately does not do:
 *
 *  - It does not give the viewer the video's controls. An advert with a
 *    scrubber is an advert nobody watches, so `controls` is off and the only
 *    control offered is Skip, once the campaign says it may be skipped.
 *  - It does not let a failure hold the video hostage. If the advert cannot
 *    load, `onFinished` still runs. Advertising that breaks playback costs more
 *    than the impression is worth.
 */
export default function AdBreak({ ad, videoId, playId, onFinished }) {
  const [elapsed, setElapsed] = useState(0)
  const done = useRef(false)
  const watched = useRef(0)

  const skipAfter = Number(ad?.skipAfterSeconds ?? 5)
  const canSkip = elapsed >= skipAfter
  const remaining = Math.max(0, Math.ceil(skipAfter - elapsed))

  /**
   * The countdown starts when the advert starts, not when the panel appears.
   *
   * It used to run on the wall clock from the moment this mounted, so a few
   * seconds spent loading came out of the advertiser's five and Skip could be
   * ready before much had been seen — which is what was reported, and it
   * hollows out Free + Ads.
   *
   * It cannot depend on playback alone either. When a browser refuses to
   * autoplay, `currentTime` never moves, the countdown never finishes, and the
   * viewer is left holding a frozen advert in front of the video they came
   * for. An advert being stuck must never become their problem.
   *
   * So: the clock waits for playback to actually begin, and if it has not
   * begun within a few seconds it starts anyway, because by then something is
   * wrong with the advert and nobody should be trapped by it.
   *
   * Revenue is unaffected either way — an advertiser is billed on `completed`,
   * which only the advert's own `ended` event sets. Time passing earns nobody
   * anything.
   */
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!ad) return
    // The safety net: if the advert has not started in this long, treat it as
    // broken and let the countdown run regardless.
    const STUCK_AFTER_MS = 4000
    const mounted = Date.now()
    let from = null

    const tick = setInterval(() => {
      const broken = Date.now() - mounted > STUCK_AFTER_MS
      if (!playing && !broken) return
      if (from == null) from = Date.now()
      setElapsed((was) => Math.max(was, (Date.now() - from) / 1000))
    }, 400)

    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.campaignId, playing])

  /**
   * Report the impression exactly once, then hand the video back.
   *
   * `completed` separates an advert that ran to its end from one that was
   * skipped — only the first is something an advertiser should be billed for,
   * and the server decides the money from this flag.
   */
  const finish = (completed) => {
    if (done.current) return
    done.current = true

    api.ads
      .impression({
        videoId,
        campaignId: ad.campaignId,
        placement: ad.placement,
        playId,
        secondsWatched: Math.round(Math.max(watched.current, elapsed)),
        completed,
      })
      .catch(() => {
        /* The advert was still shown. Losing the record must not cost the
           viewer their video. */
      })

    onFinished?.()
  }

  // An advert that never loads should not become a dead end. Nothing to play at
  // all gets out of the way immediately; anything else gets its own length plus
  // a margin before we give up on it.
  useEffect(() => {
    if (!ad) return
    if (!ad.iframe) {
      finish(false)
      return
    }
    const cap = (Number(ad.durationSeconds) || 45) + 12
    const bail = setTimeout(() => finish(false), cap * 1000)
    return () => clearTimeout(bail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.campaignId])

  if (!ad?.iframe) return null

  return (
    <div className="ad-stage">
      <StreamPlayer
        src={ad.iframe}
        title={`Advertisement — ${ad.advertiser || ad.name}`}
        autoplay
        controls={false}
        onEnded={() => finish(true)}
        onPlaying={() => setPlaying(true)}
        onTimeUpdate={(current) => {
          watched.current = Math.max(watched.current, current || 0)
          // Frames are moving, so the advert is genuinely running whatever the
          // player reported about starting.
          if (current > 0.2) setPlaying(true)
          // Never let a reported position wind the countdown backwards.
          setElapsed((was) => Math.max(was, current || 0))
        }}
      />

      <div className="ad-badge">
        <span className="ad-tag">Ad</span>
        {ad.advertiser || ad.name}
      </div>

      <button
        className={`ad-skip ${canSkip ? 'is-ready' : ''}`.trim()}
        onClick={() => canSkip && finish(false)}
        disabled={!canSkip}
      >
        {canSkip ? (
          <>
            Skip ad
            <SkipForward size={14} />
          </>
        ) : playing ? (
          `Skip in ${remaining}`
        ) : (
          'Loading ad…'
        )}
      </button>

      <p className="ad-note">
        This video is free because of adverts like this one — the creator earns from it.
      </p>
    </div>
  )
}
