import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { ProgressProvider, useProgress } from '@/context/ProgressContext'
import { AuthProvider } from '@/context/AuthContext'
import { FollowProvider } from '@/context/FollowContext'
import Preloader from '@/components/layout/Preloader'
import BackgroundFX from '@/components/layout/BackgroundFX'
import ScrollToTop from '@/components/layout/ScrollToTop'
import WatchSkeleton from '@/components/watch/WatchSkeleton'
import Header from '@/components/layout/Header'
import Landing from '@/pages/Landing'
import Explore from '@/pages/Explore'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Reset from '@/pages/Reset'
import ForgotPassword from '@/pages/ForgotPassword'
import Dashboard from '@/pages/Dashboard'
import CreatorProfile from '@/pages/CreatorProfile'
import Legal from '@/pages/Legal'
import { loadWatchPage, idlePrefetchWatch, ensureStreamSdk } from '@/lib/prefetchWatch'

/** Same import() as prefetchWatch — Vite emits one chunk. */
const Watch = lazy(loadWatchPage)

/** Landing stays in the main bundle so Home never waits on a chunk. Watch + Stream SDK start after first paint. */
function BootPrefetch() {
  useEffect(() => {
    idlePrefetchWatch()
    ensureStreamSdk()
  }, [])
  return null
}

function RouteProgress() {
  const location = useLocation()
  const { start, stop } = useProgress()
  // start/stop are stable. Listing them used to retrigger this effect
  // every time the bar toggled, which cancelled the 600ms stop forever.
  useEffect(() => {
    start()
    const done = window.setTimeout(stop, 600)
    return () => window.clearTimeout(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL only
  }, [location.pathname, location.search])
  return null
}

/** Suspense shell can show the card poster while the Watch chunk downloads. */
function WatchRoute() {
  const location = useLocation()
  const { videoId } = useParams()
  return (
    <Suspense
      fallback={
        <div className="page">
          <Header solid />
          <WatchSkeleton preview={location.state?.preview} />
        </div>
      }
    >
      {/* A new video is a new Watch. Without this, React reuses the same
          instance from /watch/A to /watch/B and `justPaid` from A would
          hide B's paywall — the client saw B, C, D as unlocked after
          buying only A. */}
      <Watch key={videoId || location.pathname} />
    </Suspense>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ProgressProvider>
      <AuthProvider>
      {/* Inside AuthProvider: it only asks who you follow once it knows who you are. */}
      <FollowProvider>
      <Preloader />
      <BackgroundFX />
      <ScrollToTop />
      <RouteProgress />
      <BootPrefetch />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* deep link: a shared URL opens that exact video's watch & buy page */}
        <Route path="/watch" element={<WatchRoute />} />
        <Route path="/watch/:videoId" element={<WatchRoute />} />
        <Route path="/s/:videoId" element={<WatchRoute />} />
        <Route path="/creator/:creatorId" element={<CreatorProfile />} />

        {/* Terms, privacy, the creator agreement, copyright and refunds. */}
        <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </FollowProvider>
      </AuthProvider>
      </ProgressProvider>
    </ToastProvider>
  )
}
