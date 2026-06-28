export type ProviderName =
  | 'openalex'
  | 'crossref'
  | 'unpaywall'
  | 'doaj'
  | 'europepmc'
  | 'orcid'
  | 'ror'
  | 'semanticscholar';

export type ProviderRetryPolicy = {
  count: number;
  backoffMs: number;
};

export type ProviderPolicy = {
  providerName: ProviderName;
  baseUrl: string;
  maxConcurrentRequests: number;
  retry: ProviderRetryPolicy;
  requiresApiKey: boolean;
};

export const providerPolicies = {
  openalex: {
    providerName: 'openalex',
    baseUrl: 'https://api.openalex.org',
    maxConcurrentRequests: 5,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  crossref: {
    providerName: 'crossref',
    baseUrl: 'https://api.crossref.org/v1',
    maxConcurrentRequests: 3,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  unpaywall: {
    providerName: 'unpaywall',
    baseUrl: 'https://api.unpaywall.org/v2',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  doaj: {
    providerName: 'doaj',
    baseUrl: 'https://doaj.org/api/v4',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  europepmc: {
    providerName: 'europepmc',
    baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  orcid: {
    providerName: 'orcid',
    baseUrl: 'https://pub.orcid.org/v3.0',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: true,
  },
  ror: {
    providerName: 'ror',
    baseUrl: 'https://api.ror.org/v2',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
  semanticscholar: {
    providerName: 'semanticscholar',
    baseUrl: 'https://api.semanticscholar.org/graph/v1',
    maxConcurrentRequests: 2,
    retry: { count: 3, backoffMs: 1_000 },
    requiresApiKey: false,
  },
} as const satisfies Record<ProviderName, ProviderPolicy>;

export const openAlexProviderPolicy = providerPolicies.openalex;
export const crossrefProviderPolicy = providerPolicies.crossref;
export const unpaywallProviderPolicy = providerPolicies.unpaywall;
export const doajProviderPolicy = providerPolicies.doaj;
export const europePmcProviderPolicy = providerPolicies.europepmc;
export const orcidProviderPolicy = providerPolicies.orcid;
export const rorProviderPolicy = providerPolicies.ror;
export const semanticScholarProviderPolicy = providerPolicies.semanticscholar;