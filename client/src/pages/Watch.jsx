import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Calendar,
  Clock,
  Eye,
  LayoutDashboard,
  Library,
  Plus,
  Share2,
  UserPlus,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import Player from '@/components/watch/Player'
import PaymentModal from '@/components/watch/PaymentModal'
import { getVideo, videoLink } from '@/data/content'
import { useToast } from '@/context/ToastContext'

const START_PROGRESS = 8 // the original player opens 8% in
const TICK_MS = 200
const STEP = 0.55

const fmt = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`

export default function Watch() {
  const navigate = useNavigate()
  const showToast = useToast()
  const { videoId } = useParams()
  const video = useMemo(() => getVideo(videoId), [videoId])

  const [progress, setProgress] = useState(START_PROGRESS)
  const [playing, setPlaying] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [paywalled, setPaywalled] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  // Refs so the interval callback always sees fresh values without restarting.
  const unlockedRef = useRef(unlocked)
  unlockedRef.current = unlocked

  // Following a deep link to a different video resets the player, and the tab
  // title reflects the video so a shared link previews sensibly.
  useEffect(() => {
    setProgress(START_PROGRESS)
    setPlaying(false)
    setUnlocked(false)
    unlockedRef.current = false
    setPaywalled(false)
    setPayOpen(false)
    document.title = `${video.title} — MTONYO+`
    return () => {
      document.title = "MTONYO+ — Tanzania's Premium Creator Video Platform"
    }
  }, [video.id, video.title])

  // Playback ticker — advances the bar and trips the paywall at freePercent.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setProgress((prev) => {
        const next = prev + STEP
        if (!unlockedRef.current && next >= video.freePercent) {
          setPlaying(false)
          setPaywalled(true)
          return video.freePercent
        }
        if (next >= 100) {
          setPlaying(false)
          return 100
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, video.freePercent])

  const togglePlay = useCallback(() => {
    if (paywalled) return
    // The viewer dismissed the paywall but is still sitting on the paywall
    // point — pressing play brings the offer straight back rather than
    // silently doing nothing.
    if (!unlocked && progress >= video.freePercent) {
      setPaywalled(true)
      return
    }
    setPlaying((p) => !p)
  }, [paywalled, unlocked, progress, video.freePercent])

  /** "Not now" — close the offer so the viewer can browse, read or leave. */
  const dismissPaywall = useCallback(() => {
    setPaywalled(false)
    setPlaying(false)
  }, [])

  // Scrubbing is allowed, but a locked video can never be dragged past the preview.
  // Pointer events cover mouse + touch (Android/iOS).
  const onSeek = (e) => {
    if (paywalled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    if (clientX == null) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    const clamped = Math.min(Math.max(pct, 0), 100)
    if (!unlocked && clamped >= video.freePercent) {
      setProgress(video.freePercent)
      setPlaying(false)
      setPaywalled(true)
      return
    }
    setProgress(clamped)
  }

  const unlockVideo = () => {
    setUnlocked(true)
    unlockedRef.current = true
    setPaywalled(false)
    setPayOpen(false)
    showToast('🔓 Full video unlocked — saved to your library forever')
    setPlaying(true)
  }

  const seconds = (video.totalSeconds * progress) / 100

  /**
   * Share the video's deep link. On phones this opens the native share sheet
   * (Instagram / TikTok / WhatsApp / Facebook all appear there); on desktop it
   * falls back to copying the link.
   */
  const shareVideo = async () => {
    const url = videoLink(video.id)
    const payload = { title: video.title, text: `Watch "${video.title}" on MTONYO+`, url }
    try {
      if (navigator.share) {
        await navigator.share(payload)
        return
      }
      await navigator.clipboard.writeText(url)
      showToast('Link copied — share it anywhere!')
    } catch (err) {
      if (err?.name === 'AbortError') return // user dismissed the sheet
      showToast(url)
    }
  }

  return (
    <div className="page">
      <header className="scrolled watch-header">
        <div className="container nav">
          <Logo />
          <div className="nav-cta watch-cta">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/dashboard')}
              aria-label="My Library"
            >
              <Library />
              <span className="btn-label">My Library</span>
            </button>
            <button
              className="btn btn-gold btn-sm"
              onClick={() => navigate('/dashboard')}
              aria-label="Dashboard"
            >
              <LayoutDashboard />
              <span className="btn-label">Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      <div className="watch-wrap">
        <Player
          video={video}
          progress={progress}
          playing={playing}
          unlocked={unlocked}
          paywalled={paywalled}
          currentTime={fmt(seconds)}
          totalTime={fmt(video.totalSeconds)}
          onBack={() => navigate('/')}
          onTogglePlay={togglePlay}
          onSeek={onSeek}
          onShare={shareVideo}
          onUnlock={() => setPayOpen(true)}
          onDismissPaywall={dismissPaywall}
        />

        <div className="watch-info">
          <div className="watch-info-top">
            <div>
              <h1>{video.title}</h1>
              <div className="meta">
                <span>
                  <Eye />
                  {video.views}
                </span>
                <span>
                  <Calendar />
                  {video.premiered}
                </span>
                <span>
                  <Clock />
                  {video.window}
                </span>
              </div>
            </div>
            <div className="watch-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => showToast('Added to My List')}>
                <Plus />
                <span className="btn-label">My List</span>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={shareVideo}>
                <Share2 />
                <span className="btn-label">Share Preview</span>
              </button>
            </div>
          </div>

          <div className="creator-row">
            <img src={video.creator.avatar} alt="" />
            <div>
              <b>{video.creator.name}</b>
              <small>{video.creator.meta}</small>
            </div>
            <button
              className="btn btn-purple btn-sm"
              onClick={() => showToast(`Following ${video.creator.name}`)}
            >
              <UserPlus />
              Follow
            </button>
          </div>

          <div className="watch-desc">
            {video.description}
            <br />
            <br />
            <b style={{ color: '#fff' }}>{video.termsLabel}</b> {video.terms}
          </div>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        video={video}
        onClose={() => setPayOpen(false)}
        onContinueWatching={unlockVideo}
        onGoToLibrary={() => {
          setPayOpen(false)
          navigate('/dashboard')
        }}
      />
    </div>
  )
}
