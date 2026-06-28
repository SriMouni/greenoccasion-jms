import type {
  OpenAlexGroupByItem,
  OpenAlexTopic,
  OpenAlexTopicSearchResponse,
  OpenAlexWorksGroupByResponse,
} from '../provider-clients/openalex.client.ts';

export type SubtopicCandidate = {
  name: string;
  normalizedName: string;
  provider: 'openalex';
  providerTopicId: string;
  paperCount: number;
  sourceCount: number;
  confidence: number;
  evidence: Record<string, unknown>;
};

type MapOpenAlexSubtopicsInput = {
  topicSearchResponse: OpenAlexTopicSearchResponse;
  topicGroupByResponse: OpenAlexWorksGroupByResponse;
  sourceGroupByResponse?: OpenAlexWorksGroupByResponse;
  limit?: number;
};

type CandidateDraft = {
  providerTopicId: string;
  name: string;
  topic?: OpenAlexTopic;
  topicGroup?: OpenAlexGroupByItem;
  rank: number;
};

export const normalizeSubtopicName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getSourceCount = (response?: OpenAlexWorksGroupByResponse) => {
  if (!response) return 0;
  return Math.max(response.meta.count ?? 0, response.group_by.length);
};

const scoreConfidence = (draft: CandidateDraft, paperCount: number, sourceCount: number) => {
  const rankScore = clamp(1 - draft.rank * 0.08, 0.4, 1);
  const paperScore = clamp(Math.log10(paperCount + 1) / 5, 0, 1);
  const sourceScore = sourceCount > 0 ? 0.85 : 0.5;
  const evidenceScore = draft.topic?.description || draft.topic?.keywords?.length ? 1 : 0.7;

  return Number(
    (
      rankScore * 0.4 +
      paperScore * 0.3 +
      sourceScore * 0.15 +
      evidenceScore * 0.15
    ).toFixed(4)
  );
};

export const mapOpenAlexSubtopics = ({
  topicSearchResponse,
  topicGroupByResponse,
  sourceGroupByResponse,
  limit = 30,
}: MapOpenAlexSubtopicsInput): SubtopicCandidate[] => {
  const drafts = new Map<string, CandidateDraft>();

  topicSearchResponse.results.forEach((topic, index) => {
    const normalizedName = normalizeSubtopicName(topic.display_name);
    if (!topic.id || !normalizedName) return;

    drafts.set(topic.id, {
      providerTopicId: topic.id,
      name: topic.display_name,
      topic,
      rank: index,
    });
  });

  topicGroupByResponse.group_by.forEach((group, index) => {
    const normalizedName = normalizeSubtopicName(group.key_display_name);
    if (!group.key || !normalizedName) return;

    const existing = drafts.get(group.key);

    drafts.set(group.key, {
      providerTopicId: group.key,
      name: existing?.name ?? group.key_display_name,
      topic: existing?.topic,
      topicGroup: group,
      rank: existing?.rank ?? topicSearchResponse.results.length + index,
    });
  });

  const sourceCount = getSourceCount(sourceGroupByResponse);
  const sampleSources = sourceGroupByResponse?.group_by.slice(0, 5).map(source => ({
    providerSourceId: source.key,
    name: source.key_display_name,
    paperCount: source.count,
  })) ?? [];

  return Array.from(drafts.values())
    .map(draft => {
      const paperCount = Math.max(
        0,
        draft.topicGroup?.count ?? draft.topic?.works_count ?? 0
      );

      return {
        name: draft.name,
        normalizedName: normalizeSubtopicName(draft.name),
        provider: 'openalex' as const,
        providerTopicId: draft.providerTopicId,
        paperCount,
        sourceCount,
        confidence: scoreConfidence(draft, paperCount, sourceCount),
        evidence: {
          provider: 'openalex',
          topicSearch: draft.topic
            ? {
                id: draft.topic.id,
                displayName: draft.topic.display_name,
                description: draft.topic.description ?? null,
                worksCount: draft.topic.works_count ?? null,
                keywords: draft.topic.keywords ?? [],
              }
            : null,
          topicGroupBy: draft.topicGroup
            ? {
                key: draft.topicGroup.key,
                displayName: draft.topicGroup.key_display_name,
                count: draft.topicGroup.count,
              }
            : null,
          sourceGroupBy: sourceGroupByResponse
            ? {
                sourceCount,
                sampleSources,
              }
            : null,
        },
      };
    })
    .filter(candidate => candidate.normalizedName.length > 0)
    .sort((a, b) => b.confidence - a.confidence || b.paperCount - a.paperCount)
    .slice(0, limit);
};