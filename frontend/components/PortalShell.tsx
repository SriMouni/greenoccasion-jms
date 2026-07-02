import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { logout, type Role } from '../lib/portal';

const ROLE_LABEL: Record<Role, string> = {
  author: 'Author',
  reviewer: 'Reviewer',
  editor: 'Editor',
  admin: 'Admin',
};

/** Lightweight header shell for author/reviewer portals. */
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
  return (
    <div className="min-h-screen bg-surface-bright">
      <header className="border-b border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="font-serif text-lg font-bold text-on-surface">Green Occasion JMS</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {ROLE_LABEL[role]}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="font-serif text-3xl font-bold text-on-surface">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
};
