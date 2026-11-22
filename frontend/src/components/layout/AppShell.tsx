import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useWorkshopData } from '../../hooks/useWorkshopData'
import { useAuth } from '../../hooks/useAuth'

type IconName =
  | 'grid'
  | 'briefcase'
  | 'clipboard'
  | 'layers'
  | 'settings'
  | 'bell'
  | 'search'
  | 'chevron'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" /></>,
    layers: <><path d="M12 2 3 7l9 5 9-5-9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L7.6 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 6.4 14h-.2v-2.6h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L7.6 8l1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2H15V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/workshop/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/workshop/invitations', label: 'Invitations', icon: 'briefcase' },
  { to: '/workshop/orders', label: 'My Orders', icon: 'clipboard' },
  { to: '/workshop/profile', label: 'Workshop Profile', icon: 'layers' },
]

export default function AppShell() {
  const { profile, toast, clearToast } = useWorkshopData()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell${mobileOpen ? ' mobile-open' : ''}`}>
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <NavLink className="brand" to="/workshop/dashboard" aria-label="KaarigarLink dashboard">
          <span className="brand-mark">K</span>
          <span>Kaarigar<span>Link</span></span>
        </NavLink>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">WORKSPACE</p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/workshop/dashboard'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/workshop/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
            <Icon name="settings" />
            <span>Settings</span>
          </NavLink>
          <div className="profile-card">
            <div className="avatar">RS</div>
            <div>
              <strong>{profile.ownerName}</strong>
              <small>{profile.workshopName}</small>
            </div>
            <button className="icon-button sign-out-button" aria-label="Sign out" title="Sign out" onClick={handleSignOut}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>☰</button>
          <div className="search-box">
            <Icon name="search" size={18} />
            <input aria-label="Search" placeholder="Search jobs, orders..." />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" aria-label="Notifications">
              <Icon name="bell" />
              <span className="notification-dot" />
            </button>
            <div className="topbar-divider" />
            <button className="topbar-profile" aria-label="Open user menu">
              <div className="avatar small">{profile.ownerName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div>
              <span>{profile.ownerName}</span>
              <span className="chevron">⌄</span>
            </button>
          </div>
        </header>
        {toast && <div className={`toast toast-${toast.kind}`} role="status"><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={clearToast}>×</button></div>}
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
