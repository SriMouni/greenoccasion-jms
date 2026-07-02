import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  ClipboardCheck,
  Compass,
  ExternalLink,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Plus,
  Settings,
  Users,
} from 'lucide-react';

type NavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Submissions', to: '/admin/submissions', icon: Inbox },
  { label: 'Discovery', to: '/admin/collection', icon: Compass },
  { label: 'Jobs', to: '/admin/jobs', icon: History },
  { label: 'Review Queue', to: '/admin/review', icon: ClipboardCheck },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'Author Intelligence', to: '/admin', icon: BrainCircuit, disabled: true },
];

const navLinkClasses = (isActive: boolean) =>
  [
    'px-4 py-3 flex items-center gap-3 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-secondary-container text-on-secondary-container font-bold'
      : 'text-on-surface-variant hover:bg-surface-container-high',
  ].join(' ');

export const AdminLayout = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-surface-bright">
      {/* Fixed sidebar */}
      <aside className="fixed left-0 top-0 w-[280px] h-screen flex flex-col bg-surface-container border-r border-outline-variant">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-outline-variant">
          <h1 className="font-serif text-xl font-bold text-on-surface">Admin Portal</h1>
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-on-surface-variant mt-1">
            Green Occasion JMS
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.label}
                  aria-disabled
                  className="px-4 py-3 flex items-center gap-3 rounded-lg text-sm text-on-surface-variant/50 cursor-not-allowed"
                  title="Coming soon"
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-on-surface-variant/40">
                    Soon
                  </span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => navLinkClasses(isActive)}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="pt-4">
            <NavLink
              to="/admin/collection"
              className="px-4 py-3 flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Discovery Job
            </NavLink>
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-4 py-4 border-t border-outline-variant space-y-1">
          <div className="px-4 py-2 flex items-center gap-3 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer">
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings</span>
          </div>
          <div className="px-4 py-2 flex items-center gap-3 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer">
            <LifeBuoy className="w-4 h-4 shrink-0" />
            <span>Support</span>
          </div>

          <div className="mt-3 px-3 py-3 flex items-center gap-3 rounded-lg bg-surface-container-high">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
              ED
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-on-surface truncate">Editor Profile</p>
              <p className="text-[11px] text-on-surface-variant truncate">Senior Admin</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="p-2 rounded-md text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-[280px] min-h-screen bg-surface-bright">
        <header className="sticky top-0 z-10 h-16 border-b border-outline-variant bg-surface-bright/90 backdrop-blur-md px-8 flex items-center justify-between">
          <span className="text-sm font-semibold text-on-surface-variant uppercase tracking-[0.12em]">
            Admin Portal
          </span>
          <a
            href={import.meta.env.VITE_PUBLIC_SITE_URL || '/'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary-dark transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Public Site
          </a>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
