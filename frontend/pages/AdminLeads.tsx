import { useEffect, useState } from 'react';
import { Loader2, Mail, AlertTriangle, Sparkles, Send } from 'lucide-react';

type Lead = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  affiliation: string | null;
  interest: string | null;
  message: string | null;
  status: string;
  journal_name: string | null;
  created_at: string;
};

type Contact = {
  id: string;
  email: string;
  source: string;
  confidence: number | null;
  captured_at: string;
  author_name: string;
  institution: string | null;
  orcid: string | null;
};

const STATUSES = ['new', 'interested', 'contacted', 'onboarded', 'archived'];

const statusPill = (s: string) => {
  switch (s) {
    case 'new': return 'bg-primary/10 text-primary';
    case 'interested': return 'bg-primary text-on-primary';
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [harvesting, setHarvesting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  const sendTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const r = await fetch('/api/admin/mailer/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (d.ok) setTestResult(`✓ Sent to ${d.to}. Check that inbox (and spam).`);
      else if (d.skipped) setTestResult('⚠ No provider configured — SMTP_HOST / RESEND_API_KEY not set on the server.');
      else setTestResult(`✗ Failed: ${d.error || 'unknown error'}`);
    } catch (e: any) {
      setTestResult(`✗ Request failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

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
  const loadContacts = () => {
    fetch('/api/admin/author-contacts')
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(Array.isArray(d?.contacts) ? d.contacts : []));
  };
  useEffect(() => { load(); loadContacts(); }, []);

  const runHarvest = async () => {
    setHarvesting(true);
    try {
      await fetch('/api/admin/authors/harvest-contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }),
      });
      // The job runs in the background; give it a moment, then refresh the list.
      window.setTimeout(() => { loadContacts(); setHarvesting(false); }, 8000);
    } catch { setHarvesting(false); }
  };

  const [emailing, setEmailing] = useState('');
  const [sentMsg, setSentMsg] = useState<Record<string, string>>({});

  const sendInvite = async (id: string) => {
    setEmailing(id);
    setSentMsg((m) => ({ ...m, [id]: '' }));
    try {
      const r = await fetch(`/api/admin/author-leads/${id}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        setSentMsg((m) => ({ ...m, [id]: '✓ Sent' }));
        setLeads((ls) => ls.map((x) => (x.id === id && x.status === 'new' ? { ...x, status: 'contacted' } : x)));
      } else {
        setSentMsg((m) => ({ ...m, [id]: `✗ ${d.skipped ? 'Email not configured' : (d.error || 'failed')}` }));
      }
    } catch (e: any) {
      setSentMsg((m) => ({ ...m, [id]: `✗ ${e.message}` }));
    } finally {
      setEmailing('');
    }
  };

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

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm">
        {!mailerConfigured && (
          <span className="flex items-center gap-2 text-on-surface">
            <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
            Email is off — leads still captured. Set SMTP (or Resend) env on the server.
          </span>
        )}
        <button
          type="button"
          onClick={sendTest}
          disabled={testing}
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send test email
        </button>
        {testResult && <span className="text-xs text-on-surface-variant">{testResult}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Interest</th>
              <th className="px-5 py-3 font-semibold">Received</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-on-surface-variant"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-on-surface-variant">No leads yet. They'll appear here as authors submit the popup.</td></tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className={`align-top hover:bg-surface-container-low ${l.status === 'new' ? 'bg-primary/5' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-on-surface">{l.name || '—'}</div>
                    {l.affiliation && <div className="text-xs text-on-surface-variant">{l.affiliation}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Mail className="h-3.5 w-3.5" /> {l.email}
                    </a>
                    {l.phone && <div className="mt-1 text-xs text-on-surface-variant">{l.phone}</div>}
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
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => sendInvite(l.id)}
                      disabled={emailing === l.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
                    >
                      {emailing === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {l.status === 'new' ? 'Send invite' : 'Resend'}
                    </button>
                    {sentMsg[l.id] && <div className="mt-1 text-[11px] text-on-surface-variant">{sentMsg[l.id]}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Harvested corresponding-author emails from stored OA PDFs */}
      <div className="space-y-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-bold text-on-surface">Harvested Author Contacts</h2>
            <p className="text-sm text-on-surface-variant">
              Corresponding-author emails extracted from stored open-access PDFs — for editorial outreach.
            </p>
          </div>
          <button
            type="button"
            onClick={runHarvest}
            disabled={harvesting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
          >
            {harvesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {harvesting ? 'Harvesting…' : 'Harvest emails'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
                <th className="px-5 py-3 font-semibold">Author</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Captured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {contacts.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-on-surface-variant">No harvested contacts yet. Click “Harvest emails” to scan stored PDFs.</td></tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-low">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-on-surface">{c.author_name}</div>
                      {c.institution && c.institution !== 'Unknown' && <div className="text-xs text-on-surface-variant">{c.institution}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-3.5 w-3.5" /> {c.email}</a>
                    </td>
                    <td className="px-5 py-3 text-xs text-on-surface-variant">{c.source}</td>
                    <td className="px-5 py-3 text-xs text-on-surface-variant">{new Date(c.captured_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
