import nodemailer, { type Transporter } from 'nodemailer';

// Transactional mailer. Prefers SMTP (any free provider: Gmail, Brevo, your own host)
// when SMTP_HOST is set; falls back to the Resend HTTP API; otherwise a graceful no-op
// so lead capture keeps working without a provider.
//
// SMTP env (recommended free option):
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" for 465)
//   SMTP_FROM            — sender, e.g. "The Carbon Review <admin@greenoccasion.in>"
// Resend env (alternative):
//   RESEND_API_KEY, LEADS_FROM_EMAIL
// Common:
//   LEADS_NOTIFY_EMAIL   — where admin notifications go (default admin@greenoccasion.in)

type SendArgs = { to: string; subject: string; html: string; replyTo?: string };

const useSmtp = (): boolean => Boolean(process.env.SMTP_HOST);
const useResend = (): boolean => Boolean(process.env.RESEND_API_KEY);

export const isMailerConfigured = (): boolean => useSmtp() || useResend();

let cachedTransport: Transporter | null = null;
const smtpTransport = (): Transporter => {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587/STARTTLS
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Force IPv4 — Render (and many PaaS) have no outbound IPv6 route, so letting Node
    // pick the IPv6 address for smtp.gmail.com fails with ENETUNREACH.
    family: 4,
    // Fail fast if the host blocks outbound SMTP instead of hanging.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return cachedTransport;
};

const fromAddress = (): string =>
  process.env.SMTP_FROM ||
  process.env.LEADS_FROM_EMAIL ||
  process.env.SMTP_USER ||
  'The Carbon Review <onboarding@resend.dev>';

export const sendMail = async ({ to, subject, html, replyTo }: SendArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
  if (useSmtp()) {
    try {
      await smtpTransport().sendMail({ from: fromAddress(), to, subject, html, replyTo });
      return { ok: true };
    } catch (err: any) {
      console.error('[mailer] SMTP send failed:', err?.message);
      return { ok: false, error: err?.message };
    }
  }

  if (useResend()) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddress(), to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[mailer] Resend send failed:', res.status, detail);
        return { ok: false, error: `${res.status} ${detail}` };
      }
      return { ok: true };
    } catch (err: any) {
      console.error('[mailer] Resend send error:', err?.message);
      return { ok: false, error: err?.message };
    }
  }

  console.warn('[mailer] No provider configured (set SMTP_HOST or RESEND_API_KEY) — email skipped.');
  return { ok: false, skipped: true };
};

export const notifyEmail = (): string => process.env.LEADS_NOTIFY_EMAIL || 'admin@greenoccasion.in';
