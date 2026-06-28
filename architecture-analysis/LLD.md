# Low-Level Design: Research Aggregation Pipeline

## Implementation Baseline

Recommended MVP stack:

- Frontend: existing React/Vite app.
- API: existing Express server split into modules.
- DB: PostgreSQL.
- Queue: Redis + BullMQ.
- Worker: Node/TypeScript worker.
- Storage: GCS, matching the current repo's deployment path.
- Export: `exceljs` for XLSX and a CSV fallback.

If the team chooses Celery/Python, keep the same API, schema, and job state model. Only the worker implementation changes.

## Proposed Module Layout

```text
src/
  server/
    app.ts
    config.ts
    db/
      pool.ts
      migrations/
      transaction.ts
    auth/
      auth.routes.ts
      auth.service.ts
      session.store.ts
    papers/
      papers.routes.ts
      papers.repository.ts
      papers.service.ts
    discovery/
      discovery.routes.ts
      discovery.repository.ts
      discovery.service.ts
    licenses/
      license-normalizer.ts
      license-policy.ts
      licenses.routes.ts
    ingestion/
      ingestion.routes.ts
      ingest.repository.ts
    authors/
      authors.routes.ts
      author-enrichment.service.ts
    exports/
      exports.routes.ts
      export.service.ts
    storage/
      object-storage.ts
  worker/
    worker.ts
    queue.ts
    provider-clients/
      openalex.client.ts
      crossref.client.ts
      unpaywall.client.ts
      doaj.client.ts
      europepmc.client.ts
      pmc.client.ts
      orcid.client.ts
      ror.client.ts
    jobs/
      discover-subtopics.job.ts
      ingest-papers.job.ts
      enrich-authors.job.ts
      export-papers.job.ts
```

## Job State Machine

```text
queued -> running -> completed
   |         |
   |         +-> waiting_manual_review
   |         +-> retrying
   |         +-> failed
   |
   +-> cancelled
```

Rules:

- `jobs.status` is persisted in Postgres.
- BullMQ handles execution/retries, but Postgres is the UI source of truth.
- Each progress change writes a `job_events` row.
- Jobs are idempotent using `payload_hash`.
- Phase 1 jobs are admin-triggered on demand; no continuous crawler or scheduled harvesting.
- If an active job already exists for the same type and payload hash, return the existing job or HTTP `409`.
- Failed records are stored separately from failed jobs. Partial success is valid.
- Worker code must check existing DB records before inserting topics, subtopics, papers, authors, sources, paper versions, or files.

## API Contracts

### Create Discovery Job

`POST /api/jobs/discover-subtopics`

Admin-triggered only. This endpoint starts a discovery job when the admin wants to add or refresh a topic area.

Request:

```json
{
  "topicText": "carbon emission",
  "limit": 30,
  "filters": {
    "fromYear": 2015,
    "toYear": 2026,
    "workTypes": ["journal-article", "preprint"]
  }
}
```

Response:

```json
{
  "jobId": "job_01",
  "status": "queued"
}
```

### Get Job Status

`GET /api/jobs/:jobId`

Response:

```json
{
  "id": "job_01",
  "type": "discover_subtopics",
  "status": "running",
  "progress": 45,
  "message": "Grouping OpenAlex topics",
  "createdAt": "2026-05-29T09:30:00.000Z",
  "updatedAt": "2026-05-29T09:31:00.000Z"
}
```

### List Discovery Subtopics

`GET /api/discoveries/:jobId/subtopics`

Response item:

```json
{
  "id": "subtopic_01",
  "name": "Industrial carbon emissions",
  "providerTopicId": "https://openalex.org/T123",
  "paperCount": 18342,
  "sourceCount": 817,
  "confidence": 0.91,
  "sampleSources": [
    { "name": "Journal of Cleaner Production", "paperCount": 312 },
    { "name": "Energy Policy", "paperCount": 144 }
  ],
  "samplePapers": [
    { "title": "Decarbonization pathways in cement plants", "doi": "10.xxxx/example" }
  ]
}
```

### List License Options For Discovery

`POST /api/licenses/preview`

Request:

```json
{
  "discoveryJobId": "job_01",
  "subtopicIds": ["subtopic_01", "subtopic_02"]
}
```

Response item:

```json
{
  "canonicalName": "CC BY 4.0",
  "paperCount": 2401,
  "policy": "auto_allowed",
  "reason": "Allows sharing and adaptation with attribution",
  "requiresManualReview": false
}
```

