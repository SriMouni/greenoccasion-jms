import { randomUUID } from 'node:crypto';
import { JOB_STATUS } from '../../jobs/job.types.ts';
import {
  appendJobEvent,
  completeJob,
  getJobById,
  updateJobStatus,
} from '../../jobs/job.repositry.ts';
import { db } from '../../db/schema.ts';
import { createOpenAlexClient } from '../provider-clients/openalex.client.ts';

const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

const parsePayload = (payloadJson: unknown): Record<string, unknown> => {
  if (typeof payloadJson === 'string') return JSON.parse(payloadJson) as Record<string, unknown>;
  return (payloadJson ?? {}) as Record<string, unknown>;
};

const normalizeOrcid = (orcid?: string | null): string | null => {
  if (!orcid) return null;
  const clean = String(orcid).replace(/^https?:\/\/orcid\.org\//i, '').trim();
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(clean) ? clean : null;
};

const addIdentity = async (authorId: string, scheme: string, identifier: string | null, source: string, sourceUrl: string | null, confidence: number) => {
  if (!identifier) return;
  await db.prepare(`
    INSERT INTO author_identities (id, author_id, scheme, identifier, source, source_url, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (author_id, scheme, identifier) DO NOTHING
  `).run(newId('aid'), authorId, scheme, identifier, source, sourceUrl, confidence);
};

export const runEnrichAuthorsJob = async (jobId: string) => {
  const job = await getJobById(jobId) as { payload_json?: unknown } | undefined;
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = parsePayload(job.payload_json);
  const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200);

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 5, 'Finding authors to enrich');

  const authors = await db.prepare(`
    SELECT id, name, openalex_author_id
    FROM authors
    WHERE openalex_author_id IS NOT NULL AND enriched_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string; name: string; openalex_author_id: string }>;

  if (authors.length === 0) {
    return await completeJob(jobId, { enriched: 0, withOrcid: 0, failed: 0, attempted: 0 });
  }

  const client = createOpenAlexClient();
  let enriched = 0;
  let withOrcid = 0;
  let failed = 0;

  for (let i = 0; i < authors.length; i += 1) {
    const author = authors[i];
    try {
      const a = await client.getAuthorById(author.openalex_author_id);

      const orcid = normalizeOrcid(a.orcid ?? a.ids?.orcid);
      const inst = a.last_known_institutions?.[0] ?? a.affiliations?.[0]?.institution;
      const instName = inst?.display_name ?? null;
      const rorId = inst?.ror ?? (inst?.id && String(inst.id).includes('ror.org') ? String(inst.id) : null);
      const worksCount = Number.isFinite(Number(a.works_count)) ? Number(a.works_count) : null;
      const confidence = 0.9; // OpenAlex already disambiguates the author from their works.
      const authorUrl = a.id ?? `https://openalex.org/${author.openalex_author_id.split('/').pop()}`;

      await addIdentity(author.id, 'openalex', author.openalex_author_id.split('/').pop() ?? author.openalex_author_id, 'openalex', authorUrl, confidence);
      if (orcid) {
        await addIdentity(author.id, 'orcid', orcid, 'openalex', `https://orcid.org/${orcid}`, confidence);
        withOrcid += 1;
      }

      if (instName) {
        await db.prepare(`
          INSERT INTO author_affiliations (id, author_id, organization_name, ror_id, country, source, source_url, confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newId('aff'), author.id, instName, rorId, inst?.country_code ?? null, 'openalex', authorUrl, confidence);
      }

      await db.prepare(`
        UPDATE authors
        SET orcid = ?,
            institution = COALESCE(NULLIF(?, ''), institution),
            works_count = ?,
            enrichment_status = 'enriched',
            enrichment_confidence = ?,
            enriched_at = now()
        WHERE id = ?
      `).run(orcid, instName ?? '', worksCount, confidence, author.id);

      enriched += 1;
      await appendJobEvent(jobId, 'info', `Enriched — ${author.name}${orcid ? ` (ORCID ${orcid})` : ''}${instName ? ` · ${instName}` : ''}`, {
        authorId: author.id, orcid, institution: instName, rorId,
      });
    } catch (err) {
      failed += 1;
      await db.prepare(`UPDATE authors SET enrichment_status = 'failed', enriched_at = now() WHERE id = ?`).run(author.id);
      await appendJobEvent(jobId, 'warn', `Could not enrich — ${author.name}`, {
        authorId: author.id, error: err instanceof Error ? err.message : String(err),
      });
    }

    const progress = Math.round(5 + ((i + 1) / authors.length) * 90);
    await updateJobStatus(jobId, JOB_STATUS.RUNNING, progress, `Enriched ${enriched}/${authors.length} authors`);
  }

  return await completeJob(jobId, { attempted: authors.length, enriched, withOrcid, failed });
};
