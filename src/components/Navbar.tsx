import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, Archive, LogOut, CalendarDays, Search, Truck, Scissors } from 'lucide-react';
import joblioIcon from '../assets/joblio-icon.png';
import MentionsBell from './MentionsBell';
import OrdersNavButton from './OrdersNavButton';
import AiNavButton from './AiNavButton';
import SettingsNavButton from './SettingsNavButton';

const NAV_ITEMS = [
  { path: '/board', label: 'Board', icon: LayoutDashboard, match: (p: string) => p === '/board' || p === '/' },
  {
    path: '/quote-sizes',
    label: 'Cut / Print List',
    icon: Scissors,
    match: (p: string) => p === '/quote-sizes',
  },
  {
    path: '/vehicles',
    label: 'Vehicles',
    icon: Truck,
    match: (p: string) => p === '/vehicles' || p === '/vehicle-bookings',
  },
  {
    path: '/rigging',
    label: 'Rigging',
    icon: CalendarDays,
    match: (p: string) => p === '/rigging' || p === '/calendar' || p === '/installs',
  },
  { path: '/archived', label: 'Archived', icon: Archive, match: (p: string) => p === '/archived' },
] as const;

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.tracker.getVersion().then(setVersion).catch(() => {});
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const linkClass = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
      active
        ? 'bg-surface-warm text-ink shadow-ring dark:ring-1 dark:ring-brand/30'
        : 'text-ink-55 hover:bg-ink-6 hover:text-danger'
    }`;

  const iconBtn = (active: boolean) =>
    `rounded-lg p-2 transition-colors ${
      active ? 'bg-surface-warm text-ink shadow-ring' : 'text-ink-55 hover:bg-ink-6 hover:text-ink'
    }`;

  return (
    <header className="jt-chrome relative z-[400] shrink-0 border-b border-ink-10 bg-canvas/90">
      <div className="jt-titlebar flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => navigate('/board')}
          className="flex shrink-0 items-center gap-2"
        >
          <img
            src={joblioIcon}
            alt=""
            aria-hidden
            className="h-5 w-5 shrink-0 rounded object-contain"
          />
          <span className="font-display text-sm font-medium tracking-display text-ink">
            Joblio
          </span>
          {version && (
            <span className="rounded-md border border-ink-10 bg-ink-6 px-1.5 py-0.5 text-[10px] font-medium text-ink-40">
              v{version}
            </span>
          )}
        </button>
      </div>
      <div className="jt-menubar flex items-center justify-between gap-2 border-t border-ink-10 px-3 py-1.5">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon, match }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={linkClass(match(location.pathname))}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className={linkClass(location.pathname === '/admin')}
            >
              <Users className="h-4 w-4 shrink-0" />
              Admin
            </button>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <AiNavButton />
          <OrdersNavButton />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('joblio:open-search'))}
            className={iconBtn(false)}
            title="Search jobs (Ctrl+K)"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <MentionsBell />
          <SettingsNavButton />
          <div className="hidden items-center gap-2 md:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-xs font-semibold text-ink">
              {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
            </span>
            <div className="hidden max-w-[120px] flex-col leading-tight lg:flex">
              <span className="truncate text-sm text-ink-90">{user?.full_name || user?.username}</span>
              {isAdmin && (
                <span className="text-[10px] uppercase tracking-caps text-ink-40">Admin</span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="jt-btn-ghost !py-1.5" title="Logout">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
