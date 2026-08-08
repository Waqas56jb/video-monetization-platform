import { useCallback, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider, useToast } from '@/context/ToastContext'
import { ConfirmProvider } from '@/context/ConfirmContext'
import { AdminDataProvider, useAdminData } from '@/context/AdminDataContext'
import Preloader from '@/components/layout/Preloader'
import BackgroundFX from '@/components/layout/BackgroundFX'
import Login from '@/pages/Login'
import AdminShell from '@/pages/AdminShell'
import OverviewTab from '@/components/tabs/OverviewTab'
import AnalyticsTab from '@/components/tabs/AnalyticsTab'
import UsersTab from '@/components/tabs/UsersTab'
import CreatorsTab from '@/components/tabs/CreatorsTab'
import VideosTab from '@/components/tabs/VideosTab'
import ReviewTab from '@/components/tabs/ReviewTab'
import ModerationTab from '@/components/tabs/ModerationTab'
import PaymentsTab from '@/components/tabs/PaymentsTab'
import WithdrawalsTab from '@/components/tabs/WithdrawalsTab'
import RevenueTab from '@/components/tabs/RevenueTab'
import AdsTab from '@/components/tabs/AdsTab'
import AuditTab from '@/components/tabs/AuditTab'
import SettingsTab from '@/components/tabs/SettingsTab'
import { TOASTS } from '@/data/adminData'

function Router() {
  const [authed, setAuthed] = useState(false)
  const { startFeed, stopFeed } = useAdminData()
  const showToast = useToast()
  const navigate = useNavigate()

  const login = useCallback(() => {
    setAuthed(true)
    startFeed()
    showToast(TOASTS.login)
    navigate('/dashboard')
  }, [navigate, showToast, startFeed])

  const logout = useCallback(() => {
    setAuthed(false)
    stopFeed()
    showToast(TOASTS.logout)
    navigate('/login')
  }, [navigate, showToast, stopFeed])

  if (!authed) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={login} />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AdminShell onLogout={logout} />}>
        <Route path="/dashboard" element={<OverviewTab />} />
        <Route path="/analytics" element={<AnalyticsTab />} />
        <Route path="/users" element={<UsersTab />} />
        <Route path="/creators" element={<CreatorsTab />} />
        <Route path="/videos" element={<VideosTab />} />
        <Route path="/review" element={<ReviewTab />} />
        <Route path="/moderation" element={<ModerationTab />} />
        <Route path="/payments" element={<PaymentsTab />} />
        <Route path="/withdrawals" element={<WithdrawalsTab />} />
        <Route path="/revenue" element={<RevenueTab />} />
        <Route path="/ads" element={<AdsTab />} />
        <Route path="/audit" element={<AuditTab />} />
        <Route path="/settings" element={<SettingsTab />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminDataProvider>
          <Preloader />
          <BackgroundFX />
          <Router />
        </AdminDataProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
