import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import { failJob } from '../jobs/job.repositry.ts';
import { processJob } from '../jobs/job-runner.ts';
import { jobQueueName, redisConnection } from './queue.ts';

dotenv.config();

const worker = new Worker(
  jobQueueName,
  async bullJob => {
    const { jobId } = bullJob.data as { jobId?: string };

    if (!jobId) {
      throw new Error('BullMQ job is missing jobId');
    }

    return await processJob(jobId);
  },
  {
    connection: {
      ...redisConnection,
      maxRetriesPerRequest: null,
    },
  }
);

worker.on('completed', job => {
  console.log(`Worker completed BullMQ job ${job.id}`);
});

worker.on('failed', async (job, err) => {
  console.error(`Worker failed BullMQ job ${job?.id}:`, err.message);

  const jobId = job?.data?.jobId;
  if (jobId) {
    await failJob(jobId, err.message);
  }
});

console.log(`BullMQ worker listening on queue: ${jobQueueName}`);
