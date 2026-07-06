import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FileUp, Loader2, Plus, Upload } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';
import { ARTICLE_TYPE_LABEL, SUBMISSION_STATUS_LABEL, statusBadgeClass } from '../lib/portal';

type Submission = {
  id: string;
  title: string;
  status: string;
  article_type: string | null;
  decision: string | null;
  decision_note: string | null;
  current_version: number;
  round: number;
  review_count: number;
  created_at: string;
};
type Review = { id: string; recommendation: string; comments_to_author: string | null; created_at: string };

export const AuthorHome = () => {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review[]>>({});
  const [revising, setRevising] = useState<string | null>(null);

  const load = () => {
    fetch('/api/submissions/mine')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSubs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setRevising(null);
    if (!reviews[id]) {
      const d = await fetch(`/api/submissions/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setReviews((prev) => ({ ...prev, [id]: Array.isArray(d?.reviews) ? d.reviews : [] }));
    }
  };

  const active = subs.filter((s) => !['published', 'rejected'].includes(s.status)).length;

  return (
    <PortalShell
      role="author"
      title="Author Dashboard"
      actions={
        <Link
          to="/admin/author/submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> Submit New Manuscript
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
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Active submissions" value={active} />
            <StatCard label="Total submissions" value={subs.length} />
            <StatCard label="Published" value={subs.filter((s) => s.status === 'published').length} />
          </div>

          <div className="overflow-hidden rounded-lg border border-outline-variant">
            <div className="border-b border-outline-variant bg-surface-container-low px-5 py-3">
              <h2 className="font-serif text-lg text-on-surface">Current Manuscripts</h2>
            </div>
            <ul className="divide-y divide-outline-variant">
              {subs.map((s) => (
                <li key={s.id} className="bg-surface-container-lowest">
                  <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                    <button type="button" onClick={() => toggle(s.id)} className="min-w-0 flex-1 text-left">
                      <p className="font-semibold text-on-surface">{s.title}</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {s.article_type ? `${ARTICLE_TYPE_LABEL[s.article_type] || s.article_type} · ` : ''}
                        Submitted {new Date(s.created_at).toLocaleDateString()}
                        {s.current_version > 1 ? ` · v${s.current_version}` : ''} · {s.review_count} review(s)
                      </p>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(s.status)}`}>
                        {SUBMISSION_STATUS_LABEL[s.status] || s.status}
                      </span>
                      {s.status === 'revisions_requested' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(s.id);
                            setRevising((r) => (r === s.id ? null : s.id));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary hover:bg-primary-dark"
                        >
                          <FileUp className="h-3.5 w-3.5" /> Upload Revision
                        </button>
                      )}
                    </div>
                  </div>

                  {open === s.id && (
                    <div className="border-t border-outline-variant px-5 py-4 text-sm">
                      {s.decision && (
                        <p className="mb-3">
                          <span className="font-semibold">Editor decision:</span> {s.decision}
                          {s.decision_note ? ` — ${s.decision_note}` : ''}
                        </p>
                      )}

                      {revising === s.id && (
                        <ReviseForm
                          submissionId={s.id}
                          onDone={() => {
                            setRevising(null);
                            setLoading(true);
                            load();
                          }}
                        />
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
          </div>
        </>
      )}
    </PortalShell>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
    <p className="mt-1 font-serif text-3xl text-on-surface">{String(value).padStart(2, '0')}</p>
  </div>
);

const ReviseForm = ({ submissionId, onDone }: { submissionId: string; onDone: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState('');
  const [supplementary, setSupplementary] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Please choose a revised manuscript file.');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('manuscript', file);
      fd.append('responseToReviewers', response);
      supplementary.forEach((f) => fd.append('supplementary', f));
      const res = await fetch(`/api/submissions/${submissionId}/revise`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      onDone();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Upload a revised version</p>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface px-4 py-3 text-sm hover:border-primary">
        <FileUp className="h-4 w-4 text-primary" />
        <span className={file ? 'text-on-surface' : 'text-on-surface-variant'}>
          {file ? file.name : 'Choose revised manuscript (.pdf, .doc, .docx)'}
        </span>
        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface px-4 py-2.5 text-sm hover:border-primary">
        <Upload className="h-4 w-4 text-primary" />
        <span className="text-on-surface-variant">Add supplementary files (optional)</span>
        <input type="file" multiple className="hidden" onChange={(e) => setSupplementary((p) => [...p, ...Array.from(e.target.files || [])])} />
      </label>
      {supplementary.length > 0 && (
        <p className="text-xs text-on-surface-variant">{supplementary.length} supplementary file(s) attached</p>
      )}
      <textarea
        rows={4}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Response to reviewers — describe how you addressed the feedback…"
        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? 'Uploading…' : 'Submit revision'}
        </button>
      </div>
    </form>
  );
};
