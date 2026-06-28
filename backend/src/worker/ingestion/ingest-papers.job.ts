import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { objectStorage } from '../../server/storage/object-storage.ts';
import { JOB_STATUS } from '../../jobs/job.types.ts';
import { completeJob, getJobById, updateJobStatus } from '../../jobs/job.repositry.ts';
import { db } from '../../db/schema.ts';
import { normalizeLicense } from '../../licenses/license-normalizer.ts';
import {
  createNormalizedTitleHash,
  findExistingPaperForCandidate,
  normalizeDoi,
} from '../../pages/paper-dedupe.ts';
import { createOpenAlexClient } from '../provider-clients/openalex.client.ts';
import {
  createSemanticScholarClient,
  type SemanticScholarPaper,
  type SemanticScholarSearchResponse,
} from '../provider-clients/semantic-scholar.client.ts';
import { createUnpaywallClient } from '../provider-clients/unpaywall.client.ts';
import { analyzeAndStorePaper } from '../../ai/analyze-paper.ts';
import { isAiEnabled } from '../../ai/gemini.ts';
import { checkRobots, waitForHostSlot, INGEST_USER_AGENT } from './robots-gate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePaths = [
  path.resolve(__dirname, '../provider-clients/__fixtures__/openalex-sample-works-response.json'),
  path.resolve(__dirname, '../provider-clients/__fixtures__/openalex-extra-works-response.json'),
];

const maxPdfBytes = Number(process.env.INGEST_PDF_MAX_BYTES || 25 * 1024 * 1024);

// OpenAlex license codes that normalize to the auto_allowed policy (publishable + downloadable).
const AUTO_ALLOWED_OPENALEX_LICENSES = ['cc-by', 'cc0'];

type SourceMode = 'fixture' | 'openalex';

type NormalizedWork = {
  provider: string;
  id: string | null;
  title: string;
  abstract: string;
  doi: string | null;
  publicationYear: number | null;
  topic: string;
  landingPageUrl: string | null;
  pdfUrl: string | null;
  fulltextUrl: string | null;
  licenseUrl: string | null;
  licenseText: string | null;
  versionType: string | null;
  source: any;
  authorships: any[];
  /** Ordered, de-duplicated candidate PDF URLs to try when downloading. */
  pdfCandidates: string[];
  raw: any;
};

export const uniqueHttpUrls = (urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
};

const arxivPdfUrl = (arxivId?: string | null): string | null => {
  if (!arxivId) return null;
  const id = String(arxivId).replace(/^arxiv:/i, '').trim();
  return id ? `https://arxiv.org/pdf/${id}.pdf` : null;
};

const createId = (prefix: string) => `${prefix}_${randomUUID()}`;

const parsePayload = (payloadJson: unknown) => {
  if (typeof payloadJson === 'string') {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  }

  return (payloadJson ?? {}) as Record<string, unknown>;
};

const normalizeName = (name: string) =>
  name.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ');

const sanitizeStoragePart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

const readSourceMode = (payload: Record<string, unknown>): SourceMode =>
  payload.sourceMode === 'fixture' ? 'fixture' : 'openalex';

const readPerPage = (payload: Record<string, unknown>) => {
  const value = Number(payload.perPage ?? 10);
  if (!Number.isFinite(value)) return 10;
  return Math.min(Math.max(Math.trunc(value), 1), 50);
};

const normalizeOpenAlexIdForFilter = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean) return null;
  return clean.split('/').pop() || clean;
};

