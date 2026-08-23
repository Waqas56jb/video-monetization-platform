import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { ProgressProvider, useProgress } from '@/context/ProgressContext'
import { AuthProvider } from '@/context/AuthContext'
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
import { loadWatchPage } from '@/lib/prefetchWatch'

/** Same import() as prefetchWatch — Vite emits one chunk. */
const Watch = lazy(loadWatchPage)

function RouteProgress() {
  const location = useLocation()
  const { start, stop } = useProgress()
  useEffect(() => {
    start()
    const done = window.setTimeout(stop, 600)
    return () => window.clearTimeout(done)
  }, [location.pathname, location.search, start, stop])
  return null
}

/** Suspense shell can show the card poster while the Watch chunk downloads. */
function WatchRoute() {
  const location = useLocation()
  return (
    <Suspense
      fallback={
        <div className="page">
          <Header solid />
          <WatchSkeleton preview={location.state?.preview} />
        </div>
      }
    >
      <Watch />
    </Suspense>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ProgressProvider>
      <AuthProvider>
      <Preloader />
      <BackgroundFX />
      <ScrollToTop />
      <RouteProgress />

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
      </AuthProvider>
      </ProgressProvider>
    </ToastProvider>
  )
}
