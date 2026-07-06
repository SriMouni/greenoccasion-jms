import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ExternalLink, LifeBuoy, LogOut, Plus } from 'lucide-react';
import { useAuth } from '../lib/portal';
import { navForRole, ROLE_LABEL } from '../lib/nav';
import { Logo } from './Logo';

const navLinkClasses = (isActive: boolean) =>
  [
    'px-4 py-3 flex items-center gap-3 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-secondary-container text-on-secondary-container font-bold'
      : 'text-on-surface-variant hover:bg-surface-container-high',
  ].join(' ');

export const AdminLayout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role === 'editor' ? 'editor' : 'admin';
  const items = navForRole(role);

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
      <aside className="fixed left-0 top-0 flex h-screen w-[280px] flex-col border-r border-outline-variant bg-surface-container">
        {/* Brand */}
        <div className="border-b border-outline-variant px-6 py-6">
          <Logo size={30} subtitle={ROLE_LABEL[role]} />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => navLinkClasses(isActive)}>
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {role === 'admin' && (
            <div className="pt-4">
              <NavLink
                to="/admin/collection"
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-dark"
              >
                <Plus className="h-4 w-4" />
                New Discovery Job
              </NavLink>
            </div>
          )}
        </nav>

        {/* Bottom */}
        <div className="space-y-1 border-t border-outline-variant px-4 py-4">
          <div className="flex cursor-default items-center gap-3 rounded-lg px-4 py-2 text-sm text-on-surface-variant">
            <LifeBuoy className="h-4 w-4 shrink-0" />
            <span>Support</span>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-container-high px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
              {role === 'editor' ? 'ED' : 'AD'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-on-surface">{user?.fullName || user?.username || 'Editorial Office'}</p>
              <p className="truncate text-[11px] capitalize text-on-surface-variant">{role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-[280px] min-h-screen bg-surface-bright">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-bright/90 px-8 backdrop-blur-md">
          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {ROLE_LABEL[role]}
          </span>
          <a
            href={import.meta.env.VITE_PUBLIC_SITE_URL || '/'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary transition-colors hover:text-primary-dark"
          >
            <ExternalLink className="h-4 w-4" />
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
