import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Plus, X } from 'lucide-react';
import { StatCard } from '../components/StatCard';

type Journal = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  paper_count: number;
  submission_count: number;
  topic_count: number;
};

export const JournalsPage = () => {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/journals')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setJournals(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl font-bold text-on-surface">Journals</h1>
          <p className="text-on-surface-variant">Each journal is a distinct front-end site served from its own scoped data.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> Create Journal
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Journals" value={journals.length} />
        <StatCard label="Published papers" value={journals.reduce((n, j) => n + j.paper_count, 0)} />
        <StatCard label="Submissions" value={journals.reduce((n, j) => n + j.submission_count, 0)} />
      </div>

      {creating && <CreateJournal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : journals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-on-surface-variant/40" />
          <p className="mt-3 font-serif text-lg text-on-surface">No journals yet</p>
          <p className="text-sm text-on-surface-variant">Create your first journal to start mapping topics.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {journals.map((j) => (
            <Link
              key={j.id}
              to={`/admin/journals/${j.id}`}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 transition hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl font-bold text-on-surface">{j.name}</h2>
                  <p className="font-mono-label text-xs text-on-surface-variant">/{j.slug}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${j.status === 'active' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  {j.status}
                </span>
              </div>
              {j.description && <p className="mt-2 line-clamp-2 text-sm text-on-surface-variant">{j.description}</p>}
              <div className="mt-4 flex gap-4 text-xs text-on-surface-variant">
                <span><b className="text-on-surface">{j.topic_count}</b> topics</span>
                <span><b className="text-on-surface">{j.paper_count}</b> papers</span>
                <span><b className="text-on-surface">{j.submission_count}</b> submissions</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const CreateJournal = ({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [acronym, setAcronym] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, acronym }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Create failed');
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none';

  return (
    <form onSubmit={submit} className="rounded-lg border border-primary/30 bg-primary/5 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">New journal</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Journal name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Medical Journal" required />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Acronym (for DOIs)</label>
          <input value={acronym} onChange={(e) => setAcronym(e.target.value)} className={field} placeholder="med" />
        </div>
      </div>
      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Description</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create journal
      </button>
    </form>
  );
};
