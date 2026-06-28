import { db } from '../db/schema.ts';

export type LicensePolicy =
  | 'auto_allowed'
  | 'conditional_review'
  | 'unknown_review'
  | 'blocked';

export type LicenseOption = {
  id: string;
  canonicalName: string;
  canonicalUrl: string | null;
  policy: LicensePolicy;
  policyNote: string;
  requiresManualReview: boolean;
  createdAt: string;
};

export const listLicenses = async (): Promise<LicenseOption[]> => {
  return await db.prepare(`
    SELECT
      id,
      canonical_name AS "canonicalName",
      canonical_url AS "canonicalUrl",
      policy,
      policy_note AS "policyNote",
      requires_manual_review AS "requiresManualReview",
      created_at AS "createdAt"
    FROM licenses
    ORDER BY
      CASE canonical_name
        WHEN 'CC0' THEN 1
        WHEN 'CC BY' THEN 2
        WHEN 'CC BY-SA' THEN 3
        WHEN 'CC BY-ND' THEN 4
        WHEN 'CC BY-NC' THEN 5
        WHEN 'CC BY-NC-SA' THEN 6
        WHEN 'CC BY-NC-ND' THEN 7
        WHEN 'Unknown' THEN 8
        WHEN 'All rights reserved' THEN 9
        ELSE 10
      END
  `).all();
};
export type LicensePreviewSubtopic = {
  id: string;
  name: string;
  paperCount: number;
};

export const getLicensePreviewSubtopics = async (
  discoveryJobId: string,
  subtopicIds: string[]
): Promise<LicensePreviewSubtopic[]> => {
  const uniqueSubtopicIds = Array.from(new Set(subtopicIds.map(id => id.trim()).filter(Boolean)));

  if (uniqueSubtopicIds.length === 0) return [];

  const placeholders = uniqueSubtopicIds.map(() => '?').join(', ');

  return await db.prepare(`
    SELECT
      s.id,
      s.name,
      s.paper_count AS "paperCount"
    FROM subtopics s
    JOIN discovery_runs dr ON dr.id = s.discovery_run_id
    WHERE dr.job_id = ?
      AND s.id IN (${placeholders})
    ORDER BY s.paper_count DESC, s.name ASC
  `).all(discoveryJobId, ...uniqueSubtopicIds);
};