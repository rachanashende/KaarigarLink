import { LoadingState } from '@/components/feedback';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Users, ShieldCheck, Package, BookOpen, ClipboardList, ChevronLeft, ChevronRight, Factory, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { cn } from '@/components/utils';
import { roles, workshopNavigation } from './roles';

export function AppShell() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loggingOut = useRef(false);
  const location = useLocation();
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    function closeOnDesktop(event: MediaQueryListEvent) { if (event.matches) setMobileOpen(false); }
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  if (!user) return null;
  const role = roles[user.role];
  const isBuyer = user.role === 'buyer';
  const isInspector = user.role === 'inspector';
  const isAdmin = user.role === 'admin';
  const isWorkshop = user.role === 'workshop';
  const workshopCrumb = isWorkshop ? workshopNavigation.find(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))?.label : undefined;
  const isJobChild = user.role === 'buyer' && location.pathname.startsWith('/buyer/jobs/');
  const isOrderChild = isBuyer && location.pathname.startsWith('/buyer/orders/');
  const inspectorCrumb = user.role === 'inspector' && location.pathname.startsWith('/inspector/inspections/') ? 'Inspection details' : location.pathname === '/inspector/inspections' ? 'Inspections' : location.pathname === '/inspector/rework' ? 'Rework follow-up' : location.pathname === '/inspector/history' ? 'Inspection history' : null;
  const adminSection = isAdmin ? ({ users: 'Users', workshops: 'Workshops', jobs: 'Jobs', orders: 'Orders', quality: 'Quality operations' } as Record<string, string>)[location.pathname.split('/')[2] ?? ''] : undefined;
  const adminCrumb = adminSection ? adminSection + (location.pathname.split('/').length > 3 ? ' / Record details' : '') : null;
  const breadcrumb = workshopCrumb ?? adminCrumb ?? inspectorCrumb ?? ( location.pathname === '/buyer/orders' ? 'Orders' : isOrderChild ? (location.pathname.endsWith('/review') ? 'Workshop review' : 'Order tracking') : isJobChild && location.pathname.endsWith('/matches') ? 'Workshop matches' : isJobChild && location.pathname.endsWith('/quotes') ? 'Quotations' : location.pathname === role.landing ? 'Overview' : location.pathname === '/buyer/jobs' ? 'Jobs' : location.pathname === '/buyer/jobs/new' ? 'Post job' : isJobChild ? 'Job details' : 'Page access');
  const initials = user.name.split(' ').map(part => part[0]).slice(0, 2).join('');
  function navigation(compact: boolean, mobile = false) {
    return <nav aria-label={mobile ? 'Mobile workspace navigation' : 'Workspace navigation'} className="space-y-2">
      <NavLink to={role.landing} onClick={() => setMobileOpen(false)} title={compact ? role.navigation : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}>
        <LayoutDashboard aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>{role.navigation}</span>
      </NavLink>
      {isBuyer && <NavLink to="/buyer/jobs" onClick={() => setMobileOpen(false)} title={compact ? 'Manufacturing jobs' : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}>
        <ClipboardList aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>Manufacturing jobs</span>
      </NavLink>}
      {isBuyer && <NavLink to="/buyer/orders" onClick={() => setMobileOpen(false)} title={compact ? 'Manufacturing orders' : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}><Package aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>Manufacturing orders</span></NavLink>}
      {isWorkshop && workshopNavigation.map(({ path, label }) => <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} title={compact ? label : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}><ClipboardList aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>{label}</span></NavLink>)}
      {isInspector && [['/inspector/inspections', 'Assigned inspections'], ['/inspector/rework', 'Rework follow-up'], ['/inspector/history', 'Inspection history']].map(([path, label]) => <NavLink key={path} to={path!} onClick={() => setMobileOpen(false)} title={compact ? label : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}><ClipboardList aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>{label}</span></NavLink>)}
      {isAdmin && [{ path: 'users', label: 'Users', Icon: Users }, { path: 'workshops', label: 'Workshops', Icon: Factory }, { path: 'jobs', label: 'Manufacturing jobs', Icon: ClipboardList }, { path: 'orders', label: 'Manufacturing orders', Icon: Package }, { path: 'quality', label: 'Quality operations', Icon: ShieldCheck }].map(({ path, label, Icon }) => <NavLink key={path} to={'/admin/' + path} onClick={() => setMobileOpen(false)} title={compact ? label : undefined} className={({ isActive }) => cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}><Icon aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>{label}</span></NavLink>)}
      <Link to="/foundation" onClick={() => setMobileOpen(false)} title={compact ? 'Shared foundation' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted', compact && 'justify-center px-0')}>
        <BookOpen aria-hidden="true" className="size-5 shrink-0" /><span className={compact ? 'sr-only' : ''}>Shared foundation</span>
      </Link>
    </nav>;
  }
  async function logout() {
    if (loggingOut.current) return;
    loggingOut.current = true; setBusy(true); setError(null);
    try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign out. Retry.'); }
    finally { loggingOut.current = false; setBusy(false); }
  }
  return <div className="flex min-h-dvh">
    <aside className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card md:flex', collapsed ? 'w-20' : 'w-60')}>
      <Link to={role.landing} aria-label="KaarigarLink home" className={cn('flex h-20 items-center gap-3 border-b px-6 font-semibold', collapsed && 'justify-center px-0')}><Factory aria-hidden="true" className="size-6 shrink-0 text-primary" />{!collapsed && <span>KaarigarLink</span>}</Link>
      <div className="flex-1 px-3 py-7">{!collapsed && <p className="mb-4 px-3 text-xs font-medium text-muted-foreground">{role.label} workspace</p>}{navigation(collapsed)}</div>
      {!collapsed && <div className="mx-4 mb-4 rounded-md border bg-background p-4"><span className="mb-2 block h-1 w-6 bg-accent" /><p className="text-xs font-semibold">Built for making.</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">One connection from requirement to workshop.</p></div>}
      <div className="border-t p-3"><Button variant="outline" className="w-full px-2" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4" /> : <><PanelLeftClose aria-hidden="true" className="size-4" /><span>Collapse navigation</span><ChevronLeft aria-hidden="true" className="size-3" /></>}</Button></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="size-11 px-0 md:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" className="size-5" /></Button>
          <span className="text-sm font-semibold">{role.label} workspace</span><span className="hidden border-l pl-3 text-xs text-muted-foreground sm:inline">KaarigarLink</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary" aria-hidden="true">{initials}</span>
          <div className="hidden sm:block"><p className="text-xs font-semibold">{user.name}</p><p className="mt-1 text-xs text-muted-foreground">{role.label}</p></div>
          <Button variant="outline" className="px-3" onClick={() => { setError(null); setLogoutOpen(true); }}><LogOut aria-hidden="true" className="size-4" /><span>Log out</span></Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-8 sm:py-8 lg:px-10">
        <nav aria-label="Breadcrumb" className="mb-6"><ol className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><li><Link className="inline-flex min-h-11 items-center hover:text-primary" to={role.landing}>{role.label}</Link></li><li aria-hidden="true"><ChevronRight className="size-3" /></li><>{isOrderChild && <><li><Link className="inline-flex min-h-11 items-center hover:text-primary" to="/buyer/orders">Orders</Link></li><li aria-hidden="true"><ChevronRight className="size-3" /></li></>}{isJobChild && <><li><Link className="inline-flex min-h-11 items-center hover:text-primary" to="/buyer/jobs">Jobs</Link></li><li aria-hidden="true"><ChevronRight className="size-3" /></li></>}<li aria-current="page">{breadcrumb}</li></></ol></nav>
        <Suspense fallback={<LoadingState label="Loading page…" />}><Outlet /></Suspense>
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-8 lg:px-10">KaarigarLink <span aria-hidden="true">/</span> Manufacturing job-work marketplace</footer>
    </div>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen} title="Workspace navigation" className="mr-auto ml-0 h-dvh max-h-dvh w-[min(20rem,100%)] rounded-none md:hidden">
      <div id="mobile-navigation"><div className="mt-4 mb-8 flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{role.label} workspace</p><Button autoFocus variant="outline" className="size-11 px-0" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X aria-hidden="true" className="size-5" /></Button></div>{navigation(false, true)}</div>
    </Dialog>
    <ConfirmationDialog open={logoutOpen} onOpenChange={setLogoutOpen} title="Log out of KaarigarLink?" description="Your demo session will end on this tab. You can sign in again with any demo role." confirmLabel="Log out" onConfirm={logout} busy={busy} error={error} />
  </div>;
}