### Create Ingestion Job

`POST /api/jobs/ingest-papers`

Admin-triggered only. This endpoint starts ingestion after the admin has selected subtopics and license policies.

Request:

```json
{
  "discoveryJobId": "job_01",
  "subtopicIds": ["subtopic_01", "subtopic_02"],
  "licensePolicies": ["auto_allowed"],
  "maxPapersPerSubtopic": 1000,
  "downloadFiles": true
}
```

Response:

```json
{
  "jobId": "job_02",
  "status": "queued"
}
```

### Create Export

`POST /api/jobs/export-papers`

Request:

```json
{
  "ingestJobId": "job_02",
  "format": "xlsx"
}
```

### Download Export

`GET /api/exports/:exportId/download`

Response:

- 302 to signed URL, or streamed file with `Content-Disposition`.

### Create Author Enrichment Job

`POST /api/jobs/enrich-authors`

Request:

```json
{
  "scope": {
    "ingestJobId": "job_02"
  },
  "providers": ["openalex", "orcid", "ror", "crossref"]
}
```

## Database Design

### Jobs

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json JSONB,
  error_text TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX jobs_type_payload_hash_uidx
  ON jobs (type, payload_hash);

CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Topics And Subtopics

```sql
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discovery_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  topic_id TEXT REFERENCES topics(id),
  topic_text TEXT NOT NULL,
  provider_summary_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subtopics (
  id TEXT PRIMARY KEY,
  discovery_run_id TEXT NOT NULL REFERENCES discovery_runs(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_topic_id TEXT,
  paper_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  evidence_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subtopics_discovery_idx ON subtopics(discovery_run_id);
```

### Sources

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_source_id TEXT,
  name TEXT NOT NULL,
  source_type TEXT,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  homepage_url TEXT,
  is_oa BOOLEAN,
  is_in_doaj BOOLEAN,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sources_provider_source_uidx
  ON sources(provider, provider_source_id)
  WHERE provider_source_id IS NOT NULL;
```

### Licenses

```sql
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  policy TEXT NOT NULL,
  policy_note TEXT NOT NULL,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE license_snapshots (
  id TEXT PRIMARY KEY,
  license_id TEXT REFERENCES licenses(id),
  raw_license_text TEXT,
  raw_license_url TEXT,
  source_url TEXT,
  provider TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  reviewer_user_id TEXT,
  reviewed_at TIMESTAMPTZ
);
```

Policy enum values:

- `auto_allowed`
- `conditional_review`
- `blocked`
- `unknown_review`

### Papers

```sql
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  doi TEXT,
  openalex_id TEXT,
  crossref_id TEXT,
  title TEXT NOT NULL,
  abstract TEXT,
  publication_date DATE,
  publication_year INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  primary_topic_id TEXT REFERENCES topics(id),
  primary_subtopic_id TEXT REFERENCES subtopics(id),
  normalized_title_hash TEXT NOT NULL,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX papers_doi_uidx ON papers(lower(doi)) WHERE doi IS NOT NULL;
CREATE INDEX papers_title_hash_idx ON papers(normalized_title_hash);

CREATE TABLE paper_versions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  source_id TEXT REFERENCES sources(id),
  provider TEXT NOT NULL,
  landing_page_url TEXT,
  pdf_url TEXT,
  fulltext_url TEXT,
  storage_bucket TEXT,
  storage_key TEXT,
  content_type TEXT,
  checksum_sha256 TEXT,
  license_snapshot_id TEXT REFERENCES license_snapshots(id),
  version_type TEXT,
  download_status TEXT NOT NULL DEFAULT 'not_requested',
  retrieved_at TIMESTAMPTZ,
  raw_json JSONB
);
```

### Authors

```sql
CREATE TABLE authors (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  orcid TEXT,
  openalex_author_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX authors_orcid_uidx ON authors(orcid) WHERE orcid IS NOT NULL;

CREATE TABLE paper_authors (
  paper_id TEXT NOT NULL REFERENCES papers(id),
  author_id TEXT NOT NULL REFERENCES authors(id),
  author_order INTEGER,
  is_corresponding BOOLEAN,
  raw_author_name TEXT,
  raw_affiliation TEXT,
  PRIMARY KEY (paper_id, author_id)
);

CREATE TABLE author_affiliations (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id),
  institution_name TEXT,
  ror_id TEXT,
  country_code TEXT,
  source TEXT NOT NULL,
  confidence NUMERIC(5,4),
  provenance_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE author_contacts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id),
  contact_type TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  confidence NUMERIC(5,4),
  lawful_basis TEXT,
  can_contact BOOLEAN NOT NULL DEFAULT false,
  provenance_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Exports

