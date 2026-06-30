import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/schema.ts';
import { JOB_STATUS, type JobStatus, type JobType } from '../jobs/job.types.ts';

type JsonObject = Record<string, unknown>;

export type CreateJobInput = {
  type: JobType;
  payload: JsonObject;
  createdByUserId?: string | null;
  payloadHash?: string;
};

export type JobEventLevel = 'info' | 'warn' | 'error';

const createJobId = () => `job_${randomUUID()}`;
const createJobEventId = () => `job_event_${randomUUID()}`;

const createPayloadHash = (payload: JsonObject) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export const createJob = async (input: CreateJobInput) => {
  const id = createJobId();
  const payloadHash = input.payloadHash ?? createPayloadHash(input.payload);

  return await db.prepare(`
    INSERT INTO jobs (
      id, type, status, progress, payload_json, payload_hash, created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
    RETURNING *
  `).get(
    id,
    input.type,
    JOB_STATUS.QUEUED,
    0,
    JSON.stringify(input.payload),
    payloadHash,
    input.createdByUserId ?? null
  );
};

export const getJobById = async (jobId: string) => {
  return await db.prepare(`
    SELECT *
    FROM jobs
    WHERE id = ?
  `).get(jobId);
};

export const getLatestJobEventByJobId = async (jobId: string) => {
  return await db.prepare(`
    SELECT *
    FROM job_events
    WHERE job_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(jobId);
};

export const listJobEventsByJobId = async (jobId: string, limit = 200) => {
  return await db.prepare(`
    SELECT id, level, message, meta_json, created_at
    FROM job_events
    WHERE job_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(jobId, limit);
};

export const appendJobEvent = async (
  jobId: string,
  level: JobEventLevel,
  message: string,
  meta: JsonObject = {}
) => {
  return await db.prepare(`
    INSERT INTO job_events (id, job_id, level, message, meta_json)
    VALUES (?, ?, ?, ?, ?::jsonb)
    RETURNING *
  `).get(createJobEventId(), jobId, level, message, JSON.stringify(meta));
};

export const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
  progress: number,
  message?: string
) => {
  const job = await db.prepare(`
    UPDATE jobs
    SET status = ?, progress = ?, updated_at = now()
    WHERE id = ?
    RETURNING *
  `).get(status, progress, jobId);

  if (message) {
    await appendJobEvent(jobId, 'info', message, { status, progress });
  }

  return job;
};

export const completeJob = async (jobId: string, result: JsonObject = {}) => {
  const job = await db.prepare(`
    UPDATE jobs
    SET status = ?, progress = 100, result_json = ?::jsonb, error_text = NULL, updated_at = now()
    WHERE id = ?
    RETURNING *
  `).get(JOB_STATUS.COMPLETED, JSON.stringify(result), jobId);

  await appendJobEvent(jobId, 'info', 'Job completed', result);
  return job;
};

export const failJob = async (jobId: string, errorText: string) => {
  const job = await db.prepare(`
    UPDATE jobs
    SET status = ?, error_text = ?, updated_at = now()
    WHERE id = ?
    RETURNING *
  `).get(JOB_STATUS.FAILED, errorText, jobId);

  await appendJobEvent(jobId, 'error', 'Job failed', { errorText });
  return job;
};

/**
 * Mark non-terminal jobs (queued/running) as failed. Call once on startup: with the
 * inline runner, jobs live in the web process, so a restart/redeploy/sleep leaves any
 * in-flight job stuck as "running" forever. On boot nothing is actually running yet,
 * so any queued/running row is an orphan from a previous process — fail it so the UI
 * shows it as interrupted instead of polling a frozen "running" status.
 */
export const reapInterruptedJobs = async (): Promise<number> => {
  const row = (await db.prepare(`
    SELECT COUNT(*)::int AS n FROM jobs WHERE status IN (?, ?)
  `).get(JOB_STATUS.QUEUED, JOB_STATUS.RUNNING)) as { n: number } | undefined;

  const n = Number(row?.n || 0);
  if (n > 0) {
    await db.prepare(`
      UPDATE jobs
      SET status = ?, error_text = COALESCE(error_text, ?), updated_at = now()
      WHERE status IN (?, ?)
    `).run(JOB_STATUS.FAILED, 'Interrupted by a server restart', JOB_STATUS.QUEUED, JOB_STATUS.RUNNING);
  }
  return n;
};
