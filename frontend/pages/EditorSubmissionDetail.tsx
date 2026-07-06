import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader2, Sparkles } from 'lucide-react';
import { SUBMISSION_STATUS_LABEL, statusBadgeClass, jsonPost } from '../lib/portal';

type Review = {
  id: string;
  recommendation: string;
  comments_to_author: string | null;
  comments_to_editor?: string | null;
  reviewer_name?: string | null;
  score_originality?: number | null;
  score_rigor?: number | null;
  score_significance?: number | null;
  score_clarity?: number | null;
  created_at: string;
};
type Assignment = {
  id: string;
  status: string;
  invited_at: string;
  due_date: string | null;
  responded_at: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  submitted: number;
};
type Submission = {
  id: string;
  title: string;
  abstract: string;
  keywords: string | null;
  article_type: string | null;
  status: string;
  decision: string | null;
  decision_note: string | null;
  manuscript_path: string | null;
  current_version: number;
  reviews: Review[];
  assignments: Assignment[];
};
type Reviewer = { id: string; username: string; full_name: string | null; email: string | null };

const DECISIONS = [
  { key: 'accept', label: 'Accept & Publish', cls: 'bg-primary text-on-primary' },
  { key: 'minor', label: 'Minor revisions', cls: 'bg-surface-container text-on-surface' },
  { key: 'major', label: 'Major revisions', cls: 'bg-surface-container text-on-surface' },
  { key: 'reject', label: 'Reject', cls: 'bg-error-container text-on-error-container' },
];

const RUBRIC: { key: keyof Review; label: string }[] = [
  { key: 'score_originality', label: 'Originality' },
  { key: 'score_rigor', label: 'Rigor' },
  { key: 'score_significance', label: 'Significance' },
  { key: 'score_clarity', label: 'Clarity' },
];

const assignmentBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-secondary-container text-on-secondary-container';
    case 'accepted':
      return 'bg-primary/10 text-primary';
    case 'declined':
      return 'bg-error-container text-on-error-container';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
};