const loadFixtureWorks = async () => {
  const works: any[] = [];

  for (const fixturePath of fixturePaths) {
    try {
      const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
      if (Array.isArray(fixture.results)) works.push(...fixture.results);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return works;
};

const loadSelectedSubtopics = async (discoveryJobId: string, subtopicIds: string[]) => {
  const rows: any[] = [];

  for (const subtopicId of subtopicIds) {
    const row = await db.prepare(`
      SELECT s.*
      FROM subtopics s
      JOIN discovery_runs dr ON dr.id = s.discovery_run_id
      WHERE dr.job_id = ? AND s.id = ?
      LIMIT 1
    `).get(discoveryJobId, subtopicId) as any;

    if (row) rows.push(row);
  }

  return rows;
};

const filterFixtureWorksForSubtopics = (works: any[], subtopics: any[]) => {
  if (subtopics.length === 0) return works;

  const topicIds = new Set(subtopics.map(s => s.provider_topic_id).filter(Boolean));
  const topicNames = new Set(subtopics.map(s => normalizeName(String(s.name || s.normalized_name || ''))));

  const filtered = works.filter(work =>
    (work.topics ?? []).some((topic: any) =>
      topicIds.has(topic.id) || topicNames.has(normalizeName(topic.display_name || ''))
    )
  );

  return filtered.length > 0 ? filtered : works;
};

const truncateText = (value: string | null | undefined, maxLength = 2000) => {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const safeErrorText = (err: unknown) => {
  if (err instanceof Error) return truncateText(err.message);
  if (typeof err === 'string') return truncateText(err);
  return truncateText(JSON.stringify(err));
};

const safeJsonString = (value: unknown) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: 'Value could not be serialized' });
  }
};

const licenseSkipReason = (decision: string) => {
  if (decision === 'blocked') return 'license_blocked';
  if (decision === 'conditional_review') return 'license_conditional_review';
  if (decision === 'unknown_review') return 'license_unknown_review';
  return 'license_skipped';
};

const createSkippedRecord = async (input: {
  jobId: string;
  provider: string;
  providerSourceId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  doi?: string | null;
  reason: string;
  rawError?: string | null;
  rawJson?: unknown;
}) => {
  return await db.prepare(`
    INSERT INTO ingest_skipped_records (
      id, job_id, provider, provider_source_id, source_url,
      title, doi, reason, raw_error, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
    RETURNING *
  `).get(
    createId('ingest_skipped'),
    input.jobId,
    input.provider,
    input.providerSourceId ?? null,
    input.sourceUrl ?? null,
    input.title ?? null,
    normalizeDoi(input.doi),
    input.reason,
    truncateText(input.rawError),
    safeJsonString(input.rawJson ?? null)
  );
};

const countSkippedRecords = async (jobId: string) => {
  const row = await db.prepare(`
    SELECT COUNT(*)::int AS total
    FROM ingest_skipped_records
    WHERE job_id = ?
  `).get(jobId) as any;

  return Number(row?.total ?? 0);
};

const loadOpenAlexWorks = async (
  jobId: string,
  subtopics: any[],
  perPage: number,
  fallbackTopic: string
): Promise<NormalizedWork[]> => {
  const client = createOpenAlexClient();
  const works: NormalizedWork[] = [];

  for (const subtopic of subtopics) {
    const topicId = normalizeOpenAlexIdForFilter(subtopic.provider_topic_id);

    if (!topicId) {
      await createSkippedRecord({
        jobId,
        provider: 'openalex',
        providerSourceId: subtopic.provider_topic_id ?? null,
        title: subtopic.name ?? null,
        reason: 'provider_topic_missing',
        rawJson: subtopic,
      });
      continue;
    }

    try {
      // Prefer open-access works under auto-allowed licenses so ingested papers
      // are publishable and their PDFs are downloadable.
      const response = await client.listWorksForTopic(topicId, {
        perPage,
        openAccessOnly: true,
        licenses: AUTO_ALLOWED_OPENALEX_LICENSES,
      });
      works.push(...response.results.map(result => normalizeWork(result, subtopic.name || fallbackTopic)));
    } catch (err) {
      await createSkippedRecord({
        jobId,
        provider: 'openalex',
        providerSourceId: subtopic.provider_topic_id ?? topicId,
        title: subtopic.name ?? null,
        reason: 'provider_fetch_failed',
        rawError: safeErrorText(err),
        rawJson: subtopic,
      });
    }
  }

  return works;
};

