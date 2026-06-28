import { JOB_STATUS } from '../../jobs/job.types.ts';
import {
  appendJobEvent,
  completeJob,
  getJobById,
  updateJobStatus,
} from '../../jobs/job.repositry.ts';
import { createOpenAlexClient } from '../provider-clients/openalex.client.ts';
import { mapOpenAlexSubtopics } from './subtopic.mapper.ts';
import {
  createDiscoveryRun,
  saveSubtopicCandidates,
} from '../discovery/discovery.repository.ts';

const parsePayload = (payloadJson: unknown) => {
  if (typeof payloadJson === 'string') {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  }

  return (payloadJson ?? {}) as Record<string, unknown>;
};

const readTopicText = (payload: Record<string, unknown>) => {
  const topicText = typeof payload.topicText === 'string' ? payload.topicText.trim() : '';

  if (topicText.length < 2) {
    throw new Error('discover_subtopics job requires topicText with at least 2 characters');
  }

  return topicText;
};

const readLimit = (payload: Record<string, unknown>) => {
  const value = Number(payload.limit ?? 30);

  if (!Number.isFinite(value)) return 30;

  return Math.min(Math.max(Math.trunc(value), 1), 50);
};

export const runDiscoverSubtopicsJob = async (jobId: string) => {
  const job = await getJobById(jobId);

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const payload = parsePayload(job.payload_json);
  const topicText = readTopicText(payload);
  const limit = readLimit(payload);
  const openAlexClient = createOpenAlexClient();

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 10, 'Starting OpenAlex discovery');

  const topicSearchResponse = await openAlexClient.searchTopics(topicText);
  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 35, 'Fetched OpenAlex topic results');

  const topicGroupByResponse = await openAlexClient.groupWorksByTopic(topicText);
  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 55, 'Fetched OpenAlex topic counts');

  const sourceGroupByResponse = await openAlexClient.groupWorksBySource(topicText);
  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 70, 'Fetched OpenAlex source counts');

  const candidates = mapOpenAlexSubtopics({
    topicSearchResponse,
    topicGroupByResponse,
    sourceGroupByResponse,
    limit,
  });

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 80, 'Saving discovered subtopics');

  const discoveryRun = await createDiscoveryRun({
    jobId,
    topicText,
    providerSummary: {
      provider: 'openalex',
      topicSearchCount: topicSearchResponse.results.length,
      topicGroupCount: topicGroupByResponse.group_by.length,
      sourceGroupCount: sourceGroupByResponse.group_by.length,
      limit,
    },
  });

  const saveResult = await saveSubtopicCandidates(discoveryRun.id, candidates);

  await appendJobEvent(jobId, 'info', 'Saved discovery subtopics', saveResult);

  return await completeJob(jobId, {
    topicText,
    discoveryRunId: discoveryRun.id,
    candidateCount: candidates.length,
    savedSubtopicCount: saveResult.savedCount,
    insertedSubtopicCount: saveResult.insertedCount,
    updatedSubtopicCount: saveResult.updatedCount,
    subtopicIds: saveResult.subtopicIds,
  });
};