import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, FolderTree, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';

type Topic = { id: string; name: string; slug: string; parent_id: string | null };
type Author = { id: string; full_name: string | null; email: string | null; submissions: number };
type Paper = { id: string; title: string; topic: string | null; status: string };
type Journal = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  acronym: string | null;
  issn_print: string | null;
  issn_online: string | null;
  doi_prefix: string | null;
  status: string;
  theme: string;
  topics: Topic[];
  authors: Author[];
  papers: Paper[];
};

// Palette keys the public site understands (see web/src/index.css theme presets).
const THEMES = [
  { value: 'default', label: 'Green (default)' },
  { value: 'medical', label: 'Medical (blue)' },
  { value: 'amber', label: 'Amber' },
];

export const JournalDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [j, setJ] = useState<Journal | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [renameTopic, setRenameTopic] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', acronym: '', status: 'active', theme: 'default' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/journals/${id}`).then((r) => (r.ok ? r.json() : null)).then(setJ);
  }, [id]);
  useEffect(load, [load]);

  const startEdit = () => {
    if (!j) return;
    setForm({
      name: j.name, description: j.description || '', acronym: j.acronym || '',
      status: j.status, theme: j.theme || 'default',
    });
    setEditing(true);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/journals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Save failed');
      setEditing(false);
      load();
    } catch (err: any) {
      alert(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const papersByTopic = useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const p of j?.papers || []) {
      const key = p.topic || 'Untitled topic';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [j]);

  const saveRename = async (e: FormEvent, from: string) => {
    e.preventDefault();
    const to = renameValue.trim();
    if (!to || to === from) return setRenameTopic(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/journals/${id}/topics/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Rename failed');
      setRenameTopic(null);
      load();
    } catch (err: any) {
      alert(err.message || 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteJournal = async () => {
    if (!j || !window.confirm(`Delete “${j.name}”? Its papers return to staging.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/journals/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'Delete failed');
      }
      navigate('/admin/journals', { replace: true });
    } catch (e: any) {
      alert(e.message || 'Delete failed');
      setBusy(false);
    }
  };

  const addTopic = async (e: FormEvent, parentId: string | null, name: string) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/journals/${id}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      setNewTopic('');
      setSubName('');
      setSubFor(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!j) {
    return (
      <div className="flex items-center gap-2 py-16 text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const topLevel = j.topics.filter((t) => !t.parent_id);
  const subsOf = (pid: string) => j.topics.filter((t) => t.parent_id === pid);
  const field = 'rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/admin/journals" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to journals
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          {j.id !== 'jrnl_green_occasion' && (
            <button
              type="button"
              disabled={busy}
              onClick={deleteJournal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-error/40 px-3 py-1.5 text-sm font-bold text-error hover:bg-error-container/40 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Delete journal
            </button>
          )}
        </div>
      </div>

      {editing && (
        <form onSubmit={saveEdit} className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Edit journal</h2>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Journal name (site heading)</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Acronym</label>
              <input value={form.acronym} onChange={(e) => setForm((f) => ({ ...f, acronym: e.target.value }))} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Site theme</label>
              <select value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm">
                {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm">
                <option value="active">active</option>
                <option value="draft">draft</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold text-on-surface">{j.name}</h1>
            <p className="font-mono-label text-xs text-on-surface-variant">/{j.slug}{j.acronym ? ` · ${j.acronym}` : ''}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${j.status === 'active' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
            {j.status}
          </span>
        </div>
        {j.description && <p className="mt-3 text-sm text-on-surface-variant">{j.description}</p>}
        {(j.issn_print || j.issn_online || j.doi_prefix) && (
          <p className="mt-2 text-xs text-on-surface-variant">
            {j.issn_print && `ISSN (print) ${j.issn_print} · `}
            {j.issn_online && `ISSN (online) ${j.issn_online} · `}
            {j.doi_prefix && `DOI ${j.doi_prefix}`}
          </p>
        )}
      </div>

      {/* Topics */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
          <FolderTree className="h-4 w-4" /> Topics &amp; subtopics
        </h2>

        {topLevel.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No topics mapped yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {topLevel.map((t) => (
              <li key={t.id} className="rounded-md border border-outline-variant p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-on-surface">{t.name}</span>
                  <button
                    type="button"
                    onClick={() => setSubFor(subFor === t.id ? null : t.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Subtopic
                  </button>
                </div>
                {subsOf(t.id).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {subsOf(t.id).map((s) => (
                      <span key={s.id} className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs text-on-surface-variant">
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
                {subFor === t.id && (
                  <form onSubmit={(e) => addTopic(e, t.id, subName)} className="mt-2 flex gap-2">
                    <input autoFocus value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Subtopic name" className={`${field} flex-1`} />
                    <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-50">Add</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(e) => addTopic(e, null, newTopic)} className="mt-4 flex gap-2">
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic (e.g. Orthopedics)" className={`${field} flex-1`} />
          <button type="submit" disabled={busy || !newTopic.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
            <Plus className="h-4 w-4" /> Add topic
          </button>
        </form>
        <p className="mt-2 text-xs text-on-surface-variant">
          Mapping staged content into these topics ports it to this journal (next phase).
        </p>
      </div>

      {/* Papers grouped by topic */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
          <FileText className="h-4 w-4" /> Papers by topic ({j.papers.length})
        </h2>
        {papersByTopic.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No papers mapped into this journal yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {papersByTopic.map(([topic, papers]) => (
              <li key={topic} className="rounded-md border border-outline-variant">
                {renameTopic === topic ? (
                  <form onSubmit={(e) => saveRename(e, topic)} className="flex items-center gap-2 px-4 py-2.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                    />
                    <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setRenameTopic(null)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant">Cancel</button>
                  </form>
                ) : (
                  <div className="flex w-full items-center justify-between px-4 py-3">
                    <button type="button" onClick={() => setOpenTopic(openTopic === topic ? null : topic)} className="flex-1 text-left font-semibold text-on-surface">
                      {topic}
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-on-surface-variant">{papers.length} paper(s)</span>
                      <button
                        type="button"
                        title="Rename topic"
                        onClick={() => { setRenameTopic(topic); setRenameValue(topic); }}
                        className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                {openTopic === topic && (
                  <ul className="border-t border-outline-variant/60 px-4 py-2">
                    {papers.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate text-on-surface">{p.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === 'approved' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {p.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Authors */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
          <Users className="h-4 w-4" /> Authors ({j.authors.length})
        </h2>
        {j.authors.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No authors have submitted to this journal yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant/60">
            {j.authors.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-on-surface">{a.full_name || a.email || 'Author'}</span>
                <span className="text-xs text-on-surface-variant">{a.submissions} submission(s)</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
