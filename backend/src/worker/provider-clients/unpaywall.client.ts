import { unpaywallProviderPolicy } from './provider-policy.ts';
import { buildUrl, requestJson, type FetchLike } from './provider-http.ts';

export type UnpaywallLocation = {
  url?: string | null;
  url_for_pdf?: string | null;
  license?: string | null;
  host_type?: string | null;
  version?: string | null;
};

export type UnpaywallDoiRecord = {
  doi: string;
  title?: string | null;
  is_oa?: boolean;
  oa_status?: string | null;
  best_oa_location?: UnpaywallLocation | null;
  oa_locations?: UnpaywallLocation[];
};

export const createUnpaywallClient = (options: {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  email?: string;
} = {}) => {
  const baseUrl = options.baseUrl ?? unpaywallProviderPolicy.baseUrl;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    getByDoi: async (doi: string) => {
      const email = options.email ?? process.env.UNPAYWALL_EMAIL;
      if (!email) throw new Error('UNPAYWALL_EMAIL is required for Unpaywall requests.');

      return await requestJson<UnpaywallDoiRecord>(
        'Unpaywall',
        fetchImpl,
        buildUrl(baseUrl, encodeURIComponent(doi), { email })
      );
    },
  };
};