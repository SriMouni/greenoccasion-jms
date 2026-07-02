import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox } from 'lucide-react';
import { SUBMISSION_STATUS_LABEL, statusBadgeClass } from '../lib/portal';

type Row = {
  id: string;
  title: string;
  author_name: string | null;
  author_email: string | null;
  status: string;
  assigned_count: number;
  review_count: number;
  created_at: string;
};

export const EditorSubmissions = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch('/api/editor/submissions')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Submissions</h1>
        <p className="text-on-surface-variant">Author manuscripts in the editorial workflow.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-6 py-3 font-semibold">Title</th>
              <th className="px-6 py-3 font-semibold">Author</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Reviews</th>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant">
                  <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" /> No submissions yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-container-low">
                  <td className="px-6 py-4 font-semibold text-on-surface">{r.title}</td>
                  <td className="px-6 py-4 text-on-surface-variant">
                    {r.author_name || '—'}
                    {r.author_email && <div className="text-xs">{r.author_email}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(r.status)}`}>
                      {SUBMISSION_STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">
                    {r.review_count}/{r.assigned_count}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/admin/submissions/${r.id}`} className="text-xs font-bold text-primary hover:underline">
                      Open →
                    </Link>
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
