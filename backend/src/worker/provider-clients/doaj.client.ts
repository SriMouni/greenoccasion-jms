import { doajProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type DoajArticle = {
  id?: string;
  bibjson?: {
    title?: string;
    identifier?: Array<{ type?: string; id?: string }>;
    link?: Array<{ type?: string; url?: string }>;
    journal?: { title?: string; publisher?: string };
    author?: Array<{ name?: string }>;
  };
};

export type DoajSearchResponse = {
  total?: number;
  page?: number;
  pageSize?: number;
  results?: DoajArticle[];
};

export const createDoajClient = (options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) => {
  const baseUrl = options.baseUrl ?? doajProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    searchArticles: async (input: { query: string; page?: number; pageSize?: number }) => {
      const query = input.query.trim() || '*';

      return await requestJson<DoajSearchResponse>(
        'DOAJ',
        fetchImpl,
        buildUrl(baseUrl, `search/articles/${encodeURIComponent(query)}`, {
          page: input.page ?? 1,
          pageSize: input.pageSize ?? 10,
        })
      );
    },
  };
};