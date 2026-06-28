import { europePmcProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type EuropePmcResult = {
  id?: string;
  source?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  journalTitle?: string;
  authorString?: string;
  pubYear?: string;
  isOpenAccess?: string;
  fullTextUrlList?: { fullTextUrl?: Array<{ url?: string; documentStyle?: string }> };
};

export type EuropePmcSearchResponse = {
  hitCount?: number;
  nextCursorMark?: string;
  resultList?: { result?: EuropePmcResult[] };
};

export const createEuropePmcClient = (options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) => {
  const baseUrl = options.baseUrl ?? europePmcProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    searchArticles: async (input: { query: string; pageSize?: number; cursorMark?: string }) => {
      return await requestJson<EuropePmcSearchResponse>(
        'Europe PMC',
        fetchImpl,
        buildUrl(baseUrl, 'search', {
          query: input.query,
          format: 'json',
          pageSize: input.pageSize ?? 10,
          cursorMark: input.cursorMark,
        })
      );
    },

    findByDoi: async (doi: string) => {
      return await requestJson<EuropePmcSearchResponse>(
        'Europe PMC',
        fetchImpl,
        buildUrl(baseUrl, 'search', {
          query: `DOI:"${doi}"`,
          format: 'json',
          pageSize: 1,
        })
      );
    },
  };
};