import { useEffect, useState } from 'react';

export type Role = 'admin' | 'editor' | 'author' | 'reviewer';
export type AuthUser = { id: string; username: string; role: Role; fullName?: string | null };

/** Fetch the current session user (or null). */
export const useAuth = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setUser(d?.user ?? null);
      })
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { loading, user };
};

export const logout = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/admin/login';
  }
};

/** Where each role lands after login. */
export const homeForRole = (role?: Role | null): string => {
  switch (role) {
    case 'author':
      return '/admin/author';
    case 'reviewer':
      return '/admin/reviewer';
    case 'editor':
    case 'admin':
      return '/admin';
    default:
      return '/admin/login';
  }
};

export const jsonPost = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
};

export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  revisions_requested: 'Revisions Requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
  published: 'Published',
};

export const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'published':
    case 'accepted':
      return 'bg-secondary-container text-on-secondary-container';
    case 'rejected':
      return 'bg-error-container text-on-error-container';
    case 'under_review':
    case 'revisions_requested':
      return 'bg-primary/10 text-primary';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
};
