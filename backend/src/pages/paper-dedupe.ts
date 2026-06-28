import { createHash } from 'node:crypto';
import { db } from '../db/schema.ts';

export type PaperDedupeInput = {
  doi?: string | null;
  openAlexId?: string | null;
  title?: string | null;
  publicationYear?: number | null;
  sourceUrls?: Array<string | null | undefined>;
};

export type PaperDedupeMatch =
  | 'doi'
  | 'openalex_id'
  | 'title_year'
  | 'source_url'
  | null;

export type PaperDedupeResult = {
  paper: Record<string, unknown> | null;
  paperVersion: Record<string, unknown> | null;
  matchedBy: PaperDedupeMatch;
  normalizedDoi: string | null;
  normalizedTitleHash: string | null;
  matchedSourceUrl: string | null;
};

export const normalizeDoi = (value?: string | null) => {
  if (!value) return null;

  const normalized = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

  return normalized.length > 0 ? normalized : null;
};

export const normalizePaperTitle = (value?: string | null) => {
  if (!value) return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

  return normalized.length > 0 ? normalized : null;
};

export const createNormalizedTitleHash = (title?: string | null) => {
  const normalizedTitle = normalizePaperTitle(title);
  if (!normalizedTitle) return null;

  return createHash('sha256').update(normalizedTitle).digest('hex');
};

const normalizeSourceUrls = (urls?: Array<string | null | undefined>) => {
  return Array.from(new Set(
    (urls ?? [])
      .map(url => url?.trim())
      .filter((url): url is string => Boolean(url))
  ));
};

const emptyResult = (
  normalizedDoi: string | null,
  normalizedTitleHash: string | null
): PaperDedupeResult => ({
  paper: null,
  paperVersion: null,
  matchedBy: null,
  normalizedDoi,
  normalizedTitleHash,
  matchedSourceUrl: null,
});

export const findExistingPaperForCandidate = async (
  input: PaperDedupeInput
): Promise<PaperDedupeResult> => {
  const normalizedDoi = normalizeDoi(input.doi);
  const normalizedTitleHash = createNormalizedTitleHash(input.title);

      if (normalizedDoi) {
  const doiCandidates = [
    normalizedDoi,
    `doi:${normalizedDoi}`,
    `doi: ${normalizedDoi}`,
    `https://doi.org/${normalizedDoi}`,
    `http://doi.org/${normalizedDoi}`,
    `https://dx.doi.org/${normalizedDoi}`,
    `http://dx.doi.org/${normalizedDoi}`,
  ];

  const paper = await db.prepare(`
    SELECT *
    FROM papers
    WHERE doi IS NOT NULL
      AND lower(trim(doi)) IN (?, ?, ?, ?, ?, ?, ?)
    LIMIT 1
  `).get(...doiCandidates);

  if (paper) {
    return { paper, paperVersion: null, matchedBy: 'doi', normalizedDoi, normalizedTitleHash, matchedSourceUrl: null };
  }
}

  if (input.openAlexId?.trim()) {
    const paper = await db.prepare(`
      SELECT *
      FROM papers
      WHERE openalex_id = ?
      LIMIT 1
    `).get(input.openAlexId.trim());

    if (paper) {
      return { paper, paperVersion: null, matchedBy: 'openalex_id', normalizedDoi, normalizedTitleHash, matchedSourceUrl: null };
    }
  }

  if (normalizedTitleHash && input.publicationYear) {
    const paper = await db.prepare(`
      SELECT *
      FROM papers
      WHERE normalized_title_hash = ?
        AND publication_year = ?
      LIMIT 1
    `).get(normalizedTitleHash, input.publicationYear);

    if (paper) {
      return { paper, paperVersion: null, matchedBy: 'title_year', normalizedDoi, normalizedTitleHash, matchedSourceUrl: null };
    }
  }

  for (const sourceUrl of normalizeSourceUrls(input.sourceUrls)) {
    const paperVersion = await db.prepare(`
      SELECT *
      FROM paper_versions
      WHERE landing_page_url = ?
         OR pdf_url = ?
         OR fulltext_url = ?
      LIMIT 1
    `).get(sourceUrl, sourceUrl, sourceUrl);

    if (!paperVersion) continue;

    const paper = await db.prepare(`
      SELECT *
      FROM papers
      WHERE id = ?
      LIMIT 1
    `).get(paperVersion.paper_id);

    if (paper) {
      return { paper, paperVersion, matchedBy: 'source_url', normalizedDoi, normalizedTitleHash, matchedSourceUrl: sourceUrl };
    }
  }

  return emptyResult(normalizedDoi, normalizedTitleHash);
};