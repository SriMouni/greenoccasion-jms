import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox } from 'lucide-react';
import { ARTICLE_TYPE_LABEL, SUBMISSION_STATUS_LABEL, statusBadgeClass } from '../lib/portal';
import { StatCard } from '../components/StatCard';

type Row = {
  id: string;
  title: string;
  author_name: string | null;
  author_email: string | null;
  article_type: string | null;
  status: string;
  assigned_count: number;
  completed_count: number;
  review_count: number;
  created_at: string;
};

const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

export const EditorSubmissions = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/editor/submissions')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Submissions Triage</h1>
        <p className="text-on-surface-variant">New manuscripts requiring assessment and reviewer assignment.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Awaiting triage" value={count('submitted')} active={filter === 'submitted'} onClick={() => setFilter(filter === 'submitted' ? 'all' : 'submitted')} />
        <StatCard label="Under review" value={count('under_review')} active={filter === 'under_review'} onClick={() => setFilter(filter === 'under_review' ? 'all' : 'under_review')} />
        <StatCard label="Revisions out" value={count('revisions_requested')} active={filter === 'revisions_requested'} onClick={() => setFilter(filter === 'revisions_requested' ? 'all' : 'revisions_requested')} />
        <StatCard label="Published" value={count('published')} active={filter === 'published'} onClick={() => setFilter(filter === 'published' ? 'all' : 'published')} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-6 py-3 font-semibold">Title &amp; Author</th>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Reviews</th>
              <th className="px-6 py-3 font-semibold">Submitted</th>
              <th className="px-6 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span>
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                  <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" /> No submissions{filter !== 'all' ? ' in this state' : ' yet'}.
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="hover:bg-surface-container-low">
                  <td className="px-6 py-4">
                    <Link to={`/admin/submissions/${r.id}`} className="font-semibold text-on-surface hover:text-primary">{r.title}</Link>
                    <div className="text-xs text-on-surface-variant">{r.author_name || r.author_email || '—'}</div>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{r.article_type ? ARTICLE_TYPE_LABEL[r.article_type] || r.article_type : '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(r.status)}`}>
                      {SUBMISSION_STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">{r.completed_count}/{r.assigned_count}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{relTime(r.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/admin/submissions/${r.id}`} className="text-xs font-bold text-primary hover:underline">Open →</Link>
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
