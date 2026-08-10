import { useRef } from 'react'
import { ArrowLeft, Maximize, Pause, Play, Settings, Share2, Volume2 } from 'lucide-react'
import Paywall from './Paywall'

/**
 * Simulated player chrome. The progress bar shows the dashed "FREE ENDS" marker
 * at the paywall point, exactly like the original build.
 */
export default function Player({
  video,
  progress,
  playing,
  unlocked,
  paywalled,
  currentTime,
  totalTime,
  onBack,
  onTogglePlay,
  onSeek,
  onShare,
  onUnlock,
  onDismissPaywall,
}) {
  const scrubbing = useRef(false)

  const seekFromPointer = (e) => {
    onSeek(e)
  }

  return (
    // `is-locked` lets the frame grow on small screens so the paywall card,
    // which is much taller than a 16:9 phone frame, is never cut off.
    <div className={`player ${paywalled ? 'is-locked' : ''}`.trim()}>
      <img src={video.poster} alt={video.title} />

      <div className="player-top">
        <div className="pt-l">
          <button className="back-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft />
          </button>
          <div className="pt-meta">
            <b>{video.title}</b>
            <small>{video.subtitle}</small>
          </div>
        </div>
        <span className={`pill player-pill ${unlocked ? 'ok' : 'pend'}`}>
          <span className="pill-full">
            {unlocked ? '✓ UNLOCKED · IN YOUR LIBRARY' : 'FREE PREVIEW'}
          </span>
          <span className="pill-short">{unlocked ? '✓ OWNED' : 'PREVIEW'}</span>
        </span>
      </div>

      <div className="player-bar">
        <div
          className="pb-track"
          onPointerDown={(e) => {
            scrubbing.current = true
            // pointer capture is a nicety for smooth dragging — if the browser
            // refuses it, seeking must still work
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId)
            } catch {
              /* ignore */
            }
            seekFromPointer(e)
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) seekFromPointer(e)
          }}
          onPointerUp={() => {
            scrubbing.current = false
          }}
          onPointerCancel={() => {
            scrubbing.current = false
          }}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="pb-fill" style={{ width: `${progress}%` }} />
          <span className="pb-free" style={{ left: `${video.freePercent}%` }}>
            <span className="pb-free-full">FREE ENDS</span>
            <span className="pb-free-short">FREE</span>
          </span>
        </div>

        <div className="pb-row">
          <div className="ctrls">
            <button onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause /> : <Play />}
            </button>
            <button aria-label="Volume">
              <Volume2 />
            </button>
            <span className="pb-time">
              <span>{currentTime}</span> / {totalTime}
            </span>
          </div>
          <div className="ctrls">
            <button onClick={onShare} aria-label="Share">
              <Share2 />
            </button>
            <button className="ctrl-hide-sm" aria-label="Settings">
              <Settings />
            </button>
            <button aria-label="Fullscreen">
              <Maximize />
            </button>
          </div>
        </div>
      </div>

      <Paywall
        show={paywalled}
        price={video.price}
        onUnlock={onUnlock}
        onDismiss={onDismissPaywall}
      />
    </div>
  )
}
