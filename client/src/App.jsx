import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import Preloader from '@/components/layout/Preloader'
import BackgroundFX from '@/components/layout/BackgroundFX'
import ScrollToTop from '@/components/layout/ScrollToTop'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Reset from '@/pages/Reset'
import Dashboard from '@/pages/Dashboard'
import Watch from '@/pages/Watch'

export default function App() {
  return (
    <ToastProvider>
      <Preloader />
      <BackgroundFX />
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/watch" element={<Watch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