export const EditorSubmissionDetail = () => {
  const { id } = useParams();
  const [sub, setSub] = useState<Submission | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [pick, setPick] = useState('');
  const [dueDays, setDueDays] = useState(21);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [s, rev] = await Promise.all([
      fetch(`/api/submissions/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/editor/reviewers').then((r) => (r.ok ? r.json() : [])),
    ]);
    setSub(s);
    setReviewers(Array.isArray(rev) ? rev : []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async () => {
    if (!pick) return;
    setBusy('assign');
    setError('');
    try {
      await jsonPost(`/api/editor/submissions/${id}/assign`, { reviewerUserId: pick, dueDays });
      setPick('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const decide = async (decision: string) => {
    setBusy(decision);
    setError('');
    try {
      await jsonPost(`/api/editor/submissions/${id}/decision`, { decision, note });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const generateLetter = async (decision: string) => {
    setBusy('letter');
    setError('');
    try {
      const r = await fetch(`/api/editor/submissions/${id}/decision-letter?decision=${decision}`);
      const d = await r.json();
      if (d?.draft) setNote(d.draft);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  if (!sub) {
    return (
      <div className="flex items-center gap-2 py-16 text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const terminal = sub.status === 'published' || sub.status === 'rejected';
  const noReviewsYet = sub.reviews.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <Link to="/admin/submissions" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-2xl font-bold text-on-surface">{sub.title}</h1>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(sub.status)}`}>
            {SUBMISSION_STATUS_LABEL[sub.status] || sub.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-on-surface-variant">
          {sub.article_type ? `${sub.article_type} · ` : ''}Version {sub.current_version}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-on-surface-variant">{sub.abstract}</p>
        {sub.keywords && <p className="mt-2 text-xs text-on-surface-variant">Keywords: {sub.keywords}</p>}
        {sub.manuscript_path && (
          <a
            href={`/api/submissions/${sub.id}/manuscript`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            <FileDown className="h-4 w-4" /> Manuscript (v{sub.current_version})
          </a>
        )}
      </div>

      {/* Triage: desk reject before review */}
      {!terminal && noReviewsYet && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Triage</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Reject without review if the manuscript is out of scope or below threshold.
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => decide('desk_reject')}
            className="mt-3 rounded-lg border border-error/40 px-4 py-2 text-sm font-bold text-error hover:bg-error-container/40 disabled:opacity-50"
          >
            {busy === 'desk_reject' ? '…' : 'Desk Reject'}
          </button>
        </div>
      )}

      {/* Assign reviewers + roster */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Reviewers</h2>

        {sub.assignments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {sub.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-container px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-on-surface">{a.reviewer_name || a.reviewer_email || 'Reviewer'}</span>
                  {a.due_date && (
                    <span className="ml-2 text-xs text-on-surface-variant">due {new Date(a.due_date).toLocaleDateString()}</span>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${assignmentBadge(a.status)}`}>{a.status}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm">
            <option value="">Select a reviewer…</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name || r.username}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-on-surface-variant">
            due in
            <input
              type="number"
              min={1}
              value={dueDays}
              onChange={(e) => setDueDays(Number(e.target.value) || 21)}
              className="w-16 rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm"
            />
            days
          </label>
          <button type="button" disabled={!pick || busy === 'assign'} onClick={assign} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
            {busy === 'assign' ? 'Inviting…' : 'Invite'}
          </button>
          {reviewers.length === 0 && (
            <span className="text-xs text-on-surface-variant">
              No reviewers yet — promote users to “reviewer” under{' '}
              <Link to="/admin/users" className="font-bold text-primary">Users</Link>.
            </span>
          )}
        </div>
      </div>

      {/* Reviews with rubric scores */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Reviews ({sub.reviews.length})</h2>
        {sub.reviews.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No reviews submitted yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sub.reviews.map((r) => (
              <li key={r.id} className="rounded-md bg-surface-container px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-primary">
                    {r.reviewer_name || 'Reviewer'} · {r.recommendation}
                  </p>
                </div>
                {RUBRIC.some((x) => r[x.key] != null) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {RUBRIC.map((x) => (
                      <span key={x.key} className="rounded bg-surface px-2 py-0.5 text-xs text-on-surface-variant">
                        {x.label}: <span className="font-bold text-on-surface">{(r[x.key] as number) ?? '—'}/5</span>
                      </span>
                    ))}
                  </div>
                )}
                {r.comments_to_author && (
                  <p className="mt-2"><span className="font-semibold">To author:</span> {r.comments_to_author}</p>
                )}
                {r.comments_to_editor && (
                  <p className="mt-1 text-on-surface-variant"><span className="font-semibold">To editor:</span> {r.comments_to_editor}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Decision */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Editorial decision</h2>
        {sub.decision && (
          <p className="mt-2 text-sm">
            Current: <span className="font-bold">{sub.decision}</span>
            {sub.decision_note ? ` — ${sub.decision_note}` : ''}
          </p>
        )}
        {terminal ? (
          <p className="mt-2 text-sm text-on-surface-variant">This submission is finalized ({sub.status}).</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {['minor', 'major', 'reject', 'accept'].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={busy === 'letter'}
                  onClick={() => generateLetter(d)}
                  className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Draft {d} letter
                </button>
              ))}
            </div>
            <textarea
              rows={note ? 8 : 3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Decision letter to the author (use a draft button above to auto-fill from reviews)"
              className="mt-3 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {DECISIONS.map((d) => (
                <button key={d.key} type="button" disabled={!!busy} onClick={() => decide(d.key)} className={`rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50 ${d.cls}`}>
                  {busy === d.key ? '…' : d.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">Accepting publishes the paper to the public library.</p>
          </>
        )}
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </div>
    </div>
  );
};
