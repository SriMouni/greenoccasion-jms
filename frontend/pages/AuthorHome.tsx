import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Plus } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';
import { SUBMISSION_STATUS_LABEL, statusBadgeClass } from '../lib/portal';

type Submission = {
  id: string;
  title: string;
  status: string;
  decision: string | null;
  decision_note: string | null;
  review_count: number;
  created_at: string;
};
type Review = { id: string; recommendation: string; comments_to_author: string | null; created_at: string };

export const AuthorHome = () => {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review[]>>({});

  useEffect(() => {
    fetch('/api/submissions/mine')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSubs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!reviews[id]) {
      const d = await fetch(`/api/submissions/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setReviews((prev) => ({ ...prev, [id]: Array.isArray(d?.reviews) ? d.reviews : [] }));
    }
  };

  return (
    <PortalShell
      role="author"
      title="My Submissions"
      actions={
        <Link
          to="/admin/author/submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New Submission
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : subs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-on-surface-variant/40" />
          <p className="mt-3 font-serif text-lg text-on-surface">No submissions yet</p>
          <p className="text-sm text-on-surface-variant">Submit your first manuscript to get started.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {subs.map((s) => (
            <li key={s.id} className="rounded-lg border border-outline-variant bg-surface-container-lowest">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-on-surface">{s.title}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    Submitted {new Date(s.created_at).toLocaleDateString()} · {s.review_count} review(s)
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(s.status)}`}>
                  {SUBMISSION_STATUS_LABEL[s.status] || s.status}
                </span>
              </button>

              {open === s.id && (
                <div className="border-t border-outline-variant px-5 py-4 text-sm">
                  {s.decision && (
                    <p className="mb-3">
                      <span className="font-semibold">Editor decision:</span> {s.decision}
                      {s.decision_note ? ` — ${s.decision_note}` : ''}
                    </p>
                  )}
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Reviewer feedback
                  </p>
                  {(reviews[s.id] || []).length === 0 ? (
                    <p className="text-on-surface-variant">No reviewer feedback yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {reviews[s.id].map((r) => (
                        <li key={r.id} className="rounded-md bg-surface-container px-3 py-2">
                          <p className="text-xs font-bold text-primary">Recommendation: {r.recommendation}</p>
                          {r.comments_to_author && <p className="mt-1 whitespace-pre-wrap">{r.comments_to_author}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
};
