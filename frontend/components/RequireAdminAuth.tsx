import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

type AuthState = {
  loading: boolean;
  isAuthenticated: boolean;
  role: string | null;
};

export const RequireAdminAuth = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [state, setState] = useState<AuthState>({
    loading: true,
    isAuthenticated: false,
    role: null,
  });

  useEffect(() => {
    let isMounted = true;

    fetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setState({
          loading: false,
          isAuthenticated: true,
          role: data?.user?.role || null,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setState({ loading: false, isAuthenticated: false, role: null });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="py-16 container-custom min-h-screen flex items-center justify-center">
        <div className="glass-card px-8 py-6 text-center text-muted italic">Checking admin access...</div>
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (state.role !== 'admin' && state.role !== 'editor') {
    return (
      <div className="py-16 container-custom min-h-screen flex items-center justify-center">
        <div className="glass-card px-8 py-6 text-center space-y-2">
          <h1 className="text-2xl font-serif italic">Access denied</h1>
          <p className="text-muted text-sm">Your account does not have admin panel permissions.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
