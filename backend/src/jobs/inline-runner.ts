import { failJob } from './job.repositry.ts';
import { processJob } from './job-runner.ts';

/**
 * In-process job runner used when JOB_RUNNER=inline (the default minimal-stack mode).
 *
 * Jobs are chained so they run one at a time in the same process as the API server.
 * This keeps the stack to "Postgres + Node" (no Redis/BullMQ required) while preserving
 * the same job lifecycle: status transitions, events, and failure recording are written
 * to Postgres exactly as the BullMQ worker would write them.
 *
 * Sequential execution is intentional: it avoids hammering rate-limited providers
 * (e.g. Semantic Scholar's 1 req/sec) and sidesteps connection-pool contention.
 */
let chain: Promise<unknown> = Promise.resolve();

export const runInline = (jobId: string): Promise<void> => {
  const next = chain.then(async () => {
    try {
      await processJob(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await failJob(jobId, message);
      } catch (failErr) {
        console.error(`Inline runner could not mark job ${jobId} as failed:`, failErr);
      }
    }
  });

  // Keep the chain alive even if a job throws, so later jobs still run.
  chain = next.catch(() => undefined);
  return next;
};
