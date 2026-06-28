import { JOB_STATUS } from '../../jobs/job.types.ts';
import {
  appendJobEvent,
  completeJob,
  getJobById,
  updateJobStatus,
} from '../../jobs/job.repositry.ts';
import { db } from '../../db/schema.ts';
import { analyzeAndStorePaper } from '../../ai/analyze-paper.ts';
import { isAiEnabled } from '../../ai/gemini.ts';

const parsePayload = (payloadJson: unknown): Record<string, unknown> => {
  if (typeof payloadJson === 'string') return JSON.parse(payloadJson) as Record<string, unknown>;
  return (payloadJson ?? {}) as Record<string, unknown>;
};

export const runAnalyzePapersJob = async (jobId: string) => {
  const job = await getJobById(jobId) as { payload_json?: unknown } | undefined;
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = parsePayload(job.payload_json);
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 100);

  if (!isAiEnabled()) {
    return await completeJob(jobId, { processed: 0, failed: 0, quotaReached: false, aiDisabled: true });
  }

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 5, 'Finding un-analyzed papers');
  const rows = await db.prepare(`
    SELECT id, title FROM papers
    WHERE status = 'approved' AND ai_processed_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: string; title: string }>;

  if (rows.length === 0) {
    return await completeJob(jobId, { processed: 0, failed: 0, quotaReached: false });
  }

  let processed = 0;
  let failed = 0;
  let quotaReached = false;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const result = await analyzeAndStorePaper(row.id);

    if (result.ok) {
      processed += 1;
      await appendJobEvent(jobId, 'info', `Analyzed — ${row.title}`, { paperId: row.id, status: 'analyzed' });
    } else if (result.reason === 'quota') {
      quotaReached = true;
      await appendJobEvent(jobId, 'warn', 'Daily AI quota reached — stopping for today', { status: 'quota' });
      break;
    } else {
      failed += 1;
      await appendJobEvent(jobId, 'warn', `Skipped — ${row.title} (${result.reason})`, { paperId: row.id, reason: result.reason });
    }

    const progress = Math.round(5 + ((i + 1) / rows.length) * 90);
    await updateJobStatus(jobId, JOB_STATUS.RUNNING, progress, `Analyzed ${processed}/${rows.length}`);
  }

  return await completeJob(jobId, { processed, failed, quotaReached });
};
