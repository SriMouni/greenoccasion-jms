import { openAlexProviderPolicy } from './provider-policy.ts';

export type OpenAlexMeta = {
  count: number;
  db_response_time_ms?: number;
  page?: number;
  per_page?: number;
  next_cursor?: string;
};

export type OpenAlexTopic = {
  id: string;
  display_name: string;
  description?: string;
  works_count?: number;
  keywords?: string[];
};

export type OpenAlexGroupByItem = {
  key: string;
  key_display_name: string;
  count: number;
};

export type OpenAlexLocation = {
  is_oa?: boolean;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  license?: string | null;
  license_id?: string | null;
  version?: string | null;
  source?: {
    id?: string;
    display_name?: string;
    homepage_url?: string | null;
    is_oa?: boolean;
    is_in_doaj?: boolean;
    type?: string;
  } | null;
};

export type OpenAlexWork = {
  id: string;
  doi?: string | null;
  ids?: {
    doi?: string | null;
  };
  title?: string | null;
  display_name?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  publication_year?: number;
  topics?: Array<{
    id: string;
    display_name: string;
  }>;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[];
  open_access?: {
    is_oa?: boolean;
    oa_status?: string;
    oa_url?: string | null;
    license?: string | null;
  };
  authorships?: Array<{
    author?: {
      id?: string;
      display_name?: string;
    };
  }>;
};

export type OpenAlexTopicSearchResponse = {
  meta: OpenAlexMeta;
  results: OpenAlexTopic[];
};

export type OpenAlexWorksGroupByResponse = {
  meta: OpenAlexMeta;
  group_by: OpenAlexGroupByItem[];
};

export type OpenAlexWorksResponse = {
  meta: OpenAlexMeta;
  results: OpenAlexWork[];
};

export type OpenAlexWorkFilters = {
  fromPublicationYear?: number;
  toPublicationYear?: number;
  perPage?: number;
  /** Restrict to open-access works (is_oa:true). */
  openAccessOnly?: boolean;
  /**
   * Restrict to works whose best OA location carries one of these license codes
   * (OpenAlex codes, e.g. 'cc-by', 'cc0'). Joined with OR.
   */
  licenses?: string[];
};

export type OpenAlexClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  mailto?: string;
};

const buildUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined | null>
) => {
  const url = new URL(path, baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
};

const getOpenAlexApiKey = (options: OpenAlexClientOptions) =>
  options.apiKey || process.env.OPENALEX_API_KEY || '';

const getOpenAlexMailto = (options: OpenAlexClientOptions) =>
  options.mailto || process.env.OPENALEX_MAILTO || '';

const appendAuthParams = (url: URL, options: OpenAlexClientOptions) => {
  const apiKey = getOpenAlexApiKey(options);
  const mailto = getOpenAlexMailto(options);

  if (apiKey) url.searchParams.set('api_key', apiKey);
  if (mailto) url.searchParams.set('mailto', mailto);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry transient failures (429 rate-limit, 5xx, network errors) per the declared
// provider policy, with linear backoff, so we stay a polite client of the API.
const requestJson = async <T>(
  fetchImpl: typeof fetch,
  url: URL,
  options: OpenAlexClientOptions
): Promise<T> => {
  appendAuthParams(url, options);

  const mailto = getOpenAlexMailto(options);
  const { count: maxAttempts, backoffMs } = openAlexProviderPolicy.retry;
  let lastError: unknown;

  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    if (attempt > 0) await sleep(backoffMs * attempt);

    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': mailto
            ? `GreenOccasionBot/1.0 (+https://greenoccasion.org/contact; mailto:${mailto})`
            : 'GreenOccasionBot/1.0 (+https://greenoccasion.org/contact)',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(
          `OpenAlex request failed with ${response.status} ${response.statusText}: ${body}`
        );
        // Only retry transient statuses; fail fast on 4xx (other than 429).
        if (response.status === 429 || response.status >= 500) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenAlex request failed');
};

const buildWorksFilter = (topicId: string, filters: OpenAlexWorkFilters = {}) => {
  const filterParts = [`topics.id:${topicId}`];

  if (filters.fromPublicationYear !== undefined) {
    filterParts.push(`from_publication_date:${filters.fromPublicationYear}-01-01`);
  }

  if (filters.toPublicationYear !== undefined) {
    filterParts.push(`to_publication_date:${filters.toPublicationYear}-12-31`);
  }

  if (filters.openAccessOnly) {
    filterParts.push('is_oa:true');
  }

  if (filters.licenses && filters.licenses.length > 0) {
    filterParts.push(`best_oa_location.license:${filters.licenses.join('|')}`);
  }

  return filterParts.join(',');
};

export type OpenAlexAuthor = {
  id?: string;
  orcid?: string | null;
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  ids?: { openalex?: string; orcid?: string | null };
  last_known_institutions?: Array<{
    id?: string;
    ror?: string | null;
    display_name?: string;
    country_code?: string | null;
  }>;
  affiliations?: Array<{
    institution?: { id?: string; ror?: string | null; display_name?: string; country_code?: string | null };
  }>;
};

export const createOpenAlexClient = (options: OpenAlexClientOptions = {}) => {
  const baseUrl = options.baseUrl ?? openAlexProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    getAuthorById: async (authorId: string) => {
      // Accept a full OpenAlex URL or a bare id (A123...).
      const id = authorId.split('/').pop() || authorId;
      const url = buildUrl(baseUrl, `/authors/${id}`, {});
      return await requestJson<OpenAlexAuthor>(fetchImpl, url, options);
    },

    searchTopics: async (topicText: string) => {
      const url = buildUrl(baseUrl, '/topics', {
        search: topicText,
      });

      return await requestJson<OpenAlexTopicSearchResponse>(fetchImpl, url, options);
    },

    groupWorksByTopic: async (topicText: string) => {
      const url = buildUrl(baseUrl, '/works', {
        search: topicText,
        group_by: 'topics.id',
      });

      return await requestJson<OpenAlexWorksGroupByResponse>(fetchImpl, url, options);
    },

    groupWorksBySource: async (topicText: string) => {
      const url = buildUrl(baseUrl, '/works', {
        search: topicText,
        group_by: 'primary_location.source.id',
      });

      return await requestJson<OpenAlexWorksGroupByResponse>(fetchImpl, url, options);
    },

    listWorksForTopic: async (
      topicId: string,
      filters: OpenAlexWorkFilters = {}
    ) => {
      const url = buildUrl(baseUrl, '/works', {
        filter: buildWorksFilter(topicId, filters),
        per_page: filters.perPage,
      });

      return await requestJson<OpenAlexWorksResponse>(fetchImpl, url, options);
    },
  };
};