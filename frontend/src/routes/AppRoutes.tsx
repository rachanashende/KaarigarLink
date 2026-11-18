import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'
import AppShell from '../components/layout/AppShell'
import LoginPage from '../pages/auth/LoginPage'
import WorkshopOnboardingPage from '../pages/auth/WorkshopOnboardingPage'
import DashboardPage from '../pages/workshop/DashboardPage'
import InvitationsPage from '../pages/workshop/InvitationsPage'
import OrdersPage from '../pages/workshop/OrdersPage'
import WorkshopProfilePage from '../pages/workshop/WorkshopProfilePage'
import SettingsPage from '../pages/workshop/SettingsPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="onboarding" element={<WorkshopOnboardingPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="invitations" element={<InvitationsPage />} />
        <Route path="invitations/:jobId" element={<InvitationsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrdersPage />} />
        <Route path="workspace" element={<WorkshopProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
