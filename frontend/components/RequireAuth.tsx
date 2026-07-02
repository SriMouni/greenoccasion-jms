import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type Role } from '../lib/portal';

/**
 * Gate a route to authenticated users. Optionally restrict to specific roles.
 * Unlike RequireAdminAuth, this supports author/reviewer as well.
 */
export const RequireAuth = ({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-on-surface-variant italic">
        Checking access…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-8 py-6 text-center">
          <h1 className="font-serif text-2xl">Access denied</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Your account ({user.role}) can’t view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