```sql
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  format TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Discovery Algorithm

```text
Input: topicText, filters

1. normalize topicText
2. check whether normalized topic already exists
3. query OpenAlex /topics?search=topicText
4. query OpenAlex /works?search=topicText&group_by=topics.id
5. query OpenAlex /works?search=topicText&group_by=primary_location.source.id
6. optionally query Crossref /works for DOI/license/source confirmation
7. merge candidate topics:
   - OpenAlex topic display name
   - OpenAlex group_by count
   - source diversity count
   - sample papers
8. score candidate:
   score = relevance * 0.45
         + log(paper_count) * 0.25
         + log(source_count) * 0.20
         + provider_agreement * 0.10
9. upsert top N subtopics:
   - reuse existing subtopic if normalized name/provider topic ID already exists
   - update counts and evidence
   - insert only when no match exists
```

Implementation notes:

- Use provider cursor pagination.
- Store raw provider responses in object storage or `raw_json` for audit.
- Keep provider-specific throttling.
- Do not infer that counts are globally complete; label them as "indexed count from selected providers."

## License Normalization

Normalizer input:

- raw license URL
- raw license text/name
- provider field name
- source URL

Rules:

```text
creativecommons.org/publicdomain/zero or /public-domain/cc0 -> CC0
creativecommons.org/licenses/by/4.0 -> CC BY 4.0
creativecommons.org/licenses/by-sa/4.0 -> CC BY-SA 4.0
creativecommons.org/licenses/by-nd/4.0 -> CC BY-ND 4.0
creativecommons.org/licenses/by-nc/4.0 -> CC BY-NC 4.0
creativecommons.org/licenses/by-nc-sa/4.0 -> CC BY-NC-SA 4.0
creativecommons.org/licenses/by-nc-nd/4.0 -> CC BY-NC-ND 4.0
missing / unknown / publisher-custom -> unknown_review
all rights reserved -> blocked
```

Default policy table:

| License | Policy | Notes |
| --- | --- | --- |
| CC0 | auto_allowed | Store attribution if available, but not required by CC0. |
| CC BY | auto_allowed | Attribution required. |
| CC BY-SA | conditional_review | Share-alike obligations may affect platform policy. |
| CC BY-ND | conditional_review | Verbatim redistribution may be possible, transformations are not. |
| CC BY-NC | conditional_review | Must confirm website is non-commercial. |
| CC BY-NC-SA | conditional_review | NC and SA obligations. |
| CC BY-NC-ND | conditional_review | Most restrictive CC family; avoid auto-download. |
| Unknown/no license/all rights reserved | blocked or unknown_review | Do not rehost automatically. |

## Ingestion Algorithm

```text
Input: discoveryJobId, subtopicIds, licensePolicies, maxPapersPerSubtopic, downloadFiles

1. load selected subtopics
2. for each subtopic:
   a. query OpenAlex works by topics.id or search terms
   b. enrich DOI records through Crossref
   c. enrich OA location/license through Unpaywall
   d. optionally query DOAJ/Europe PMC/PMC by DOI/PMID/PMCID
3. normalize paper metadata
4. check existing database before insert
5. dedupe:
   a. DOI exact match
   b. OpenAlex ID exact match
   c. normalized title hash + publication year
   d. source URL exact match
   e. existing file checksum when file is downloaded
6. normalize license and create license snapshot
7. if paper already exists:
   a. do not create duplicate paper
   b. attach new source/provenance/version if new
   c. update job result as duplicate or updated
8. if policy not allowed:
   a. persist metadata if useful
   b. mark version as skipped/manual review
   c. do not download
9. if allowed and downloadFiles is true:
   a. fetch PDF/XML from provider-approved URL
   b. validate content type and file size
   c. compute SHA-256
   d. check whether checksum/source URL already exists
   e. store to object storage only when file is new
   f. persist paper_version
10. write job result summary with inserted, updated, duplicate, skipped, failed counts
```

## Author Enrichment Algorithm

```text
Input: ingestJobId or authorIds

