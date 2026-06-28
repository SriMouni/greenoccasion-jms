import { randomUUID } from 'node:crypto';
import { db } from '../db/schema.ts';
import type { SubtopicCandidate } from '../worker/discovery/subtopic.mapper.ts';

const createDiscoveryRunId = () => `discovery_run_${randomUUID()}`;
const createSubtopicId = () => `subtopic_${randomUUID()}`;

export const createDiscoveryRun = async (input: {
  jobId: string;
  topicText: string;
  providerSummary: Record<string, unknown>;
}) => {
  return await db.prepare(`
    INSERT INTO discovery_runs (id, job_id, topic_text, provider_summary_json)
    VALUES (?, ?, ?, ?::jsonb)
    RETURNING *
  `).get(
    createDiscoveryRunId(),
    input.jobId,
    input.topicText,
    JSON.stringify(input.providerSummary)
  );
};

const findExistingSubtopic = async (candidate: SubtopicCandidate) => {
  return await db.prepare(`
    SELECT *
    FROM subtopics
    WHERE normalized_name = ?
       OR (provider = ? AND provider_topic_id = ?)
    LIMIT 1
  `).get(candidate.normalizedName, candidate.provider, candidate.providerTopicId);
};

export const saveSubtopicCandidates = async (
  discoveryRunId: string,
  candidates: SubtopicCandidate[]
) => {
  let insertedCount = 0;
  let updatedCount = 0;
  const subtopicIds: string[] = [];

  for (const candidate of candidates) {
    const existing = await findExistingSubtopic(candidate);

    if (existing) {
      const updated = await db.prepare(`
        UPDATE subtopics
        SET discovery_run_id = ?,
            name = ?,
            normalized_name = ?,
            provider = ?,
            provider_topic_id = ?,
            paper_count = ?,
            source_count = ?,
            confidence = ?,
            evidence_json = ?::jsonb,
            updated_at = now()
        WHERE id = ?
        RETURNING *
      `).get(
        discoveryRunId,
        candidate.name,
        candidate.normalizedName,
        candidate.provider,
        candidate.providerTopicId,
        candidate.paperCount,
        candidate.sourceCount,
        candidate.confidence,
        JSON.stringify(candidate.evidence),
        existing.id
      );

      updatedCount += 1;
      subtopicIds.push(updated.id);
      continue;
    }

    const inserted = await db.prepare(`
      INSERT INTO subtopics (
        id, discovery_run_id, name, normalized_name, provider, provider_topic_id,
        paper_count, source_count, confidence, evidence_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
      RETURNING *
    `).get(
      createSubtopicId(),
      discoveryRunId,
      candidate.name,
      candidate.normalizedName,
      candidate.provider,
      candidate.providerTopicId,
      candidate.paperCount,
      candidate.sourceCount,
      candidate.confidence,
      JSON.stringify(candidate.evidence)
    );

    insertedCount += 1;
    subtopicIds.push(inserted.id);
  }

  return {
    savedCount: insertedCount + updatedCount,
    insertedCount,
    updatedCount,
    subtopicIds,
  };
};

export const listSubtopicsByJobId = async (jobId: string) => {
  return await db.prepare(`
    SELECT
      s.id,
      s.name,
      s.normalized_name AS "normalizedName",
      s.provider,
      s.provider_topic_id AS "providerTopicId",
      s.paper_count AS "paperCount",
      s.source_count AS "sourceCount",
      s.confidence,
      s.evidence_json AS evidence,
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt"
    FROM subtopics s
    JOIN discovery_runs dr ON dr.id = s.discovery_run_id
    WHERE dr.job_id = ?
    ORDER BY s.confidence DESC, s.paper_count DESC, s.name ASC
  `).all(jobId);
};