import { orcidProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type OrcidSearchResponse = {
  'expanded-result'?: Array<{
    'orcid-id'?: string;
    'given-names'?: string;
    'family-names'?: string;
    'credit-name'?: string;
  }>;
  'num-found'?: number;
};

export type OrcidRecord = Record<string, unknown>;

export const createOrcidClient = (options: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  accessToken?: string;
} = {}) => {
  const baseUrl = options.baseUrl ?? orcidProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;

  const headers = () => {
    const token = options.accessToken ?? process.env.ORCID_ACCESS_TOKEN;
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  return {
    search: async (query: string, rows = 10) => {
      return await requestJson<OrcidSearchResponse>(
        'ORCID',
        fetchImpl,
        buildUrl(baseUrl, 'expanded-search', { q: query, rows }),
        { headers: headers() }
      );
    },

    getRecord: async (orcidId: string) => {
      return await requestJson<OrcidRecord>(
        'ORCID',
        fetchImpl,
        buildUrl(baseUrl, `${orcidId}/record`),
        { headers: headers() }
      );
    },
  };
};