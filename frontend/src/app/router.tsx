import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import type { Role } from '@/types';
import { useAuth } from '@/features/auth/context';
import { LoginPage } from '@/features/auth/LoginPage';
import { LoadingState, UnauthorizedState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { AppShell } from './AppShell';
const LandingPage = lazy(() => import('@/features/landing/LandingPage').then(module => ({ default: module.LandingPage })));
const FoundationPage = lazy(() => import('./FoundationPage').then(module => ({ default: module.FoundationPage })));
import { roles, roleOrder, workshopNavigation } from './roles';

const BuyerDashboard = lazy(() => import('@/features/buyer/BuyerDashboard').then(module => ({ default: module.BuyerDashboard })));
const PostJobPage = lazy(() => import('@/features/buyer/PostJobPage').then(module => ({ default: module.PostJobPage })));
const JobsListPage = lazy(() => import('@/features/buyer/JobsListPage').then(module => ({ default: module.JobsListPage })));
const JobDetailPage = lazy(() => import('@/features/buyer/JobDetailPage').then(module => ({ default: module.JobDetailPage })));

const MatchesPage = lazy(() => import('@/features/buyer/MatchesPage').then(module => ({ default: module.MatchesPage })));
const QuotesPage = lazy(() => import('@/features/buyer/QuotesPage').then(module => ({ default: module.QuotesPage })));

const OrdersListPage = lazy(() => import('@/features/buyer/OrdersListPage').then(module => ({ default: module.OrdersListPage })));
const OrderDetailPage = lazy(() => import('@/features/buyer/OrderDetailPage').then(module => ({ default: module.OrderDetailPage })));

const InspectorDashboard = lazy(() => import('@/features/inspector/InspectorDashboard').then(module => ({ default: module.InspectorDashboard })));
const InspectionsPage = lazy(() => import('@/features/inspector/InspectionsPage').then(module => ({ default: module.InspectionsPage })));
const InspectionDetailPage = lazy(() => import('@/features/inspector/InspectionDetailPage').then(module => ({ default: module.InspectionDetailPage })));

const WorkshopPage = lazy(() => import('@/features/workshop/WorkshopPage').then(module => ({ default: module.WorkshopPage })));

const AdminDashboard = lazy(() => import('@/features/admin/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const AdminListPage = lazy(() => import('@/features/admin/AdminListPage').then(module => ({ default: module.AdminListPage })));
const AdminDetailPage = lazy(() => import('@/features/admin/AdminDetailPage').then(module => ({ default: module.AdminDetailPage })));

function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={roles[user.role].landing} replace /> : <Suspense fallback={<LoadingState label="Loading KaarigarLink..." />}><LandingPage /></Suspense>;
}
function RequireSession() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? <Outlet /> : <UnauthorizedState home={roles[user.role].landing} />;
}
function NotFound() {
  const { user } = useAuth();
  return <div className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Page not found</h1><p className="mt-3 text-sm text-muted-foreground">Check the address or return to your workspace.</p><Button asChild className="mt-6"><Link to={user ? roles[user.role].landing : '/login'}>Return to {user ? 'my workspace' : 'sign in'}</Link></Button></div>;
}
function RouteFocus() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    document.title = 'KaarigarLink · ' + (pathname === '/' ? 'Manufacturing connections' : pathname === '/login' ? 'Sign in' : pathname === '/foundation' ? 'Frontend foundation' : 'Workspace');
    if (previous.current !== pathname) {
      window.scrollTo(0, 0);
      document.getElementById('main')?.focus({ preventScroll: true });
    }
    previous.current = pathname;
  }, [pathname]);
  return null;
}
export function AppRoutes() {
  const { pathname } = useLocation();
  return <>
    {pathname !== "/foundation" && <a href="#main" tabIndex={0} className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">Skip to content</a>}
    <RouteFocus />
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/foundation" element={<Suspense fallback={<LoadingState label="Loading foundation…" />}><FoundationPage /></Suspense>} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          {/* Workshop routes share this router, session, shell and role guard. */}
          {roleOrder.map(role => <Route key={role} path={role} element={<RequireRole role={role} />}>
            <Route index element={<Navigate to={roles[role].landing} replace />} />
            <Route path="dashboard" element={role === 'buyer' ? <BuyerDashboard /> : role === 'inspector' ? <InspectorDashboard /> : role === 'admin' ? <AdminDashboard /> : <WorkshopPage />} />
            {role === 'buyer' && <>
              <Route path="orders" element={<OrdersListPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="orders/:id/review" element={<OrderDetailPage reviewOnly />} />
              <Route path="jobs" element={<JobsListPage />} />
              <Route path="jobs/new" element={<PostJobPage />} />
              <Route path="jobs/:id" element={<JobDetailPage />} />
              <Route path="jobs/:id/matches" element={<MatchesPage />} />
              <Route path="jobs/:id/quotes" element={<QuotesPage />} />
            </>}
            {role === 'workshop' && <>
              {workshopNavigation.map(({ section }) => <Route key={section} path={section} element={<WorkshopPage section={section} />} />)}
              <Route path="invitations/:invitationId" element={<WorkshopPage section="invitations" />} />
              <Route path="orders/:orderId" element={<WorkshopPage section="orders" />} />
            </>}
            {role === 'inspector' && <>
              <Route path="inspections" element={<InspectionsPage />} />
              <Route path="inspections/:id" element={<InspectionDetailPage />} />
              <Route path="rework" element={<InspectionsPage key="rework" view="rework" />} />
              <Route path="history" element={<InspectionsPage key="history" view="history" />} />
            </>}
            {role === 'admin' && (['users', 'workshops', 'jobs', 'orders', 'quality'] as const).map(section => <Route key={section} path={section}>
              <Route index element={<AdminListPage key={section} section={section} />} />
              <Route path=":id" element={<AdminDetailPage key={section} section={section} />} />
            </Route>)}
            <Route path="*" element={<NotFound />} />
          </Route>)}
        </Route>
      </Route>
      <Route path="*" element={<main id="main" tabIndex={-1}><NotFound /></main>} />
    </Routes>
  </>;
}
