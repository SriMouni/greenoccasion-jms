import type { LicenseOption, LicensePolicy, LicensePreviewSubtopic } from './licenses.repository.ts';

export type LicensePreviewRow = {
  licenseName: string;
  paperCount: number;
  policy: LicensePolicy;
  requiresManualReview: boolean;
  reason: string;
};

export type LicensePreviewResponse = {
  discoveryJobId: string;
  selectedSubtopicCount: number;
  estimatedPaperCount: number;
  licenses: LicensePreviewRow[];
};

const previewWeights = new Map<string, number>([
  ['CC BY', 0.45],
  ['CC BY-NC', 0.25],
  ['CC BY-SA', 0.12],
  ['Unknown', 0.12],
  ['All rights reserved', 0.06],
]);

const previewOrder = [
  'CC BY',
  'CC BY-NC',
  'CC BY-SA',
  'Unknown',
  'All rights reserved',
];

const estimatePaperCount = (subtopics: LicensePreviewSubtopic[]) => {
  const rawTotal = subtopics.reduce((total, subtopic) => {
    return total + Number(subtopic.paperCount || 0);
  }, 0);

  if (rawTotal > 0) {
    return Math.min(rawTotal, subtopics.length * 100);
  }

  return subtopics.length * 10;
};

const getMockCount = (estimatedPaperCount: number, licenseName: string) => {
  if (estimatedPaperCount <= 0) return 0;

  const weight = previewWeights.get(licenseName) ?? 0;
  return Math.max(1, Math.round(estimatedPaperCount * weight));
};

export const buildLicensePreview = (input: {
  discoveryJobId: string;
  subtopics: LicensePreviewSubtopic[];
  licenses: LicenseOption[];
}): LicensePreviewResponse => {
  const estimatedPaperCount = estimatePaperCount(input.subtopics);
  const licenseByName = new Map(input.licenses.map(license => [license.canonicalName, license]));

  const licenses = previewOrder
    .map(licenseName => licenseByName.get(licenseName))
    .filter((license): license is LicenseOption => Boolean(license))
    .map(license => ({
      licenseName: license.canonicalName,
      paperCount: getMockCount(estimatedPaperCount, license.canonicalName),
      policy: license.policy,
      requiresManualReview: license.requiresManualReview,
      reason: license.policyNote,
    }));

  return {
    discoveryJobId: input.discoveryJobId,
    selectedSubtopicCount: input.subtopics.length,
    estimatedPaperCount,
    licenses,
  };
};