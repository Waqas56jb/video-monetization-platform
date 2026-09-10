import { useEffect, useRef, useState } from 'react'
import { SkipForward } from 'lucide-react'
import StreamPlayer from './StreamPlayer'
import api from '@/lib/api'
import { adAirtimeStarted, adCanSkip, adSkipRules } from '@/lib/adSkip'

/**
 * An advert playing in the place of the video.
 *
 * Skip is not a courtesy that appears with the panel. It is earned after the
 * advert has actually been playing — frames moving — for the campaign's
 * seconds. A black buffer, a stalled iframe, or the panel merely being mounted
 * must never start that clock.
 *
 * A frozen advert must not trap the film: if nothing has started after a
 * while we get out of the way. That is a failed load, not a skip, and it is
 * not billed as airtime.
 */
export default function AdBreak({ ad, videoId, playId, onFinished }) {
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [booted, setBooted] = useState(false)
  const done = useRef(false)
  const watched = useRef(0)

  const { skippable, skipAfter } = adSkipRules(ad?.skipAfterSeconds)
  const canSkip = adCanSkip(ad?.skipAfterSeconds, elapsed, playing)
  const remaining = Math.max(0, Math.ceil(skipAfter - elapsed))

  const noteAirtime = (current) => {
    const t = Number(current) || 0
    watched.current = Math.max(watched.current, t)
    if (!adAirtimeStarted(t)) return
    setPlaying(true)
    setElapsed(watched.current)
  }

  const finish = (completed) => {
    if (done.current) return
    done.current = true

    api.ads
      .impression({
        videoId,
        campaignId: ad.campaignId,
        placement: ad.placement,
        playId,
        breakIndex: ad.breakIndex ?? 0,
        secondsWatched: Math.round(watched.current),
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

  /**
   * Advert never started — do not show Skip as if they watched it.
   *
   * Was 4000ms. Traced live against production (2026-09-07, network trace
   * captured inside the ad's own iframe): a cold Cloudflare Stream player
   * spends about 2s on its own SDK script alone — it is answered with a
   * redirect and has to be fetched twice, the same cost already measured
   * for the main content player (report.txt, Issue 5) — then another ~1s
   * on its bundled chunks, before it even requests its first media segment.
   * Against that, 4s left this watchdog firing before the ad's own
   * Cloudflare video (confirmed healthy: readyToStream, correct
   * allowedOrigins, requireSignedURLs honoured) had any real chance to
   * reach playing — the two aborted init.mp4 requests captured were still
   * in flight when this fired, not failed on their own. 10s covers the
   * observed cold path with real margin while the absolute cap above still
   * catches a genuinely dead advert.
   */
  useEffect(() => {
    if (!ad?.iframe) return
    const fail = setTimeout(() => {
      if (!playing && !done.current) finish(false)
    }, 10000)
    return () => clearTimeout(fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.campaignId, playing])

  if (!ad?.iframe) return null

  return (
    <div className="ad-stage" data-ad-state={playing ? (canSkip ? 'skippable' : 'playing') : 'loading'}>
      <StreamPlayer
        src={ad.iframe}
        poster={ad.thumbnail}
        title={`Advertisement — ${ad.advertiser || ad.name}`}
        autoplay
        playOnReady
        requireAirtime
        controls={false}
        onEnded={() => finish(true)}
        onTimeUpdate={noteAirtime}
        onReady={() => setBooted(true)}
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
          type="button"
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

      {/*
       * Feedback must never go dark between the tap and the first counted
       * second. It used to be `!booted && !playing` — the instant the
       * player reported `canplay` this line vanished even though real
       * airtime (`playing`) was still seconds away, leaving a static poster
       * with nothing moving on it. Measured live: a 4.4s gap, tap to
       * countdown, with zero on-screen indication anything was happening in
       * the middle of it (report2.txt §4). Gated on `!playing` alone now, so
       * something is always on screen until the ad genuinely starts airing.
       */}
      {!playing && <p className="ad-loading-note">{booted ? 'Advert starting…' : 'Advert loading…'}</p>}

      <p className="ad-note">
        This video is free because of adverts like this one — the creator earns from it.
      </p>
    </div>
  )
}
