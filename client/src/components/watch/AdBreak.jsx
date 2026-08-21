import { useEffect, useRef, useState } from 'react'
import { SkipForward } from 'lucide-react'
import StreamPlayer from './StreamPlayer'
import api from '@/lib/api'
import { adSkipRules } from '@/lib/adSkip'

/**
 * An advert playing in the place of the video.
 *
 * Skip is not a courtesy that appears with the panel. It is earned after the
 * advert has actually been playing for the campaign's seconds — or it is
 * never offered, if the campaign is non-skippable (`skipAfterSeconds` 0).
 *
 * A frozen advert must not trap the film: if nothing has started after a
 * while we get out of the way. That is a failed load, not a skip.
 */
export default function AdBreak({ ad, videoId, playId, onFinished }) {
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const done = useRef(false)
  const watched = useRef(0)

  const { skippable, skipAfter } = adSkipRules(ad?.skipAfterSeconds)
  const canSkip = skippable && playing && elapsed >= skipAfter
  const remaining = Math.max(0, Math.ceil(skipAfter - elapsed))

  useEffect(() => {
    if (!ad || !playing) return
    const from = Date.now()
    const tick = setInterval(() => {
      setElapsed((was) => Math.max(was, (Date.now() - from) / 1000))
    }, 250)
    return () => clearInterval(tick)
  }, [ad?.campaignId, playing])

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
      .catch(() => {})

    onFinished?.()
  }

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

  // Advert never started — do not show Skip as if they watched it.
  useEffect(() => {
    if (!ad?.iframe) return
    const fail = setTimeout(() => {
      if (!playing && !done.current) finish(false)
    }, 12000)
    return () => clearTimeout(fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.campaignId, playing])

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
          if (current > 0.2) setPlaying(true)
        }}
      />

      <div className="ad-badge">
        <span className="ad-tag">Ad</span>
        {ad.advertiser || ad.name}
      </div>

      {skippable && playing && (
        <button
          className={`ad-skip ${canSkip ? 'is-ready' : ''}`.trim()}
          onClick={() => canSkip && finish(false)}
          disabled={!canSkip}
          hidden={!playing}
        >
          {canSkip ? (
            <>
              Skip ad
              <SkipForward size={14} />
            </>
          ) : (
            `Skip in ${remaining}`
          )}
        </button>
      )}

      {!playing && <p className="ad-loading-note">Advert playing…</p>}

      <p className="ad-note">
        This video is free because of adverts like this one — the creator earns from it.
      </p>
    </div>
  )
}
