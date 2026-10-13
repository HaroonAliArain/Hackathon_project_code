import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity, Ambulance, Building2, ClipboardList, LayoutDashboard,
  LogOut, ShieldCheck, Users,
} from 'lucide-react';
import { useAuth } from '../shared/AuthProvider';
import { humanize } from '../shared/format';
import type { Role } from '../shared/types';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const allRoles: Role[] = ['coordinator', 'ambulance_staff', 'hospital_staff', 'hospital_admin', 'system_admin', 'observer'];
const navItems: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, roles: allRoles },
  { label: 'Emergencies', to: '/emergencies', icon: Activity, roles: ['coordinator', 'system_admin', 'observer', 'ambulance_staff', 'hospital_staff', 'hospital_admin'] },
  { label: 'Hospitals', to: '/hospitals', icon: Building2, roles: allRoles },
  { label: 'Referrals', to: '/referrals', icon: ClipboardList, roles: ['coordinator', 'system_admin', 'observer', 'hospital_staff', 'hospital_admin'] },
  { label: 'Ambulance fleet', to: '/ambulances', icon: Ambulance, roles: ['coordinator', 'system_admin', 'observer', 'ambulance_staff'] },
  { label: 'Team & access', to: '/team', icon: Users, roles: ['system_admin', 'hospital_admin'] },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const visibleItems = useMemo(() => navItems.filter((item) => user && item.roles.includes(user.role)), [user]);
  const displayName = user?.name || user?.email || 'Operator';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="EmergencyLink home">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
          <span className="brand-text">Emergency<span>Link</span></span>
        </NavLink>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {visibleItems.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={17} /><span>Secure operations<br /><strong>Access is role-scoped</strong></span></div>
          <button className="profile-button" type="button" onClick={signOut}>
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{displayName}</strong><small>{humanize(user?.role)}</small></span>
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>EmergencyLink</span><span className="breadcrumb-divider">/</span><strong>Operations center</strong></div>
          <div className="topbar-status"><span className="live-dot" /> Live workspace</div>
        </header>
        <main className="main-content">
          <Outlet />
          <footer className="app-footer">
            EmergencyLink is an operational coordination tool, not a clinical decision system.
          </footer>
        </main>
      </div>
    </div>
  );
}
