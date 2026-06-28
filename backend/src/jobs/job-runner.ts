import { JOB_TYPE } from './job.types.ts';
import { getJobById } from './job.repositry.ts';
import { runDiscoverSubtopicsJob } from '../worker/discovery/discover-subtopics.job.ts';
import { runIngestPapersJob } from '../worker/ingestion/ingest-papers.job.ts';
import { runBackfillPdfsJob } from '../worker/maintenance/backfill-pdfs.job.ts';
import { runAnalyzePapersJob } from '../worker/maintenance/analyze-papers.job.ts';
import { runEnrichAuthorsJob } from '../worker/maintenance/enrich-authors.job.ts';

/**
 * Resolve an application job by id and run the handler for its type.
 * Shared by the BullMQ worker (queued mode) and the inline runner (single-process mode)
 * so both code paths dispatch jobs identically.
 */
export const processJob = async (jobId: string) => {
  if (!jobId) {
    throw new Error('processJob requires a jobId');
  }

  const appJob = (await getJobById(jobId)) as
    | { type?: string; payload_json?: unknown }
    | undefined;

  if (!appJob) {
    throw new Error(`App job not found: ${jobId}`);
  }

  if (appJob.type === JOB_TYPE.DISCOVER_SUBTOPICS) {
    return await runDiscoverSubtopicsJob(jobId);
  }

  if (appJob.type === JOB_TYPE.INGEST_PAPERS) {
    return await runIngestPapersJob(jobId);
  }

  if (appJob.type === JOB_TYPE.BACKFILL_PDFS) {
    return await runBackfillPdfsJob(jobId);
  }

  if (appJob.type === JOB_TYPE.ANALYZE_PAPERS) {
    return await runAnalyzePapersJob(jobId);
  }

  if (appJob.type === JOB_TYPE.ENRICH_AUTHORS) {
    return await runEnrichAuthorsJob(jobId);
  }

  throw new Error(`Unsupported job type: ${appJob.type}`);
};
