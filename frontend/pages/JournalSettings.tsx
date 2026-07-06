import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

type Settings = {
  double_blind: boolean;
  review_due_days: number;
  journal_name: string | null;
  journal_acronym: string | null;
  issn_print: string | null;
  issn_online: string | null;
  doi_prefix: string | null;
};

const field = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none';
const label = 'text-xs font-semibold uppercase tracking-wide text-on-surface-variant';

export const JournalSettings = () => {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/journal/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then(setS);
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/journal/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doubleBlind: s.double_blind,
          reviewDueDays: s.review_due_days,
          journalName: s.journal_name,
          journalAcronym: s.journal_acronym,
          issnPrint: s.issn_print,
          issnOnline: s.issn_online,
          doiPrefix: s.doi_prefix,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Save failed');
      setSaved(true);
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!s) {
    return (
      <div className="flex items-center gap-2 py-16 text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const set = (patch: Partial<Settings>) => {
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Journal Settings</h1>
        <p className="text-on-surface-variant">Editorial policy and identifiers.</p>
      </div>

      <section className="space-y-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Peer review</h2>
        <label className="flex items-center justify-between gap-4 rounded-md border border-outline-variant bg-surface px-4 py-3 text-sm">
          <span>
            <span className="font-semibold text-on-surface">Double-blind review</span>
            <span className="block text-xs text-on-surface-variant">Hide author identities from reviewers.</span>
          </span>
          <input type="checkbox" checked={s.double_blind} onChange={(e) => set({ double_blind: e.target.checked })} className="h-5 w-5 accent-primary" />
        </label>
        <div>
          <label className={label}>Default review deadline (days)</label>
          <input type="number" min={1} value={s.review_due_days} onChange={(e) => set({ review_due_days: Number(e.target.value) || 21 })} className={`${field} max-w-[120px]`} />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Journal identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Journal name</label>
            <input value={s.journal_name || ''} onChange={(e) => set({ journal_name: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Acronym (for DOIs)</label>
            <input value={s.journal_acronym || ''} onChange={(e) => set({ journal_acronym: e.target.value })} className={field} placeholder="go" />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Identifiers</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            ISSN &amp; DOI display land in a later phase — configure the values here now. Applying for an ISSN and
            joining Crossref are external steps.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Print ISSN</label>
            <input value={s.issn_print || ''} onChange={(e) => set({ issn_print: e.target.value })} className={field} placeholder="XXXX-XXXX" />
          </div>
          <div>
            <label className={label}>Online ISSN</label>
            <input value={s.issn_online || ''} onChange={(e) => set({ issn_online: e.target.value })} className={field} placeholder="XXXX-XXXX" />
          </div>
          <div>
            <label className={label}>DOI prefix</label>
            <input value={s.doi_prefix || ''} onChange={(e) => set({ doi_prefix: e.target.value })} className={field} placeholder="10.12345" />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </button>
        {saved && <span className="text-sm font-semibold text-primary">Saved ✓</span>}
      </div>
    </div>
  );
};
