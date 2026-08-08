import { useCallback } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider, useToast } from '@/context/ToastContext'
import { ConfirmProvider } from '@/context/ConfirmContext'
import { AdminDataProvider } from '@/context/AdminDataContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { NotificationsProvider } from '@/context/NotificationsContext'
import Preloader from '@/components/layout/Preloader'
import BackgroundFX from '@/components/layout/BackgroundFX'
import Login from '@/pages/Login'
import Activate from '@/pages/Activate'
import AdminShell from '@/pages/AdminShell'
import OverviewTab from '@/components/tabs/OverviewTab'
import AnalyticsTab from '@/components/tabs/AnalyticsTab'
import NotificationsTab from '@/components/tabs/NotificationsTab'
import AnnouncementsTab from '@/components/tabs/AnnouncementsTab'
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

/** Routes only an administrator may open; a sub-admin is sent back to safety. */
function AdminOnly({ children }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/dashboard" replace />
}

function Router() {
  const { authed, loading, logout } = useAuth()
  const showToast = useToast()
  const navigate = useNavigate()

  const onLogin = useCallback(
    (u) => {
      showToast(`Welcome back, ${u.fullName || u.email}`)
      navigate('/dashboard')
    },
    [navigate, showToast]
  )

  const onLogout = useCallback(async () => {
    await logout()
    showToast('Signed out')
    navigate('/login')
  }, [logout, navigate, showToast])

  // Restoring a session takes a moment; showing the login form during it would
  // flash the wrong screen at someone who is already signed in.
  if (loading) return null

  if (!authed) {
    return (
      <Routes>
        {/* The only way in besides the login form: a sub-admin activating
            their account from an invitation link. */}
        <Route path="/reset" element={<Activate />} />
        <Route path="*" element={<Login onLogin={onLogin} />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="/reset" element={<Navigate to="/settings" replace />} />
      <Route element={<AdminShell onLogout={onLogout} />}>
        <Route path="/dashboard" element={<OverviewTab />} />
        <Route path="/analytics" element={<AnalyticsTab />} />
        <Route path="/notifications" element={<NotificationsTab />} />
        <Route path="/announcements" element={<AnnouncementsTab />} />

        {/* Accounts are the administrator's alone. */}
        <Route path="/users" element={<AdminOnly><UsersTab /></AdminOnly>} />
        <Route path="/creators" element={<AdminOnly><CreatorsTab /></AdminOnly>} />
        <Route path="/revenue" element={<AdminOnly><RevenueTab /></AdminOnly>} />

        <Route path="/videos" element={<VideosTab />} />
        <Route path="/review" element={<ReviewTab />} />
        <Route path="/moderation" element={<ModerationTab />} />
        <Route path="/payments" element={<PaymentsTab />} />
        <Route path="/withdrawals" element={<WithdrawalsTab />} />
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
        <AuthProvider>
          <NotificationsProvider>
            <AdminDataProvider>
              <Preloader />
              <BackgroundFX />
              <Router />
            </AdminDataProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
