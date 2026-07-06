import { type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { logout, type Role } from '../lib/portal';
import { navForRole, ROLE_LABEL } from '../lib/nav';
import { Logo } from './Logo';

const roleInitials: Record<Role, string> = { author: 'AU', reviewer: 'RV', editor: 'ED', admin: 'AD' };

/** Role-aware sidebar shell for the author & reviewer portals. */
export const PortalShell = ({
  role,
  title,
  actions,
  children,
}: {
  role: Role;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) => {
  const items = navForRole(role);

  return (
    <div className="min-h-screen bg-surface-bright">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 flex h-screen w-[260px] flex-col border-r border-outline-variant bg-surface-container">
        <div className="border-b border-outline-variant px-6 py-6">
          <Logo size={28} subtitle={ROLE_LABEL[role]} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-secondary-container font-bold text-on-secondary-container'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-outline-variant px-4 py-4">
          <div className="flex items-center gap-3 rounded-lg bg-surface-container-high px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
              {roleInitials[role]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-on-surface">{ROLE_LABEL[role]}</p>
              <Link to="/admin" className="text-[11px] text-on-surface-variant hover:text-primary">Green Occasion JMS</Link>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              title="Sign out"
              className="rounded-md p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-on-error-container"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[260px] min-h-screen bg-surface-bright">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="font-serif text-3xl font-bold text-on-surface">{title}</h1>
            {actions}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};
