import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { jsonPost, type Role } from '../lib/portal';

type User = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  status: string;
  created_at: string;
};
const ROLES: Role[] = ['author', 'reviewer', 'editor', 'admin'];

const statusPill = (s: string) => {
  switch (s) {
    case 'approved': return 'bg-secondary-container text-on-secondary-container';
    case 'pending': return 'bg-primary/10 text-primary';
    case 'rejected': return 'bg-error-container text-on-error-container';
    default: return 'bg-surface-container-high text-on-surface-variant';
  }
};

export const AdminUsers = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setRole = async (id: string, role: Role) => {
    setSaving(id);
    try {
      await jsonPost(`/api/admin/users/${id}/role`, { role });
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
    } finally {
      setSaving('');
    }
  };

  const setApproval = async (id: string, approve: boolean) => {
    setSaving(id);
    try {
      const d = await jsonPost(`/api/admin/users/${id}/approval`, { approve });
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, status: d.status } : x)));
    } finally {
      setSaving('');
    }
  };

  const pending = users.filter((u) => u.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Users</h1>
        <p className="text-on-surface-variant">
          Approve self-registered accounts and manage roles.
          {pending > 0 && <span className="ml-2 font-semibold text-primary">{pending} awaiting approval</span>}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-6 py-3 font-semibold">Name</th>
              <th className="px-6 py-3 font-semibold">Email</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Role</th>
              <th className="px-6 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className={`hover:bg-surface-container-low ${u.status === 'pending' ? 'bg-primary/5' : ''}`}>
                  <td className="px-6 py-4 font-semibold text-on-surface">{u.full_name || u.username}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{u.email || u.username}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusPill(u.status)}`}>{u.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={u.role}
                      disabled={saving === u.id}
                      onChange={(e) => setRole(u.id, e.target.value as Role)}
                      className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-sm capitalize"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.status === 'pending' ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={saving === u.id}
                          onClick={() => setApproval(u.id, true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={saving === u.id}
                          onClick={() => setApproval(u.id, false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-error/40 px-3 py-1.5 text-xs font-bold text-error hover:bg-error-container/40 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    ) : u.status === 'rejected' ? (
                      <button
                        type="button"
                        disabled={saving === u.id}
                        onClick={() => setApproval(u.id, true)}
                        className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                      >
                        Approve
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
