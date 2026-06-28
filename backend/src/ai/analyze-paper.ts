import { db } from '../db/schema.ts';
import { extractPdfText } from './pdf-text.ts';
import { analyzePaperText, isAiEnabled, QuotaExceededError } from './gemini.ts';

export type AnalyzeResult = { ok: boolean; reason?: string };

/**
 * One-time AI analysis for a single paper: extract text (stored PDF, else abstract),
 * call Gemini once, and persist the summary/short summary/highlights/field.
 */
export const analyzeAndStorePaper = async (paperId: string): Promise<AnalyzeResult> => {
  if (!isAiEnabled()) return { ok: false, reason: 'ai_disabled' };

  const paper = await db
    .prepare('SELECT id, title, abstract, file_path FROM papers WHERE id = ?')
    .get(paperId) as { id: string; title: string; abstract: string; file_path: string } | undefined;

  if (!paper) return { ok: false, reason: 'not_found' };

  const pdfText = await extractPdfText(paper.file_path);
  const text = (pdfText || paper.abstract || '').trim();
  if (text.length < 40) return { ok: false, reason: 'no_text' };

  let analysis;
  try {
    analysis = await analyzePaperText({ title: paper.title || '', text });
  } catch (err) {
    if (err instanceof QuotaExceededError) return { ok: false, reason: 'quota' };
    throw err;
  }
  if (!analysis) return { ok: false, reason: 'analysis_failed' };

  await db.prepare(`
    UPDATE papers
    SET ai_summary = ?,
        ai_short_summary = ?,
        ai_highlights = ?::jsonb,
        ai_field = ?,
        ai_tags = ?::jsonb,
        ai_significance = ?,
        ai_score = ?,
        ai_processed_at = now()
    WHERE id = ?
  `).run(
    analysis.summary,
    analysis.shortSummary,
    JSON.stringify(analysis.highlights),
    analysis.field,
    JSON.stringify(analysis.tags),
    analysis.significance,
    analysis.qualityScore,
    paperId
  );

  return { ok: true };
};

/** Batch-analyse approved papers that have not been processed yet. */
export const analyzePendingPapers = async (
  limit = 20
): Promise<{ processed: number; failed: number; quotaReached: boolean }> => {
  if (!isAiEnabled()) return { processed: 0, failed: 0, quotaReached: false };

  const rows = await db.prepare(`
    SELECT id FROM papers
    WHERE status = 'approved' AND ai_processed_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string }>;

  let processed = 0;
  let failed = 0;
  let quotaReached = false;
  for (const row of rows) {
    const result = await analyzeAndStorePaper(row.id);
    if (result.ok) {
      processed += 1;
    } else if (result.reason === 'quota') {
      // Daily/rate quota hit — stop the batch cleanly so we don't hammer the API.
      quotaReached = true;
      break;
    } else {
      failed += 1;
    }
  }
  return { processed, failed, quotaReached };
};
