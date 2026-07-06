import { useEffect, useState } from 'react';
import { Loader2, FileDown, AlertTriangle } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';
import { StatCard } from '../components/StatCard';
import { jsonPost } from '../lib/portal';

type Assignment = {
  assignment_id: string;
  assignment_status: string; // invited | accepted | declined | completed | assigned(legacy)
  submission_id: string;
  title: string;
  abstract: string;
  article_type: string | null;
  submission_status: string;
  invited_at: string | null;
  due_date: string | null;
  overdue: boolean;
  reviewed: number;
};

const RECS = [
  { key: 'accept', label: 'Accept' },
  { key: 'minor', label: 'Minor revisions' },
  { key: 'major', label: 'Major revisions' },
  { key: 'reject', label: 'Reject' },
];
const RUBRIC: { key: string; label: string; low: string; high: string }[] = [
  { key: 'originality', label: 'Originality', low: 'Poor', high: 'Exceptional' },
  { key: 'rigor', label: 'Methodological Rigor', low: 'Poor', high: 'Exceptional' },
  { key: 'significance', label: 'Significance to Field', low: 'Minor', high: 'Pivotal' },
  { key: 'clarity', label: 'Clarity', low: 'Poor', high: 'Exceptional' },
];

export const ReviewerHome = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Assignment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rec, setRec] = useState('accept');
  const [scores, setScores] = useState<Record<string, number>>({ originality: 3, rigor: 3, significance: 3, clarity: 3 });
  const [toAuthor, setToAuthor] = useState('');
  const [toEditor, setToEditor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/reviewer/assignments')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const respond = async (assignmentId: string, accept: boolean) => {
    setBusy(true);
    try {
      await jsonPost(`/api/reviewer/assignments/${assignmentId}/respond`, { accept });
      load();
    } catch (e: any) {
      setError(e.message || 'Could not respond');
    } finally {
      setBusy(false);
    }
  };

  const openForm = (id: string) => {
    setOpenId(id);
    setRec('accept');
    setScores({ originality: 3, rigor: 3, significance: 3, clarity: 3 });
    setToAuthor('');
    setToEditor('');
    setError('');
  };

  const submitReview = async (assignmentId: string) => {
    setBusy(true);
    setError('');
    try {
      await jsonPost(`/api/reviewer/assignments/${assignmentId}/review`, {
        recommendation: rec,
        commentsToAuthor: toAuthor,
        commentsToEditor: toEditor,
        scores,
      });
      setOpenId(null);
      load();
    } catch (e: any) {
      setError(e.message || 'Could not submit review');
    } finally {
      setBusy(false);
    }
  };

  const pending = items.filter((a) => ['invited', 'accepted', 'assigned'].includes(a.assignment_status) && a.reviewed === 0).length;
  const completed = items.filter((a) => a.assignment_status === 'completed' || a.reviewed > 0).length;
  const dueSoon = items.filter((a) => a.overdue).length;

  return (
    <PortalShell role="reviewer" title="My Review Assignments">
      {loading ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant py-16 text-center text-on-surface-variant">
          No review assignments yet.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Pending reviews" value={pending} />
            <StatCard label="Completed" value={completed} />
            <StatCard label="Overdue" value={dueSoon} />
          </div>

          <ul className="space-y-3">
            {items.map((a) => {
              const done = a.reviewed > 0 || a.assignment_status === 'completed';
              const invited = a.assignment_status === 'invited';
              const declined = a.assignment_status === 'declined';
              const canReview = (a.assignment_status === 'accepted' || a.assignment_status === 'assigned') && !done;
              return (
                <li key={a.assignment_id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{a.title}</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {a.article_type ? `${a.article_type} · ` : ''}Blinded manuscript
                        {a.due_date && ` · due ${new Date(a.due_date).toLocaleDateString()}`}
                      </p>
                      {a.overdue && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-error">
                          <AlertTriangle className="h-3.5 w-3.5" /> Overdue
                        </p>
                      )}
                      <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{a.abstract}</p>
                      <a
                        href={`/api/submissions/${a.submission_id}/manuscript`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <FileDown className="h-3.5 w-3.5" /> Manuscript
                      </a>
                    </div>
                    <div className="shrink-0">
                      {done ? (
                        <span className="rounded-full bg-secondary-container px-2.5 py-1 text-xs font-bold text-on-secondary-container">Reviewed</span>
                      ) : declined ? (
                        <span className="rounded-full bg-error-container px-2.5 py-1 text-xs font-bold text-on-error-container">Declined</span>
                      ) : invited ? (
                        <div className="flex gap-2">
                          <button type="button" disabled={busy} onClick={() => respond(a.assignment_id, true)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
                            Accept
                          </button>
                          <button type="button" disabled={busy} onClick={() => respond(a.assignment_id, false)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
                            Decline
                          </button>
                        </div>
                      ) : canReview ? (
                        <button type="button" onClick={() => openForm(a.assignment_id)} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:bg-primary-dark">
                          Start Review
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {openId === a.assignment_id && canReview && (
                    <div className="mt-4 space-y-4 border-t border-outline-variant pt-4">
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Quantitative assessment (1–5)</p>
                        <div className="space-y-3">
                          {RUBRIC.map((x) => (
                            <div key={x.key}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-on-surface">{x.label}</span>
                                <span className="font-bold text-primary">{scores[x.key]} / 5</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={5}
                                value={scores[x.key]}
                                onChange={(e) => setScores((s) => ({ ...s, [x.key]: Number(e.target.value) }))}
                                className="mt-1 w-full accent-primary"
                              />
                              <div className="flex justify-between text-[10px] uppercase tracking-wide text-on-surface-variant">
                                <span>{x.low}</span>
                                <span>{x.high}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-on-surface-variant">Recommendation</label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {RECS.map((r) => (
                            <button
                              key={r.key}
                              type="button"
                              onClick={() => setRec(r.key)}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                                rec === r.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-on-surface-variant">Comments for authors</label>
                        <textarea rows={3} value={toAuthor} onChange={(e) => setToAuthor(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-on-surface-variant">Confidential comments to editor</label>
                        <textarea rows={2} value={toEditor} onChange={(e) => setToEditor(e.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" />
                      </div>
                      {error && <p className="text-sm text-error">{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => submitReview(a.assignment_id)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
                          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit review
                        </button>
                        <button type="button" onClick={() => setOpenId(null)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PortalShell>
  );
};
