import { useMemo, useState } from 'react';
import { Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RichEditor } from '../components/RichEditor';

const DEFAULT_MESSAGE_HTML =
  `Dear Researcher,<br><br>` +
  `I hope you're doing well.<br><br>` +
  `I'm reaching out to personally invite you to contribute to <b>The Carbon Review</b>, a new open-access, peer-reviewed journal launched as a <b>GreenOccasion</b> initiative.<br><br>` +
  `At GreenOccasion, we believe that impactful sustainability research should be accessible to everyone—not limited by high publication costs or paywalls. Our mission is to provide researchers with a platform to publish their work at <b>no cost or only a minimal cost</b>, while ensuring that every published paper is freely available to readers around the world.<br><br>` +
  `More importantly, we want to help great research reach <b>millions of people</b>, creating greater awareness and inspiring action on climate change, carbon reduction, pollution, and sustainability.<br><br>` +
  `As we prepare to launch, it would be an honour to have you as one of our founding authors. We welcome original research articles, reviews, and perspectives.<br><br>` +
  `If you're interested, simply reply to this email or click <b>"I'm Interested"</b>, and we'll share the submission details.<br><br>` +
  `Thank you for considering our invitation. We hope you'll join us in making sustainability research more accessible and impactful.<br><br>` +
  `Warm regards,<br><br><b>The GreenOccasion Team</b><br>The Carbon Review`;

type Result = {
  total: number;
  attempted: number;
  sent: number;
  failed: number;
  failures: Array<{ email: string; error: string }>;
  cappedAt: number | null;
};

const field = 'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary';

export const AdminOutreach = () => {
  const [emails, setEmails] = useState('');
  const [subject, setSubject] = useState('Invitation to submit to The Carbon Review');
  const [message, setMessage] = useState(DEFAULT_MESSAGE_HTML);
  const [includeCta, setIncludeCta] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const count = useMemo(() => {
    const parsed: string[] = emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0);
    const unique: string[] = Array.from(new Set(parsed));
    const valid = unique.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return { total: unique.length, valid: valid.length };
  }, [emails]);

  const send = async () => {
    setSending(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/admin/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, subject, message, includeCta }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Send failed.');
      setResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-4xl font-bold text-on-surface">Send Emails</h1>
        <p className="text-on-surface-variant">Paste a list of author emails and send each an individual, branded invitation to register and submit.</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-on-surface">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>Emails send individually (recipients never see each other). Capped at <b>100 per send</b> (provider daily limit). To deliver to external addresses, verify your domain in the email provider first.</span>
      </div>

      <div className="space-y-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-on-surface">Recipient emails</span>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={4}
            placeholder="a@uni.edu, b@lab.org&#10;c@college.ac.in"
            className={`${field} font-mono text-xs`}
          />
          <span className="mt-1 block text-xs text-on-surface-variant">{count.valid} valid email{count.valid === 1 ? '' : 's'}{count.total !== count.valid ? ` (${count.total - count.valid} invalid/duplicate ignored)` : ''}</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-on-surface">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>

        <div>
          <span className="mb-1 block text-sm font-semibold text-on-surface">Message</span>
          <RichEditor initialHtml={message} onChange={setMessage} />
          <span className="mt-1 block text-xs text-on-surface-variant">Use the toolbar to bold text or add links. Sent as a normal, personal-looking email.</span>
        </div>

        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="checkbox" checked={includeCta} onChange={(e) => setIncludeCta(e.target.checked)} className="h-4 w-4" />
          Append the journal link + a one-click “I'm interested” button (captured under Author Leads)
        </label>

        <button
          type="button"
          onClick={send}
          disabled={sending || count.valid === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending…' : `Send to ${count.valid} recipient${count.valid === 1 ? '' : 's'}`}
        </button>

        {error && <p className="text-sm text-error">{error}</p>}
        {result && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${result.sent > 0 ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
            {result.sent > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>
              {result.sent > 0 ? `Email sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}.` : 'No emails were sent.'}
              {result.failed > 0 ? ` ${result.failed} failed — see details below.` : ''}
            </span>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
          <h2 className="font-serif text-xl font-bold text-on-surface">Result</h2>
          <div className="flex gap-6 text-sm">
            <span className="text-secondary"><b className="text-lg">{result.sent}</b> sent</span>
            {result.failed > 0 && <span className="text-error"><b className="text-lg">{result.failed}</b> failed</span>}
            <span className="text-on-surface-variant"><b className="text-lg">{result.attempted}</b> attempted of {result.total}</span>
          </div>
          {result.cappedAt && <p className="text-xs text-on-surface-variant">Only the first {result.cappedAt} were sent (daily cap). Send the rest in another batch.</p>}
          {result.failures.length > 0 && (
            <div className="rounded-md bg-error-container/40 p-3 text-xs text-on-surface">
              <p className="mb-1 font-semibold">Failures:</p>
              <ul className="space-y-0.5">
                {result.failures.map((f) => <li key={f.email}><span className="font-mono">{f.email}</span> — {f.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
