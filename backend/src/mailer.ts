// Minimal transactional mailer. Uses the Resend HTTP API when configured; otherwise
// it's a graceful no-op so lead capture still works without an email provider.
//
// Env:
//   RESEND_API_KEY     — enables sending (kept in .env, never committed)
//   LEADS_FROM_EMAIL   — verified sender, e.g. "The Carbon Review <noreply@thecarbonreview.org>"
//   LEADS_NOTIFY_EMAIL — where admin notifications go (defaults to the site owner)

type SendArgs = { to: string; subject: string; html: string; replyTo?: string };

export const isMailerConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY);

export const sendMail = async ({ to, subject, html, replyTo }: SendArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEADS_FROM_EMAIL || 'The Carbon Review <onboarding@resend.dev>';
  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY not set — email skipped (lead still stored).');
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[mailer] send failed:', res.status, detail);
      return { ok: false, error: `${res.status} ${detail}` };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('[mailer] send error:', err?.message);
    return { ok: false, error: err?.message };
  }
};

export const notifyEmail = (): string => process.env.LEADS_NOTIFY_EMAIL || 'admin@greenoccasion.in';