// Semantic Scholar reports licenses as compact codes (e.g. "CCBY", "CCBYNCND").
// Map them to the hyphenated form the license normalizer understands.
const SEMANTIC_SCHOLAR_LICENSE_MAP: Record<string, string> = {
  CC0: 'cc0',
  CCBY: 'cc-by',
  CCBYSA: 'cc-by-sa',
  CCBYND: 'cc-by-nd',
  CCBYNC: 'cc-by-nc',
  CCBYNCSA: 'cc-by-nc-sa',
  CCBYNCND: 'cc-by-nc-nd',
};

const mapSemanticScholarLicense = (license?: string | null): string | null => {
  if (!license) return null;
  const key = license.replace(/[\s-]/g, '').toUpperCase();
  return SEMANTIC_SCHOLAR_LICENSE_MAP[key] ?? license;
};

const normalizeSemanticScholarPaper = (
  paper: SemanticScholarPaper,
  fallbackTopic: string
): NormalizedWork => {
  const pdfUrl = paper.openAccessPdf?.url ?? null;
  const licenseText = mapSemanticScholarLicense(paper.openAccessPdf?.license);
  const doi = normalizeDoi(paper.externalIds?.DOI ?? null);
  const pmcId = paper.externalIds?.PubMedCentral;
  const pdfCandidates = uniqueHttpUrls([
    pdfUrl,
    arxivPdfUrl(paper.externalIds?.ArXiv),
    pmcId ? `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${String(pmcId).replace(/^PMC/i, '')}/pdf/` : null,
  ]);

  return {
    provider: 'semantic_scholar',
    id: paper.paperId ? `https://www.semanticscholar.org/paper/${paper.paperId}` : null,
    title: paper.title || 'Untitled',
    abstract: paper.abstract || 'Abstract unavailable from provider metadata.',
    doi,
    publicationYear: Number.isFinite(Number(paper.year)) ? Number(paper.year) : null,
    topic: fallbackTopic || 'Uncategorized',
    landingPageUrl: paper.url ?? null,
    pdfUrl,
    fulltextUrl: paper.url ?? pdfUrl,
    licenseUrl: null,
    licenseText,
    versionType: paper.openAccessPdf?.status ?? null,
    source: paper.publicationVenue
      ? {
          id: paper.publicationVenue.id ?? null,
          display_name: paper.publicationVenue.name ?? paper.venue ?? 'Unknown source',
          type: paper.publicationVenue.type ?? null,
        }
      : paper.venue
        ? { id: null, display_name: paper.venue }
        : null,
    // Map to the OpenAlex authorship shape; null id => dedupe authors by name.
    authorships: Array.isArray(paper.authors)
      ? paper.authors
          .filter(author => author?.name)
          .map(author => ({ author: { id: null, display_name: author.name } }))
      : [],
    pdfCandidates,
    raw: paper,
  };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const loadSemanticScholarWorks = async (
  jobId: string,
  subtopics: any[],
  perPage: number,
  fallbackTopic: string
): Promise<NormalizedWork[]> => {
  // Only run when a key is configured; the API is rate-limited to 1 req/sec.
  if (!process.env.SEMANTIC_SCHOLAR_API_KEY) return [];

  const client = createSemanticScholarClient();
  const works: NormalizedWork[] = [];

  for (let index = 0; index < subtopics.length; index += 1) {
    const subtopic = subtopics[index];
    const query = String(subtopic.name || fallbackTopic || '').trim();
    if (!query) continue;

    // Respect the 1 req/sec cumulative limit between calls.
    if (index > 0) await sleep(1500);

    try {
      // One retry with backoff if the 1 req/sec limit returns HTTP 429.
      let response: SemanticScholarSearchResponse;
      try {
        response = await client.searchPapers({ query, limit: perPage });
      } catch (firstErr) {
        if (safeErrorText(firstErr)?.includes('429')) {
          await sleep(2500);
          response = await client.searchPapers({ query, limit: perPage });
        } else {
          throw firstErr;
        }
      }

      const papers = Array.isArray(response.data) ? response.data : [];
      // Keep only papers with an open-access PDF so they are downloadable.
      const openAccess = papers.filter(paper => paper.openAccessPdf?.url);
      works.push(...openAccess.map(paper => normalizeSemanticScholarPaper(paper, subtopic.name || fallbackTopic)));
    } catch (err) {
      await createSkippedRecord({
        jobId,
        provider: 'semantic_scholar',
        title: subtopic.name ?? null,
        reason: 'provider_fetch_failed',
        rawError: safeErrorText(err),
        rawJson: subtopic,
      });
    }
  }

  return works;
};

const dedupeNormalizedWorks = (works: NormalizedWork[]) => {
  const seen = new Set<string>();
  const deduped: NormalizedWork[] = [];

  for (const work of works) {
    const key = work.doi
      ? `doi:${work.doi}`
      : work.id
        ? `id:${work.id}`
        : `title:${normalizeName(work.title)}:${work.publicationYear ?? ''}`;

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(work);
  }

  return deduped;
};

const rebuildAbstract = (abstractIndex: unknown) => {
  if (!abstractIndex || typeof abstractIndex !== 'object') return null;

  const words: Array<{ word: string; position: number }> = [];

  for (const [word, positions] of Object.entries(abstractIndex as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;

    for (const position of positions) {
      if (typeof position === 'number') words.push({ word, position });
    }
  }

  if (words.length === 0) return null;

  return words
    .sort((a, b) => a.position - b.position)
    .map(item => item.word)
    .join(' ');
};

const pickLocation = (work: any) =>
  work.best_oa_location ||
  work.primary_location ||
  (Array.isArray(work.locations) ? work.locations.find((location: any) => location?.pdf_url) : null) ||
  null;

const normalizeWork = (work: any, fallbackTopic: string): NormalizedWork => {
  const location = pickLocation(work);
  const source = location?.source || work.primary_location?.source || null;
  const doi = normalizeDoi(work.doi || work.ids?.doi || null);
  const licenseValue = location?.license || location?.license_id || work.open_access?.license || null;
  const landingPageUrl = location?.landing_page_url || work.primary_location?.landing_page_url || null;
  const pdfUrl = location?.pdf_url || work.open_access?.oa_url || null;

  // Every OA location OpenAlex knows about, plus the OA url — tried in order on download.
  const locationPdfUrls = Array.isArray(work.locations)
    ? work.locations.flatMap((loc: any) => [loc?.pdf_url, loc?.landing_page_url])
    : [];
  const pdfCandidates = uniqueHttpUrls([
    pdfUrl,
    work.best_oa_location?.pdf_url,
    work.primary_location?.pdf_url,
    work.open_access?.oa_url,
    ...locationPdfUrls,
    arxivPdfUrl(work.ids?.arxiv_id),
  ]);

  return {
    provider: 'openalex',
    id: work.id || null,
    title: work.title || work.display_name || 'Untitled',
    abstract: rebuildAbstract(work.abstract_inverted_index) || 'Abstract unavailable from provider metadata.',
    doi,
    publicationYear: Number.isFinite(Number(work.publication_year)) ? Number(work.publication_year) : null,
    topic: work.topics?.[0]?.display_name || fallbackTopic || 'Uncategorized',
    landingPageUrl,
    pdfUrl,
    fulltextUrl: location?.source?.homepage_url || landingPageUrl || pdfUrl,
    licenseUrl: licenseValue,
    licenseText: licenseValue,
    versionType: work.open_access?.oa_status || location?.version || null,
    source,
    authorships: Array.isArray(work.authorships) ? work.authorships : [],
    pdfCandidates,
    raw: work,
  };
};

const getLicenseId = async (canonicalName: string) => {
  const row = await db.prepare(`SELECT id FROM licenses WHERE canonical_name = ? LIMIT 1`).get(canonicalName) as any;
  return row?.id ?? null;
};

const upsertSource = async (work: NormalizedWork) => {
  const providerSourceId = work.source?.id ?? null;
  const name = work.source?.display_name || 'Unknown source';

  const existing = providerSourceId
    ? await db.prepare(`
        SELECT * FROM sources
        WHERE provider = ? AND provider_source_id = ?
        LIMIT 1
      `).get(work.provider, providerSourceId)
    : await db.prepare(`
        SELECT * FROM sources
        WHERE provider = ? AND name = ?
        LIMIT 1
      `).get(work.provider, name);

  if (existing) return existing as any;

  return await db.prepare(`
    INSERT INTO sources (id, provider, provider_source_id, name, raw_json)
    VALUES (?, ?, ?, ?, ?::jsonb)
    RETURNING *
  `).get(createId('source'), work.provider, providerSourceId, name, JSON.stringify(work.source ?? {}));
};

const upsertAuthor = async (author: any) => {
  const name = author?.display_name?.trim();
  if (!name) return null;

  const openalexAuthorId = author?.id ?? null;
  const normalizedName = normalizeName(name);

  const existing = openalexAuthorId
    ? await db.prepare(`SELECT * FROM authors WHERE openalex_author_id = ? LIMIT 1`).get(openalexAuthorId)
    : await db.prepare(`SELECT * FROM authors WHERE normalized_name = ? LIMIT 1`).get(normalizedName);

  if (existing) return existing as any;

  return await db.prepare(`
    INSERT INTO authors (id, name, institution, email, openalex_author_id, normalized_name)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(createId('author'), name, 'Unknown', 'unknown@openalex.local', openalexAuthorId, normalizedName);
};

const linkAuthor = async (paperId: string, authorId: string) => {
  await db.prepare(`
    INSERT INTO paper_authors (paper_id, author_id)
    VALUES (?, ?)
    ON CONFLICT DO NOTHING
  `).run(paperId, authorId);
};

const upsertLicenseSnapshot = async (work: NormalizedWork) => {
  const normalized = normalizeLicense({
    licenseUrl: work.licenseUrl,
    licenseText: work.licenseText,
  });
  const licenseId = await getLicenseId(normalized.canonicalName);

  const existing = await db.prepare(`
    SELECT *
    FROM license_snapshots
    WHERE COALESCE(license_id, '') = COALESCE(?::text, '')
      AND COALESCE(raw_license_url, '') = COALESCE(?::text, '')
      AND COALESCE(source_url, '') = COALESCE(?::text, '')
      AND provider = ?
      AND decision = ?
    LIMIT 1
  `).get(licenseId, work.licenseUrl, work.landingPageUrl, work.provider, normalized.policy) as any;

  if (existing) return existing;

  return await db.prepare(`
    INSERT INTO license_snapshots (
      id, license_id, raw_license_text, raw_license_url, source_url,
      provider, decision, decision_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    createId('license_snapshot'),
    licenseId,
    work.licenseText,
    work.licenseUrl,
    work.landingPageUrl,
    work.provider,
    normalized.policy,
    normalized.reason
  );
};

const upsertPaperVersion = async (input: {
  paperId: string;
  sourceId: string;
  licenseSnapshotId: string;
  work: NormalizedWork;
  downloadStatus: string;
}) => {
  const existing = await db.prepare(`
    SELECT *
    FROM paper_versions
    WHERE paper_id = ?
      AND provider = ?
      AND (
        landing_page_url = ?
        OR pdf_url = ?
        OR fulltext_url = ?
        OR raw_json ->> 'id' = ?
      )
    LIMIT 1
  `).get(
    input.paperId,
    input.work.provider,
    input.work.landingPageUrl,
    input.work.pdfUrl,
    input.work.fulltextUrl,
    input.work.id
  ) as any;

  if (existing) {
    const updated = await db.prepare(`
      UPDATE paper_versions
      SET source_id = ?,
          license_snapshot_id = ?,
          landing_page_url = ?,
          pdf_url = ?,
          fulltext_url = ?,
          version_type = ?,
          raw_json = ?::jsonb,
          updated_at = now()
      WHERE id = ?
      RETURNING *
    `).get(
      input.sourceId,
      input.licenseSnapshotId,
      input.work.landingPageUrl,
      input.work.pdfUrl,
      input.work.fulltextUrl,
      input.work.versionType,
      JSON.stringify(input.work.raw),
      existing.id
    ) as any;

    return { row: updated, created: false };
  }

  const inserted = await db.prepare(`
    INSERT INTO paper_versions (
      id, paper_id, source_id, provider, landing_page_url, pdf_url,
      fulltext_url, license_snapshot_id, version_type, download_status, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
    RETURNING *
  `).get(
    createId('paper_version'),
    input.paperId,
    input.sourceId,
    input.work.provider,
    input.work.landingPageUrl,
    input.work.pdfUrl,
    input.work.fulltextUrl,
    input.licenseSnapshotId,
    input.work.versionType,
    input.downloadStatus,
    JSON.stringify(input.work.raw)
  );

  return { row: inserted, created: true };
};

// A transparent, contactable User-Agent (shared with the robots gate) so publishers can
// identify and reach us. We deliberately do NOT spoof a browser: if a host returns 403 to
// an honest bot, that signals it does not want automated access, and we fall back to
// metadata-only (downloadFirstWorkingPdf yields null and the record stays a link-out).
const PDF_FETCH_HEADERS = {
  'User-Agent': INGEST_USER_AGENT,
  Accept: 'application/pdf,*/*',
};

const downloadPdf = async (pdfUrl: string) => {
  const response = await fetch(pdfUrl, { redirect: 'follow', headers: PDF_FETCH_HEADERS });

  if (!response.ok) {
    throw new Error(`PDF download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/pdf';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > maxPdfBytes) {
    throw new Error(`PDF is too large: ${buffer.byteLength} bytes`);
  }

  const looksLikePdf = buffer.subarray(0, 4).toString() === '%PDF';
  if (!contentType.toLowerCase().includes('pdf') && !looksLikePdf) {
    throw new Error(`Downloaded file is not a PDF. Content-Type: ${contentType}`);
  }

  return {
    buffer,
    contentType,
    checksumSha256: createHash('sha256').update(buffer).digest('hex'),
  };
};

// Ask Unpaywall for a verified open-access PDF link for a DOI (best-effort).
export const resolveUnpaywallPdfUrls = async (doi: string | null): Promise<string[]> => {
  if (!doi) return [];
  const email = process.env.UNPAYWALL_EMAIL || process.env.OPENALEX_MAILTO;
  if (!email) return [];

  try {
    const client = createUnpaywallClient({ email });
    const record = await client.getByDoi(doi);
    const locations = [record.best_oa_location, ...(record.oa_locations ?? [])];
    return uniqueHttpUrls(locations.flatMap(loc => [loc?.url_for_pdf, loc?.url]));
  } catch (err) {
    console.error(`Unpaywall lookup failed for ${doi}:`, err instanceof Error ? err.message : err);
    return [];
  }
};

// Try each candidate URL in order; return the first that yields a real PDF, or null.
// Each candidate is gated by robots.txt and spaced out per host before fetching, so a
// disallowed or unreachable host is skipped (the record falls back to metadata-only).
const downloadFirstWorkingPdf = async (candidates: string[]) => {
  for (const url of candidates) {
    try {
      const gate = await checkRobots(url);
      if (!gate.allowed) continue; // robots disallows this host/path — try the next candidate
      await waitForHostSlot(url, gate.crawlDelayMs);
      const downloaded = await downloadPdf(url);
      return { ...downloaded, sourceUrl: url };
    } catch {
      // Try the next candidate (landing page, 403, non-PDF, etc.).
    }
  }
  return null;
};

export const storePdf = async (input: {
  paperId: string;
  title: string;
  candidates: string[];
}) => {
  const downloaded = await downloadFirstWorkingPdf(input.candidates);
  if (!downloaded) return null;

  const fileName = `${sanitizeStoragePart(input.title || input.paperId)}.pdf`;
  const storageKey = `ingested-papers/${input.paperId}/${fileName}`;

  const stored = await objectStorage.uploadBuffer({
    key: storageKey,
    body: downloaded.buffer,
    contentType: downloaded.contentType,
  });

  return {
    storageBucket: stored.bucket,
    storageKey: stored.key,
    contentType: downloaded.contentType,
    checksumSha256: downloaded.checksumSha256,
    sourceUrl: downloaded.sourceUrl,
  };
};

const updateVersionDownload = async (input: {
  versionId: string;
  status: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  contentType?: string | null;
  checksumSha256?: string | null;
}) => {
  await db.prepare(`
    UPDATE paper_versions
    SET download_status = ?,
        storage_bucket = ?,
        storage_key = ?,
        content_type = ?,
        checksum_sha256 = ?,
        retrieved_at = CASE WHEN ? = 'downloaded' THEN now() ELSE retrieved_at END,
        updated_at = now()
    WHERE id = ?
  `).run(
    input.status,
    input.storageBucket ?? null,
    input.storageKey ?? null,
    input.contentType ?? null,
    input.checksumSha256 ?? null,
    input.status,
    input.versionId
  );
};

const loadWorks = async (input: {
  jobId: string;
  sourceMode: SourceMode;
  subtopics: any[];
  perPage: number;
}): Promise<NormalizedWork[]> => {
  const fallbackTopic = input.subtopics[0]?.name ?? 'Uncategorized';

  if (input.sourceMode === 'fixture') {
    const fixtureWorks = await loadFixtureWorks();
    const filtered = filterFixtureWorksForSubtopics(fixtureWorks, input.subtopics);
    return filtered.map(raw => normalizeWork(raw, fallbackTopic));
  }

  const [openAlexWorks, semanticScholarWorks] = await Promise.all([
    loadOpenAlexWorks(input.jobId, input.subtopics, input.perPage, fallbackTopic),
    loadSemanticScholarWorks(input.jobId, input.subtopics, input.perPage, fallbackTopic),
  ]);

  return [...openAlexWorks, ...semanticScholarWorks];
};

export const runIngestPapersJob = async (jobId: string) => {
  const job = await getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = parsePayload((job as any).payload_json);
  const discoveryJobId = String(payload.discoveryJobId || '');
  const subtopicIds = Array.isArray(payload.subtopicIds)
    ? payload.subtopicIds.filter((id): id is string => typeof id === 'string')
    : [];
  const downloadFiles = payload.downloadFiles === true;
  const sourceMode = readSourceMode(payload);
  const perPage = readPerPage(payload);

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 10, `Starting ${sourceMode} paper ingestion`);

  const subtopics = await loadSelectedSubtopics(discoveryJobId, subtopicIds);
  if (subtopics.length === 0) {
    throw new Error('ingest_papers job requires at least one selected subtopic');
  }

  const works = dedupeNormalizedWorks(await loadWorks({ jobId, sourceMode, subtopics, perPage }));

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 30, `Fetched ${works.length} works`);

  const result = {
    ingestedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    skippedRecordCount: 0,
    failedCount: 0,
    downloadedCount: 0,
    downloadFailedCount: 0,
    sourceMode,
    fetchedCount: works.length,
  };

  // Approved papers from this run, eligible for one-time AI analysis.
  const analyzedIds: string[] = [];

  for (const work of works) {
    try {
      const dedupe = await findExistingPaperForCandidate({
        doi: work.doi,
        openAlexId: work.id,
        title: work.title,
        publicationYear: work.publicationYear,
        sourceUrls: [work.landingPageUrl, work.pdfUrl, work.fulltextUrl],
      });

      const source = await upsertSource(work);
      const licenseSnapshot = await upsertLicenseSnapshot(work);
      const skippedByLicense = ['conditional_review', 'unknown_review', 'blocked'].includes(String(licenseSnapshot.decision));
      const paperStatus = skippedByLicense ? 'pending' : 'approved';

      if (skippedByLicense) {
        result.skippedCount += 1;

        await createSkippedRecord({
          jobId,
          provider: work.provider,
          providerSourceId: work.id,
          sourceUrl: work.landingPageUrl || work.pdfUrl || work.fulltextUrl,
          title: work.title,
          doi: work.doi,
          reason: licenseSkipReason(String(licenseSnapshot.decision)),
          rawJson: work.raw,
        });
      }

         let paper = dedupe.paper as any;

      if (paper && !skippedByLicense && paper.status === 'pending') {
        await db.prepare(`
          UPDATE papers
          SET status = 'approved', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(paper.id);

        paper.status = 'approved';
      }

      if (!paper) {
        paper = await db.prepare(`
          INSERT INTO papers (
            id, title, abstract, topic, file_path, doi, status,
            openalex_id, publication_year, normalized_title_hash
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `).get(
          createId('paper'),
          work.title,
          work.abstract,
          work.topic,
          `metadata-only-${work.id?.split('/').pop() ?? randomUUID()}.pdf`,
          work.doi,
          paperStatus,
          work.id,
          work.publicationYear,
          createNormalizedTitleHash(work.title)
        );

        result.insertedCount += 1;
      }
      const version = await upsertPaperVersion({
        paperId: paper.id,
        sourceId: source.id,
        licenseSnapshotId: licenseSnapshot.id,
        work,
        downloadStatus: skippedByLicense ? 'skipped_license' : 'not_requested',
      });

      if (dedupe.paper && version.created) result.updatedCount += 1;
      if (dedupe.paper && !version.created) result.duplicateCount += 1;

      if (!skippedByLicense && downloadFiles && !version.row.storage_key) {
        try {
          // Build the resolution chain: provider candidates first, then Unpaywall by DOI.
          const candidates = uniqueHttpUrls([
            ...work.pdfCandidates,
            ...(await resolveUnpaywallPdfUrls(work.doi)),
          ]);

          const storedPdf = candidates.length > 0
            ? await storePdf({ paperId: paper.id, title: work.title, candidates })
            : null;

          if (storedPdf) {
            await updateVersionDownload({
              versionId: version.row.id,
              status: 'downloaded',
              storageBucket: storedPdf.storageBucket,
              storageKey: storedPdf.storageKey,
              contentType: storedPdf.contentType,
              checksumSha256: storedPdf.checksumSha256,
            });

            await db.prepare(`
              UPDATE papers
              SET file_path = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(storedPdf.storageKey, paper.id);

            result.downloadedCount += 1;
          } else {
            result.downloadFailedCount += 1;
            await updateVersionDownload({ versionId: version.row.id, status: 'download_failed' });
          }
        } catch (err) {
          result.downloadFailedCount += 1;
          await updateVersionDownload({
            versionId: version.row.id,
            status: 'download_failed',
          });
          console.error('PDF download failed:', err);
        }
      }

      for (const authorship of work.authorships) {
        const author = await upsertAuthor(authorship.author);
        if (author?.id) await linkAuthor(paper.id, author.id);
      }

      if (!skippedByLicense) analyzedIds.push(paper.id);
      result.ingestedCount += 1;
    } catch (err) {
      result.failedCount += 1;

      await createSkippedRecord({
        jobId,
        provider: work.provider,
        providerSourceId: work.id,
        sourceUrl: work.landingPageUrl ?? work.pdfUrl ?? work.fulltextUrl ?? null,
        title: work.title,
        doi: work.doi,
        reason: 'paper_ingest_failed',
        rawError: safeErrorText(err),
        rawJson: work.raw,
      });

      console.error('Paper ingest failed:', err);
    }
  }

  result.skippedRecordCount = await countSkippedRecords(jobId);

  // One-time AI analysis (auto). Best-effort: never fails the ingest.
  const autoAnalyze = (process.env.AI_AUTO_ANALYZE ?? 'true').toLowerCase() !== 'false';
  if (autoAnalyze && isAiEnabled() && analyzedIds.length > 0) {
    await updateJobStatus(jobId, JOB_STATUS.RUNNING, 92, `Running AI analysis on ${analyzedIds.length} papers`);
    let aiOk = 0;
    for (const pid of analyzedIds.slice(0, 30)) {
      try {
        const r = await analyzeAndStorePaper(pid);
        if (r.ok) aiOk += 1;
      } catch (err) {
        console.error('AI analysis failed for', pid, err instanceof Error ? err.message : err);
      }
    }
    (result as Record<string, unknown>).aiAnalyzedCount = aiOk;
  }

  await updateJobStatus(jobId, JOB_STATUS.RUNNING, 96, 'Finished paper ingestion');
  return await completeJob(jobId, result);
};