1. load unique authors
2. merge by ORCID when present
3. query OpenAlex author by ID/name+works context
4. query ORCID public API only for public record fields
5. normalize affiliations using ROR
6. collect emails only when:
   - present in article metadata, or
   - present in public ORCID fields, or
   - provided by submission, or
   - manually approved
7. store every contact with source, source URL, confidence, and can_contact=false by default
8. never scrape LinkedIn profiles without approved API/permission
```

## Export Design

Use one workbook with multiple sheets:

- `Papers`
- `Authors`
- `Sources`
- `Licenses`
- `Skipped`
- `JobSummary`

`Papers` columns:

```text
paper_id
title
abstract
doi
publication_date
publication_year
topic
subtopic
source_name
source_type
provider
landing_page_url
pdf_source_url
storage_key
license_name
license_url
license_policy
license_decision_reason
authors
orcids
affiliations
emails
contact_provenance
ingest_status
skip_reason
```

Validation:

- Row count must match job-scoped ingested paper count.
- Skipped sheet count must match skipped records.
- Export is immutable once created.

## Frontend LLD

Admin collection routes:

```text
/admin/collection
/admin/collection/jobs/:jobId
/admin/collection/ingest/:jobId
```

Components:

```text
CollectionWizard
TopicDiscoveryStep
SubtopicSelectionTable
SubtopicDetailDrawer
LicenseSelectionStep
IngestionProgressPanel
ExportReadyPanel
JobEventTimeline
```

State:

- Use simple React state for the wizard.
- Use a typed API client for calls.
- Poll job status every 2 to 5 seconds while active.
- Stop polling on terminal states.

Selection constraints:

- default max subtopics: 6
- disable next button if no subtopics selected
- show manual-review warning if selected license policies are conditional

## Provider Rate Limits And Retries

Create provider config:

```ts
type ProviderPolicy = {
  name: string;
  baseUrl: string;
  maxConcurrent: number;
  minDelayMs: number;
  retryCount: number;
  retryBackoffMs: number;
  requiresApiKey: boolean;
};
```

Persist provider calls that fail after retries as skipped records, not necessarily failed jobs.

## Error Handling

Worker errors:

- network timeout -> retry
- provider 429 -> retry with backoff
- provider 403/terms blocked -> mark source blocked
- no license -> metadata only, manual review
- bad PDF/content type -> skip download, keep metadata
- duplicate paper/topic/source/author/file -> link provenance/version, update counts, do not create duplicate row

API errors:

- `400`: invalid request
- `401`: unauthenticated
- `403`: unauthorized role
- `404`: missing job/export/paper
- `409`: duplicate active job payload
- `422`: invalid license selection
- `500`: unexpected server error

## Testing Plan

Unit tests:

- license normalization
- DOI/title normalization
- payload hash/idempotency
- provider response mapping
- dedupe logic
- export row building

Integration tests:

- create discovery job and poll status
- persist subtopics
- ingest one mocked paper with CC BY
- skip one mocked unknown-license paper
- generate XLSX and verify row counts
- author enrichment with ORCID/ROR mocks

Security tests:

- admin job endpoints require admin/editor
- public users cannot start ingest jobs
- CSRF protection rejects missing token on admin writes
- default admin password fails production startup

## Migration From Current Repo

1. Split `server.ts` into route/service/repository modules.
2. Replace the `db.prepare` compatibility wrapper with explicit Postgres repositories.
3. Add migrations instead of schema creation at runtime.
4. Move SQLite seed scripts to Postgres or mark as local fixtures.
5. Add Redis and BullMQ config.
6. Add `jobs` and `job_events`.
7. Add discovery endpoints and worker no-op job.
8. Add subtopic discovery and UI wizard.
9. Add license normalization and preview.
10. Add metadata ingest, then controlled downloads.

## Implementation Checklist

- [ ] Postgres transaction fix.
- [ ] Production secret/default credential guard.
- [ ] Redis-backed session/rate limit or stateless session strategy.
- [ ] Job queue skeleton.
- [ ] Jobs and job events schema.
- [ ] OpenAlex client.
- [ ] Crossref client.
- [ ] Unpaywall client.
- [ ] License normalizer.
- [ ] Discovery worker.
- [ ] Subtopic admin UI.
- [ ] Ingest worker.
- [ ] Object storage abstraction.
- [ ] XLSX/CSV export.
- [ ] Author enrichment worker.
- [ ] Audit logs for license overrides and publish decisions.
