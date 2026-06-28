import { semanticScholarProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type SemanticScholarPaper = {
  paperId?: string;
  corpusId?: number;
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  publicationVenue?: {
    id?: string;
    name?: string;
    type?: string;
  } | null;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    PubMed?: string;
    PubMedCentral?: string;
  };
  openAccessPdf?: {
    url?: string;
    status?: string;
    license?: string | null;
    disclaimer?: string | null;
  } | null;
  authors?: Array<{
    authorId?: string;
    name?: string;
  }>;
  url?: string;
};

export type SemanticScholarSearchResponse = {
  total?: number;
  offset?: number;
  next?: number;
  data?: SemanticScholarPaper[];
};

export type SemanticScholarClientOptions = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  apiKey?: string;
};

const defaultPaperFields = [
  'paperId',
  'corpusId',
  'title',
  'abstract',
  'year',
  'venue',
  'publicationVenue',
  'externalIds',
  'openAccessPdf',
  'authors',
  'url',
].join(',');

// A transparent, contactable User-Agent so Semantic Scholar can identify and reach us.
const SEMANTIC_SCHOLAR_CONTACT =
  process.env.INGEST_CONTACT_EMAIL || process.env.UNPAYWALL_EMAIL || process.env.OPENALEX_MAILTO || '';
const SEMANTIC_SCHOLAR_USER_AGENT = SEMANTIC_SCHOLAR_CONTACT
  ? `GreenOccasionBot/1.0 (+https://greenoccasion.org/contact; mailto:${SEMANTIC_SCHOLAR_CONTACT})`
  : 'GreenOccasionBot/1.0 (+https://greenoccasion.org/contact)';

const buildHeaders = (apiKey?: string): RequestInit => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': SEMANTIC_SCHOLAR_USER_AGENT,
  };

  if (apiKey) headers['x-api-key'] = apiKey;

  return { headers };
};

export const createSemanticScholarClient = (options: SemanticScholarClientOptions = {}) => {
  const baseUrl = options.baseUrl ?? semanticScholarProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY;
  const requestInit = buildHeaders(apiKey);

  return {
    searchPapers: async (input: { query: string; limit?: number; offset?: number }) => {
      return await requestJson<SemanticScholarSearchResponse>(
        'Semantic Scholar',
        fetchImpl,
        buildUrl(baseUrl, 'paper/search', {
          query: input.query,
          limit: input.limit ?? 10,
          offset: input.offset ?? 0,
          fields: defaultPaperFields,
        }),
        requestInit
      );
    },

    getPaperById: async (paperId: string) => {
      return await requestJson<SemanticScholarPaper>(
        'Semantic Scholar',
        fetchImpl,
        buildUrl(baseUrl, `paper/${encodeURIComponent(paperId)}`, {
          fields: defaultPaperFields,
        }),
        requestInit
      );
    },
  };
};