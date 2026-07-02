import { useEffect, useState } from 'react';
import { Loader2, FileDown } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';
import { jsonPost } from '../lib/portal';

type Assignment = {
  assignment_id: string;
  assignment_status: string;
  submission_id: string;
  title: string;
  abstract: string;
  submission_status: string;
  reviewed: number;
};

const RECS = [
  { key: 'accept', label: 'Accept' },
  { key: 'minor', label: 'Minor revisions' },
  { key: 'major', label: 'Major revisions' },
  { key: 'reject', label: 'Reject' },
];

export const ReviewerHome = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Assignment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rec, setRec] = useState('accept');
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

  const openForm = (id: string) => {
    setOpenId(id);
    setRec('accept');
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
      });
      setOpenId(null);
      load();
    } catch (e: any) {
      setError(e.message || 'Could not submit review');
    } finally {
      setBusy(false);
    }
  };

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
        <ul className="space-y-3">
          {items.map((a) => {
            const done = a.reviewed > 0 || a.assignment_status === 'completed';
            return (
              <li key={a.assignment_id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{a.abstract}</p>
                    <a
                      href={`/api/submissions/${a.submission_id}/manuscript`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Manuscript
                    </a>
                  </div>
                  {done ? (
                    <span className="shrink-0 rounded-full bg-secondary-container px-2.5 py-1 text-xs font-bold text-on-secondary-container">
                      Reviewed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openForm(a.assignment_id)}
                      className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:bg-primary-dark"
                    >
                      Write review
                    </button>
                  )}
                </div>

                {openId === a.assignment_id && !done && (
                  <div className="mt-4 space-y-3 border-t border-outline-variant pt-4">
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
                      <label className="text-xs font-semibold text-on-surface-variant">Comments to author</label>
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
      )}
    </PortalShell>
  );
};
