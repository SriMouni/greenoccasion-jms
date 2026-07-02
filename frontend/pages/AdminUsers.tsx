import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { jsonPost, type Role } from '../lib/portal';

type User = { id: string; username: string; full_name: string | null; email: string | null; role: Role; created_at: string };
const ROLES: Role[] = ['author', 'reviewer', 'editor', 'admin'];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Users</h1>
        <p className="text-on-surface-variant">Promote authors to reviewers or editors.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-6 py-3 font-semibold">Name</th>
              <th className="px-6 py-3 font-semibold">Email</th>
              <th className="px-6 py-3 font-semibold">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-on-surface-variant">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-container-low">
                  <td className="px-6 py-4 font-semibold text-on-surface">{u.full_name || u.username}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{u.email || u.username}</td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
