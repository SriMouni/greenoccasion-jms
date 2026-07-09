import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { JOB_STATUS } from '../../jobs/job.types.ts';
import { appendJobEvent, completeJob, getJobById, updateJobStatus } from '../../jobs/job.repositry.ts';
import { db } from '../../db/schema.ts';
import { objectStorage } from '../../server/storage/object-storage.ts';

// Harvest corresponding-author emails from the OA papers we already store. Authors
// publish these emails in their papers for exactly this purpose (correspondence).
// Compliant: only reads PDFs we're licensed to store; stores with provenance; no
// web/social scraping. Admin-only; results surface in the admin, never the public site.

const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

const parsePayload = (payloadJson: unknown): Record<string, unknown> => {
  if (typeof payloadJson === 'string') return JSON.parse(payloadJson) as Record<string, unknown>;
  return (payloadJson ?? {}) as Record<string, unknown>;
};

// Mirror of the server's stored-path normalizer (keep the worker self-contained).
const normalizeStoredPdfPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const normalized = value.replace(/\\/g, '/').trim();
  if (normalized.includes('..') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || /^https?:\/\//i.test(normalized)) {
    return null;
  }
  return normalized.split('/').filter(Boolean).join('/');
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_DOMAINS = ['example.com', 'example.org', 'openalex.local', 'domain.com', 'email.com', 'sci-hub'];

const extractEmails = (text: string): string[] => {
  const found = (text.match(EMAIL_RE) || []).map((e) => e.toLowerCase().replace(/[.,;:)]+$/, ''));
  const unique = Array.from(new Set(found));
  return unique.filter((e) => {
    if (e.length > 100) return false;
    if (/\.(png|jpg|jpeg|gif|svg|pdf)$/i.test(e)) return false;
    return !JUNK_DOMAINS.some((d) => e.includes(d));
  });
};

const surname = (name: string): string =>
  String(name || '').trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') || '';

// Match an email to one of the paper's authors: surname must appear in the local part.
// If there's a single author, attribute to them (they're the corresponding author).
const matchAuthor = (email: string, authors: Array<{ id: string; name: string }>) => {
  const local = email.split('@')[0].toLowerCase();
  const byName = authors.find((a) => {
    const s = surname(a.name);
    return s.length >= 3 && local.includes(s);
  });
  if (byName) return byName;
  return authors.length === 1 ? authors[0] : null;
};

const readObjectBuffer = async (key: string): Promise<Buffer> => {
  const stream = await objectStorage.getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export const runHarvestContactsJob = async (jobId: string) => {
  const job = await getJobById(jobId) as { payload_json?: unknown } | undefined;
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = parsePayload(job.payload_json);
  const limit = Math.min(Math.max(Number(payload.limit) || 25, 1), 100);

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 5, 'Finding papers with stored PDFs');

  const papers = await db.prepare(`
    SELECT id, title, file_path
    FROM papers
    WHERE pdf_stored = true AND contacts_harvested_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string; title: string; file_path: string }>;

  if (papers.length === 0) {
    return await completeJob(jobId, { processed: 0, emailsFound: 0, stored: 0, skipped: 0 });
  }

  let processed = 0;
  let emailsFound = 0;
  let stored = 0;
  let skipped = 0;

  for (let i = 0; i < papers.length; i += 1) {
    const paper = papers[i];
    const key = normalizeStoredPdfPath(paper.file_path);
    try {
      if (!key) {
        skipped += 1;
        await appendJobEvent(jobId, 'warn', `Skipped "${paper.title}": no readable PDF path.`);
      } else {
        const buffer = await readObjectBuffer(key);
        const text = (await new PDFParse({ data: buffer }).getText()).text || '';
        const emails = extractEmails(text);
        emailsFound += emails.length;

        const authors = await db.prepare(`
          SELECT a.id, a.name FROM authors a
          JOIN paper_authors pa ON pa.author_id = a.id
          WHERE pa.paper_id = ?
        `).all(paper.id) as Array<{ id: string; name: string }>;

        for (const email of emails) {
          const author = matchAuthor(email, authors);
          if (!author) continue;
          const exists = await db.prepare('SELECT 1 FROM author_contacts WHERE author_id = ? AND value = ?').get(author.id, email);
          if (exists) continue;
          await db.prepare(`
            INSERT INTO author_contacts (id, author_id, contact_type, value, source, source_url, confidence)
            VALUES (?, ?, 'email', ?, 'pdf-fulltext', ?, ?)
          `).run(newId('ct'), author.id, email, paper.id, 0.7);
          stored += 1;
        }
        processed += 1;
      }
    } catch (err: any) {
      skipped += 1;
      await appendJobEvent(jobId, 'warn', `Failed "${paper.title}": ${err?.message || 'parse error'}`);
    }
    // Mark scanned either way so we don't re-scan the same paper each run.
    await db.prepare('UPDATE papers SET contacts_harvested_at = now() WHERE id = ?').run(paper.id).catch(() => {});
    await updateJobStatus(jobId, JOB_STATUS.RUNNING, 5 + Math.round(((i + 1) / papers.length) * 90), `Scanned ${i + 1}/${papers.length}`);
  }

  return await completeJob(jobId, { processed, emailsFound, stored, skipped });
};
