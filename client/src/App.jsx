import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import Preloader from '@/components/layout/Preloader'
import BackgroundFX from '@/components/layout/BackgroundFX'
import ScrollToTop from '@/components/layout/ScrollToTop'
import Landing from '@/pages/Landing'
import Explore from '@/pages/Explore'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Reset from '@/pages/Reset'
import ForgotPassword from '@/pages/ForgotPassword'
import Dashboard from '@/pages/Dashboard'
import Watch from '@/pages/Watch'
import Legal from '@/pages/Legal'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <Preloader />
      <BackgroundFX />
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* deep link: a shared URL opens that exact video's watch & buy page */}
        <Route path="/watch" element={<Watch />} />
        <Route path="/watch/:videoId" element={<Watch />} />
        <Route path="/s/:videoId" element={<Watch />} />

        {/* Terms, privacy, the creator agreement, copyright and refunds. */}
        <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/legal/:doc" element={<Legal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}
