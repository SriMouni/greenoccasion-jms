// Branded, email-client-safe HTML template (inline styles + table layout).
// Used for author-facing outreach so every email looks consistent and professional.

type BrandedEmail = {
  journalName: string;
  heading?: string;
  bodyHtml: string; // already-safe HTML (caller escapes user input)
  cta?: { label: string; url: string };
  cta2?: { label: string; url: string };
  footerNote?: string;
};

export const renderBrandedEmail = ({ journalName, heading, bodyHtml, cta, cta2, footerNote }: BrandedEmail): string => `
<div style="margin:0;padding:0;background:#eef2f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(4,47,46,0.08);">
        <tr><td style="background:#134e4a;padding:30px 34px;">
          <div style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:bold;letter-spacing:-0.2px;">${journalName}</div>
          <div style="color:#99f6e4;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Open-Access Climate &amp; Sustainability Research</div>
        </td></tr>
        <tr><td style="padding:34px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          ${heading ? `<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#111827;">${heading}</h1>` : ''}
          <div style="font-size:15px;line-height:1.65;color:#374151;">${bodyHtml}</div>
          ${cta || cta2 ? `<div style="margin:30px 0 6px;">
            ${cta ? `<a href="${cta.url}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-weight:bold;font-size:14px;display:inline-block;font-family:Arial,sans-serif;margin:0 8px 8px 0;">${cta.label}</a>` : ''}
            ${cta2 ? `<a href="${cta2.url}" style="background:#ffffff;color:#0d9488;border:1.5px solid #0d9488;text-decoration:none;padding:11px 24px;border-radius:9px;font-weight:bold;font-size:14px;display:inline-block;font-family:Arial,sans-serif;margin:0 8px 8px 0;">${cta2.label}</a>` : ''}
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:22px 34px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;">
          ${footerNote || `You're receiving this because you may be interested in publishing with ${journalName}.`}
          <br/>© 2026 ${journalName}. Open access under CC BY 4.0. Reply to this email to opt out.
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;

// Escape user-entered text and preserve line breaks for insertion into the body.
export const textToHtml = (text: string): string =>
  String(text || '').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/\n/g, '<br/>');

// A plain, personal-looking email (no branded header/footer/buttons) so outreach
// reads like a normal message rather than an advertisement. Optionally appends a
// plain register link. Returns matching html + text parts.
export const renderPlainEmail = (message: string, linkUrl?: string): { html: string; text: string } => {
  const linkHtml = linkUrl ? `<br/><br/>Register and submit here: <a href="${linkUrl}">${linkUrl}</a>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827">${textToHtml(message)}${linkHtml}</div>`;
  const text = message + (linkUrl ? `\n\nRegister and submit here: ${linkUrl}` : '');
  return { html, text };
};
