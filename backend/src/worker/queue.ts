import dotenv from 'dotenv';
import type { Queue } from 'bullmq';

dotenv.config();

export const jobQueueName = process.env.JOB_QUEUE_NAME || 'greenocc-jobs';

/**
 * Job execution mode:
 *   - 'inline' (default): run jobs in-process. Stack is just Postgres + Node.
 *   - 'bullmq': enqueue to Redis and let a separate `npm run worker` process them.
 * Set JOB_RUNNER=bullmq (plus REDIS_* env) to opt into the queued architecture.
 */
export const jobRunnerMode = (process.env.JOB_RUNNER || 'inline').toLowerCase();

export const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

let queueInstance: Queue | null = null;

/**
 * Lazily construct the BullMQ queue only when queued mode is active.
 * Importing this module in inline mode must never open a Redis connection.
 */
const getQueue = async (): Promise<Queue> => {
  if (!queueInstance) {
    const { Queue } = await import('bullmq');
    queueInstance = new Queue(jobQueueName, { connection: redisConnection });
  }

  return queueInstance;
};

export const enqueueJob = async (jobId: string) => {
  if (jobRunnerMode === 'bullmq') {
    const queue = await getQueue();
    return await queue.add(
      'app_job',
      { jobId },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
  }

  // Inline mode: process in this process without blocking the API response.
  const { runInline } = await import('../jobs/inline-runner.ts');
  void runInline(jobId);
  return { id: jobId, inline: true };
};
