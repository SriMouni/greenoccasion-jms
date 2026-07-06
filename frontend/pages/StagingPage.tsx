import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, ArrowRight } from 'lucide-react';
import { StatCard } from '../components/StatCard';

type StagingTopic = { topic: string; paper_count: number; approved_count: number };
type Journal = { id: string; name: string };

export const StagingPage = () => {
  const [topics, setTopics] = useState<StagingTopic[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [journalId, setJournalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/staging/topics').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/journals').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([t, j]) => {
        setTopics(Array.isArray(t) ? t : []);
        setJournals(Array.isArray(j) ? j : []);
        setSelected(new Set());
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = (topic: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(topic) ? n.delete(topic) : n.add(topic);
      return n;
    });
  const allSelected = topics.length > 0 && selected.size === topics.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(topics.map((t) => t.topic)));

  const totalStaged = topics.reduce((n, t) => n + t.paper_count, 0);
  const selectedPapers = useMemo(
    () => topics.filter((t) => selected.has(t.topic)).reduce((n, t) => n + t.paper_count, 0),
    [topics, selected],
  );

  const mapSelected = async () => {
    if (!journalId || selected.size === 0) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/journals/${journalId}/map-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: [...selected] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Mapping failed');
      const jname = journals.find((j) => j.id === journalId)?.name || 'journal';
      setMsg(`Mapped ${d.topics} topic(s) → ${jname} (${d.moved} paper(s) ported).`);
      load();
    } catch (e: any) {
      setMsg(e.message || 'Mapping failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Staging</h1>
        <p className="text-on-surface-variant">
          Scraped content categorized by topic, awaiting assignment. Select topics and map them into a journal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Staged topics" value={topics.length} />
        <StatCard label="Staged papers" value={totalStaged} />
        <StatCard label="Journals" value={journals.length} />
      </div>

      {msg && <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-primary">{msg}</p>}

      {/* Bulk map bar */}
      {topics.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
          <span className="text-sm font-semibold text-on-surface">
            {selected.size} topic(s){selected.size ? ` · ${selectedPapers} paper(s)` : ''} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm">
              <option value="">Select journal…</option>
              {journals.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!journalId || selected.size === 0 || busy}
              onClick={mapSelected}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Map selected
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : topics.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant py-16 text-center">
          <Database className="mx-auto h-10 w-10 text-on-surface-variant/40" />
          <p className="mt-3 font-serif text-lg text-on-surface">Staging is empty</p>
          <p className="text-sm text-on-surface-variant">All scraped topics have been mapped to journals.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
                <th className="px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary" /></th>
                <th className="px-6 py-3 font-semibold">Topic</th>
                <th className="px-6 py-3 font-semibold">Papers</th>
                <th className="px-6 py-3 font-semibold">Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {topics.map((t) => (
                <tr
                  key={t.topic}
                  className={`cursor-pointer hover:bg-surface-container-low ${selected.has(t.topic) ? 'bg-primary/5' : ''}`}
                  onClick={() => toggle(t.topic)}
                >
                  <td className="px-4 py-4"><input type="checkbox" checked={selected.has(t.topic)} onChange={() => toggle(t.topic)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-primary" /></td>
                  <td className="px-6 py-4 font-semibold text-on-surface">{t.topic}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{t.paper_count}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{t.approved_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
