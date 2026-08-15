import { useCallback } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { ToastProvider, useToast } from '@/context/ToastContext'
import { ConfirmProvider } from '@/context/ConfirmContext'
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

/**
 * A route a sub-admin only opens if they hold the module.
 *
 * The sidebar already hides these, but a bookmark, a back button or a typed URL
 * reaches the route directly — and landing on a screen where every request is
 * refused looks like the platform is broken rather than like a permission they
 * were not given. The server refuses those requests either way; this is about
 * where the person ends up.
 */
function Needs({ module, children }) {
  const { can } = useAuth()
  return can(module) ? children : <Navigate to="/dashboard" replace />
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
        <Route
          path="/announcements"
          element={<Needs module="announcements"><AnnouncementsTab /></Needs>}
        />

        {/* Accounts are the administrator's alone. */}
        <Route path="/users" element={<AdminOnly><UsersTab /></AdminOnly>} />
        <Route path="/creators" element={<AdminOnly><CreatorsTab /></AdminOnly>} />
        <Route path="/revenue" element={<AdminOnly><RevenueTab /></AdminOnly>} />

        <Route path="/videos" element={<Needs module="videos"><VideosTab /></Needs>} />
        <Route path="/review" element={<Needs module="review"><ReviewTab /></Needs>} />
        <Route path="/moderation" element={<Needs module="moderation"><ModerationTab /></Needs>} />
        <Route path="/payments" element={<Needs module="payments"><PaymentsTab /></Needs>} />
        <Route path="/withdrawals" element={<Needs module="withdrawals"><WithdrawalsTab /></Needs>} />
        <Route path="/ads" element={<Needs module="ads"><AdsTab /></Needs>} />
        <Route path="/audit" element={<Needs module="audit"><AuditTab /></Needs>} />
        <Route path="/settings" element={<Needs module="settings"><SettingsTab /></Needs>} />
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
            <Preloader />
            <BackgroundFX />
            <Router />
          </NotificationsProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
