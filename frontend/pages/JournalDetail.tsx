import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Pencil, Trash2, Users } from 'lucide-react';

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
type JournalRef = { id: string; name: string };

const THEMES = [
  { value: 'default', label: 'Green (default)' },
  { value: 'medical', label: 'Medical (blue)' },
  { value: 'amber', label: 'Amber' },
];

const field = 'rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';

export const JournalDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [j, setJ] = useState<Journal | null>(null);
  const [journals, setJournals] = useState<JournalRef[]>([]);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [renameTopic, setRenameTopic] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [paperEdit, setPaperEdit] = useState<string | null>(null);
  const [paperTopic, setPaperTopic] = useState('');
  const [paperJournal, setPaperJournal] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', acronym: '', status: 'active', theme: 'default' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/journals/${id}`).then((r) => (r.ok ? r.json() : null)).then(setJ);
    fetch('/api/journals').then((r) => (r.ok ? r.json() : [])).then((d) => setJournals(Array.isArray(d) ? d : []));
  }, [id]);
  useEffect(load, [load]);

  const papersByTopic = useMemo(() => {
    const map = new Map<string, Paper[]>();
    for (const p of j?.papers || []) {
      const key = p.topic || 'Untitled topic';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [j]);

  const api = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `${method} failed`);
    return res.json().catch(() => ({}));
  };

  const startEdit = () => {
    if (!j) return;
    setForm({ name: j.name, description: j.description || '', acronym: j.acronym || '', status: j.status, theme: j.theme || 'default' });
    setEditing(true);
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api(`/api/journals/${id}`, 'PUT', form); setEditing(false); load(); }
    catch (err: any) { alert(err.message); } finally { setBusy(false); }
  };

  const saveRename = async (e: FormEvent, from: string) => {
    e.preventDefault();
    const to = renameValue.trim();
    if (!to || to === from) return setRenameTopic(null);
    setBusy(true);
    try { await api(`/api/journals/${id}/topics/rename`, 'PUT', { from, to }); setRenameTopic(null); load(); }
    catch (err: any) { alert(err.message); } finally { setBusy(false); }
  };

  const deleteTopic = async (topic: string, count: number) => {
    if (!window.confirm(`Delete topic “${topic}” and its ${count} paper(s)? This cannot be undone.`)) return;
    setBusy(true);
    try { await api(`/api/journals/${id}/topics`, 'DELETE', { topic }); load(); }
    catch (err: any) { alert(err.message); } finally { setBusy(false); }
  };

  const startPaperEdit = (p: Paper) => {
    setPaperEdit(p.id);
    setPaperTopic(p.topic || '');
    setPaperJournal(id || '');
  };
  const savePaper = async (e: FormEvent, p: Paper) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/papers/${p.id}`, 'PATCH', { topic: paperTopic, journalId: paperJournal });
      setPaperEdit(null);
      load();
    } catch (err: any) { alert(err.message); } finally { setBusy(false); }
  };
  const deletePaper = async (p: Paper) => {
    if (!window.confirm(`Permanently delete “${p.title}”?`)) return;
    setBusy(true);
    try { await api(`/api/admin/papers/${p.id}`, 'DELETE'); load(); }
    catch (err: any) { alert(err.message); } finally { setBusy(false); }
  };

  const deleteJournal = async () => {
    if (!j || !window.confirm(`Delete “${j.name}”? Its papers return to staging.`)) return;
    setBusy(true);
    try { await api(`/api/journals/${id}`, 'DELETE'); navigate('/admin/journals', { replace: true }); }
    catch (err: any) { alert(err.message); setBusy(false); }
  };

  if (!j) {
    return <div className="flex items-center gap-2 py-16 text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/admin/journals" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to journals
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            <Pencil className="h-4 w-4" /> Edit
          </button>
          {j.id !== 'jrnl_green_occasion' && (
            <button type="button" disabled={busy} onClick={deleteJournal} className="inline-flex items-center gap-1.5 rounded-lg border border-error/40 px-3 py-1.5 text-sm font-bold text-error hover:bg-error-container/40 disabled:opacity-50">
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
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={`mt-1 w-full ${field}`} required />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={`mt-1 w-full ${field}`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Acronym</label>
              <input value={form.acronym} onChange={(e) => setForm((f) => ({ ...f, acronym: e.target.value }))} className={`mt-1 w-full ${field}`} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Site theme</label>
              <select value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className={`mt-1 w-full ${field}`}>
                {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={`mt-1 w-full ${field}`}>
                <option value="active">active</option>
                <option value="draft">draft</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">Cancel</button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold text-on-surface">{j.name}</h1>
            <p className="font-mono-label text-xs text-on-surface-variant">/{j.slug}{j.acronym ? ` · ${j.acronym}` : ''} · {j.theme} theme</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${j.status === 'active' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{j.status}</span>
        </div>
        {j.description && <p className="mt-3 text-sm text-on-surface-variant">{j.description}</p>}
      </div>

      {/* Unified Topics — derived from the papers, with per-topic and per-paper controls */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-on-surface">
          <FileText className="h-4 w-4" /> Topics &amp; papers ({j.papers.length})
        </h2>
        {papersByTopic.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No papers in this journal yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {papersByTopic.map(([topic, papers]) => (
              <li key={topic} className="rounded-md border border-outline-variant">
                {renameTopic === topic ? (
                  <form onSubmit={(e) => saveRename(e, topic)} className="flex items-center gap-2 px-4 py-2.5">
                    <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className={`flex-1 ${field}`} />
                    <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setRenameTopic(null)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant">Cancel</button>
                  </form>
                ) : (
                  <div className="flex w-full items-center justify-between px-4 py-3">
                    <button type="button" onClick={() => setOpenTopic(openTopic === topic ? null : topic)} className="flex-1 text-left font-semibold text-on-surface">{topic}</button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant">{papers.length}</span>
                      <button type="button" title="Rename topic" onClick={() => { setRenameTopic(topic); setRenameValue(topic); }} className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Delete topic + papers" onClick={() => deleteTopic(topic, papers.length)} className="rounded p-1 text-on-surface-variant hover:bg-error-container/40 hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}

                {openTopic === topic && (
                  <ul className="border-t border-outline-variant/60 px-3 py-2">
                    {papers.map((p) => (
                      <li key={p.id} className="border-b border-outline-variant/40 py-2 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{p.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === 'approved' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{p.status}</span>
                          <button type="button" title="Change topic / journal" onClick={() => startPaperEdit(p)} className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" title="Delete paper" onClick={() => deletePaper(p)} className="rounded p-1 text-on-surface-variant hover:bg-error-container/40 hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        {paperEdit === p.id && (
                          <form onSubmit={(e) => savePaper(e, p)} className="mt-2 grid gap-2 rounded-md bg-surface-container p-3 sm:grid-cols-[1fr_1fr_auto]">
                            <input value={paperTopic} onChange={(e) => setPaperTopic(e.target.value)} placeholder="Topic" className={field} />
                            <select value={paperJournal} onChange={(e) => setPaperJournal(e.target.value)} className={field}>
                              <option value="">→ Staging (unassigned)</option>
                              {journals.map((jr) => <option key={jr.id} value={jr.id}>{jr.name}</option>)}
                            </select>
                            <div className="flex gap-1">
                              <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50">Save</button>
                              <button type="button" onClick={() => setPaperEdit(null)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant">Cancel</button>
                            </div>
                          </form>
                        )}
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
