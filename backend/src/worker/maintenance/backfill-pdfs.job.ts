import { JOB_STATUS } from '../../jobs/job.types.ts';
import {
  appendJobEvent,
  completeJob,
  getJobById,
  updateJobStatus,
} from '../../jobs/job.repositry.ts';
import {
  backfillPaperPdf,
  countMetadataOnlyPapers,
  listMetadataOnlyPapers,
} from '../../server/pdf-backfill.ts';

const parsePayload = (payloadJson: unknown): Record<string, unknown> => {
  if (typeof payloadJson === 'string') return JSON.parse(payloadJson) as Record<string, unknown>;
  return (payloadJson ?? {}) as Record<string, unknown>;
};

export const runBackfillPdfsJob = async (jobId: string) => {
  const job = await getJobById(jobId) as { payload_json?: unknown } | undefined;
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = parsePayload(job.payload_json);
  const limit = Math.min(Math.max(Number(payload.limit) || 25, 1), 200);

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 5, 'Finding papers without a stored PDF');
  const papers = await listMetadataOnlyPapers(limit);

  if (papers.length === 0) {
    return await completeJob(jobId, {
      attempted: 0, downloaded: 0, failed: 0, remaining: await countMetadataOnlyPapers(),
    });
  }

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < papers.length; i += 1) {
    const paper = papers[i];
    try {
      const result = await backfillPaperPdf(paper);
      if (result.ok) {
        downloaded += 1;
        await appendJobEvent(jobId, 'info', `Downloaded PDF — ${paper.title}`, { paperId: paper.id, status: 'downloaded' });
      } else {
        failed += 1;
        await appendJobEvent(jobId, 'warn', `No PDF found — ${paper.title}`, { paperId: paper.id, status: 'failed', reason: result.reason });
      }
    } catch (err) {
      failed += 1;
      await appendJobEvent(jobId, 'error', `Error — ${paper.title}`, {
        paperId: paper.id, error: err instanceof Error ? err.message : String(err),
      });
    }

    const progress = Math.round(5 + ((i + 1) / papers.length) * 90);
    await updateJobStatus(jobId, JOB_STATUS.RUNNING, progress, `Processed ${i + 1}/${papers.length} — ${downloaded} downloaded`);
  }

  return await completeJob(jobId, {
    attempted: papers.length,
    downloaded,
    failed,
    remaining: await countMetadataOnlyPapers(),
  });
};
