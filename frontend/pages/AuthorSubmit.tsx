import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';

type CoAuthor = { name: string; email: string; affiliation: string };

export const AuthorSubmit = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [authors, setAuthors] = useState<CoAuthor[]>([{ name: '', email: '', affiliation: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setAuthor = (i: number, key: keyof CoAuthor, val: string) =>
    setAuthors((a) => a.map((x, idx) => (idx === i ? { ...x, [key]: val } : x)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('abstract', abstract);
      fd.append('keywords', keywords);
      fd.append('authors', JSON.stringify(authors.filter((a) => a.name.trim())));
      if (file) fd.append('manuscript', file);
      const res = await fetch('/api/submissions', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Submission failed');
      navigate('/admin/author', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm';

  return (
    <PortalShell role="author" title="New Submission">
      <form onSubmit={submit} className="max-w-3xl space-y-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Title *</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>

        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Abstract *</label>
          <textarea required rows={6} value={abstract} onChange={(e) => setAbstract(e.target.value)} className={field} />
        </div>

        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Keywords (comma-separated)</label>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={field} placeholder="composting, waste, urban" />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-on-surface-variant">Authors</label>
            <button
              type="button"
              onClick={() => setAuthors((a) => [...a, { name: '', email: '', affiliation: '' }])}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Add author
            </button>
          </div>
          <div className="mt-2 space-y-3">
            {authors.map((a, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-outline-variant p-3 sm:grid-cols-3">
                <input placeholder="Full name" value={a.name} onChange={(e) => setAuthor(i, 'name', e.target.value)} className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm" />
                <input placeholder="Email" value={a.email} onChange={(e) => setAuthor(i, 'email', e.target.value)} className="rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm" />
                <div className="flex gap-2">
                  <input placeholder="Affiliation" value={a.affiliation} onChange={(e) => setAuthor(i, 'affiliation', e.target.value)} className="flex-1 rounded border border-outline-variant bg-surface px-2 py-1.5 text-sm" />
                  {authors.length > 1 && (
                    <button type="button" onClick={() => setAuthors((x) => x.filter((_, idx) => idx !== i))} className="rounded p-1.5 text-error hover:bg-error-container/40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-on-surface-variant">Manuscript (PDF/DOC)</label>
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Submitting…' : 'Submit manuscript'}
          </button>
          <button type="button" onClick={() => navigate('/admin/author')} className="rounded-lg border border-outline-variant px-6 py-3 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">
            Cancel
          </button>
        </div>
      </form>
    </PortalShell>
  );
};
