import { crossrefProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type CrossrefWork = {
  DOI?: string;
  title?: string[];
  abstract?: string;
  URL?: string;
  publisher?: string;
  author?: Array<{ given?: string; family?: string; ORCID?: string }>;
  license?: Array<{ URL?: string; start?: unknown }>;
  issued?: { 'date-parts'?: number[][] };
};

export type CrossrefWorksResponse = {
  status: string;
  message: { items: CrossrefWork[]; 'total-results'?: number; 'next-cursor'?: string };
};

export type CrossrefWorkResponse = {
  status: string;
  message: CrossrefWork;
};

export const createCrossrefClient = (options: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  mailto?: string;
} = {}) => {
  const baseUrl = options.baseUrl ?? crossrefProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const mailto = options.mailto ?? process.env.CROSSREF_MAILTO;

  return {
    searchWorks: async (input: { query?: string; rows?: number; cursor?: string; filter?: string } = {}) => {
      return await requestJson<CrossrefWorksResponse>(
        'Crossref',
        fetchImpl,
        buildUrl(baseUrl, 'works', {
          query: input.query,
          rows: input.rows ?? 20,
          cursor: input.cursor,
          filter: input.filter,
          mailto,
        })
      );
    },

    getWorkByDoi: async (doi: string) => {
      return await requestJson<CrossrefWorkResponse>(
        'Crossref',
        fetchImpl,
        buildUrl(baseUrl, `works/${encodeURIComponent(doi)}`, { mailto })
      );
    },
  };
};