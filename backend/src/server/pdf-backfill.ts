import { db } from '../db/schema.ts';
import {
  resolveUnpaywallPdfUrls,
  storePdf,
  uniqueHttpUrls,
} from '../worker/ingestion/ingest-papers.job.ts';

export type BackfillPaper = { id: string; title: string; doi: string | null };
export type BackfillOutcome = { ok: boolean; reason?: string };

/** Approved papers that still have no stored PDF. */
export const listMetadataOnlyPapers = async (limit: number): Promise<BackfillPaper[]> => {
  return await db.prepare(`
    SELECT p.id, p.title, p.doi
    FROM papers p
    WHERE p.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM paper_versions v
        WHERE v.paper_id = p.id AND v.download_status = 'downloaded'
      )
    ORDER BY p.created_at DESC
    LIMIT ?
  `).all(limit) as BackfillPaper[];
};

export const countMetadataOnlyPapers = async (): Promise<number> => {
  const row = await db.prepare(`
    SELECT COUNT(*)::int AS remaining
    FROM papers p
    WHERE p.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM paper_versions v WHERE v.paper_id = p.id AND v.download_status = 'downloaded')
  `).get() as { remaining: number };
  return Number(row?.remaining ?? 0);
};

/** Try to download + store a real PDF for one paper using the full resolution chain. */
export const backfillPaperPdf = async (paper: BackfillPaper): Promise<BackfillOutcome> => {
  const versions = await db.prepare(
    `SELECT id, pdf_url, landing_page_url, fulltext_url FROM paper_versions WHERE paper_id = ?`
  ).all(paper.id) as Array<{ id: string; pdf_url: string | null; landing_page_url: string | null; fulltext_url: string | null }>;

  const versionUrls = versions.flatMap((v) => [v.pdf_url, v.landing_page_url, v.fulltext_url]);
  const candidates = uniqueHttpUrls([...versionUrls, ...(await resolveUnpaywallPdfUrls(paper.doi))]);

  if (candidates.length === 0) return { ok: false, reason: 'no_candidate_urls' };

  const stored = await storePdf({ paperId: paper.id, title: paper.title, candidates });
  if (!stored) return { ok: false, reason: 'no_working_pdf' };

  await db.prepare(
    `UPDATE papers SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(stored.storageKey, paper.id);

  const version = versions[0];
  if (version) {
    await db.prepare(`
      UPDATE paper_versions
      SET download_status = 'downloaded', storage_bucket = ?, storage_key = ?,
          content_type = ?, checksum_sha256 = ?, retrieved_at = now(), updated_at = now()
      WHERE id = ?
    `).run(stored.storageBucket, stored.storageKey, stored.contentType, stored.checksumSha256, version.id);
  }

  return { ok: true };
};
