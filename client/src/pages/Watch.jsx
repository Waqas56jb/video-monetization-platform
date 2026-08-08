import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { WATCH_VIDEO } from '@/data/content'
import { useToast } from '@/context/ToastContext'

const START_PROGRESS = 8 // the original player opens 8% in
const TICK_MS = 200
const STEP = 0.55

const fmt = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`

export default function Watch() {
  const navigate = useNavigate()
  const showToast = useToast()
  const video = WATCH_VIDEO

  const [progress, setProgress] = useState(START_PROGRESS)
  const [playing, setPlaying] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [paywalled, setPaywalled] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  // Refs so the interval callback always sees fresh values without restarting.
  const unlockedRef = useRef(unlocked)
  unlockedRef.current = unlocked

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
    setPlaying((p) => !p)
  }, [paywalled])

  // Scrubbing is allowed, but a locked video can never be dragged past the preview.
  const onSeek = (e) => {
    if (paywalled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = ((e.clientX - rect.left) / rect.width) * 100
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

  return (
    <div className="page">
      <header className="scrolled">
        <div className="container nav">
          <Logo />
          <div className="nav-cta">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
              <Library />
              My Library
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard />
              Dashboard
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
          onShare={() => showToast('Preview link copied — share it anywhere!')}
          onUnlock={() => setPayOpen(true)}
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
                My List
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => showToast('Preview link copied!')}
              >
                <Share2 />
                Share Preview
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
            A deep look into the life, hustle and journey of Harmonize — exclusive backstage footage,
            studio sessions and the untold story behind the fame. Filmed across Dar es Salaam over
            six months.
            <br />
            <br />
            <b style={{ color: '#fff' }}>Paid Premiere:</b> TZS 500 for early access. In 7 days this
            video becomes free with ads — but buyers keep their ad-free copy forever.
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
