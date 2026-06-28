import { rorProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type RorOrganization = {
  id?: string;
  names?: Array<{ value?: string; types?: string[] }>;
  locations?: unknown[];
  links?: unknown[];
  status?: string;
};

export type RorSearchResponse = {
  number_of_results?: number;
  items?: RorOrganization[];
};

export const createRorClient = (options: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  clientId?: string;
} = {}) => {
  const baseUrl = options.baseUrl ?? rorProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const clientId = options.clientId ?? process.env.ROR_CLIENT_ID;

  return {
    searchOrganizations: async (query: string, page = 1) => {
      return await requestJson<RorSearchResponse>(
        'ROR',
        fetchImpl,
        buildUrl(baseUrl, 'organizations', { query, page, client_id: clientId })
      );
    },

    matchAffiliation: async (affiliation: string) => {
      return await requestJson<RorSearchResponse>(
        'ROR',
        fetchImpl,
        buildUrl(baseUrl, 'organizations', { affiliation, client_id: clientId })
      );
    },
  };
};