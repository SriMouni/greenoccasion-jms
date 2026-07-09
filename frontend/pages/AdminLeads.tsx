import { useEffect, useState } from 'react';
import { Loader2, Mail, AlertTriangle } from 'lucide-react';

type Lead = {
  id: string;
  name: string;
  email: string;
  affiliation: string | null;
  interest: string | null;
  message: string | null;
  status: string;
  journal_name: string | null;
  created_at: string;
};

const STATUSES = ['new', 'contacted', 'onboarded', 'archived'];

const statusPill = (s: string) => {
  switch (s) {
    case 'new': return 'bg-primary/10 text-primary';
    case 'contacted': return 'bg-secondary-container text-on-secondary-container';
    case 'onboarded': return 'bg-secondary-container text-on-secondary-container';
    default: return 'bg-surface-container-high text-on-surface-variant';
  }
};

export const AdminLeads = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [mailerConfigured, setMailerConfigured] = useState(true);
  const [saving, setSaving] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/author-leads')
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => {
        setLeads(Array.isArray(d?.leads) ? d.leads : []);
        setMailerConfigured(Boolean(d?.mailerConfigured));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (id: string, status: string) => {
    setSaving(id);
    try {
      await fetch(`/api/admin/author-leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setLeads((ls) => ls.map((x) => (x.id === id ? { ...x, status } : x)));
    } finally {
      setSaving('');
    }
  };

  const fresh = leads.filter((l) => l.status === 'new').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Author Leads</h1>
        <p className="text-on-surface-variant">
          Authors who expressed interest via the Call-for-Papers popup.
          {fresh > 0 && <span className="ml-2 font-semibold text-primary">{fresh} new</span>}
        </p>
      </div>

      {!mailerConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-on-surface">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>Email notifications are off — leads are still captured here. Set <code className="font-mono">RESEND_API_KEY</code> in the backend env to get an email on each new lead.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Interest</th>
              <th className="px-5 py-3 font-semibold">Received</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-on-surface-variant"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-on-surface-variant">No leads yet. They'll appear here as authors submit the popup.</td></tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className={`align-top hover:bg-surface-container-low ${l.status === 'new' ? 'bg-primary/5' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-on-surface">{l.name}</div>
                    {l.affiliation && <div className="text-xs text-on-surface-variant">{l.affiliation}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {l.email}
                    </a>
                  </td>
                  <td className="px-5 py-4 text-on-surface-variant">
                    <div>{l.interest || '—'}</div>
                    {l.message && <div className="mt-1 max-w-xs text-xs italic text-on-surface-variant/80">“{l.message}”</div>}
                  </td>
                  <td className="px-5 py-4 text-xs text-on-surface-variant">{new Date(l.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <select
                      value={l.status}
                      disabled={saving === l.id}
                      onChange={(e) => setStatus(l.id, e.target.value)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusPill(l.status)}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
