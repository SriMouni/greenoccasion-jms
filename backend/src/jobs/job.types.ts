export const JOB_TYPE = {
  DISCOVER_SUBTOPICS: 'discover_subtopics',
  INGEST_PAPERS: 'ingest_papers',
  EXPORT_PAPERS: 'export_papers',
  ENRICH_AUTHORS: 'enrich_authors',
  BACKFILL_PDFS: 'backfill_pdfs',
  ANALYZE_PAPERS: 'analyze_papers',
} as const;

export type JobType = (typeof JOB_TYPE)[keyof typeof JOB_TYPE];
export const JOB_TYPES = Object.values(JOB_TYPE) as JobType[];
export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  WAITING_MANUAL_REVIEW: 'waiting_manual_review',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export const JOB_STATUSES = Object.values(JOB_STATUS) as JobStatus[];