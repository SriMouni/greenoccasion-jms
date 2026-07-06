import { Fragment } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
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

        {/* Nav — grouped by functionality */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 py-5">
          {items.map((item, i) => {
            const Icon = item.icon;
            const showHeader = item.group && item.group !== items[i - 1]?.group;
            return (
              <Fragment key={item.to}>
                {showHeader && (
                  <p className="px-4 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">
                    {item.group}
                  </p>
                )}
                <NavLink to={item.to} end={item.end} className={({ isActive }) => navLinkClasses(isActive)}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              </Fragment>
            );
          })}
        </nav>

      </aside>

      {/* Main content */}
      <main className="ml-[280px] min-h-screen bg-surface-bright">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-bright/90 px-8 backdrop-blur-md">
          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {ROLE_LABEL[role]}
          </span>
          <div className="flex items-center gap-4">
            <a
              href={import.meta.env.VITE_PUBLIC_SITE_URL || '/'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary transition-colors hover:text-primary-dark"
            >
              <ExternalLink className="h-4 w-4" />
              View Public Site
            </a>
            <span className="h-6 w-px bg-outline-variant" />
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
                {role === 'editor' ? 'ED' : 'AD'}
              </span>
              <div className="hidden sm:block leading-tight">
                <p className="text-xs font-bold text-on-surface">{user?.fullName || user?.username || 'Editorial Office'}</p>
                <p className="text-[10px] capitalize text-on-surface-variant">{role}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
