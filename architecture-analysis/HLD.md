# High-Level Design: Research Aggregation And Publication Platform

## Scope

This HLD covers Phase 1 from the transcript:

- Admin Tab 1: enter a topic, discover related subtopics, show source/paper counts, select subtopics, select licenses, ingest/download eligible papers, and export structured metadata.
- Public Tab 2: publish collected papers by categories/topics with paper, source, license, author, and metadata details.
- Author Tab 3: visualize unique authors and enrich author metadata for later outreach.

Phase 2 email outreach is intentionally out of scope except for storing author contact provenance and consent/lawful-basis fields now.

## Architecture Decision

Do not build this as a general internet scraper.

Use an API-first scholarly discovery pipeline:

- Query OpenAlex for topic/subtopic and works discovery.
- Use Crossref for DOI metadata and license links.
- Use Unpaywall for open-access locations and license hints.
- Use DOAJ and Europe PMC/PMC Open Access where their coverage applies.
- Crawl only allowlisted sources when APIs do not provide enough data and the source terms/robots/rate limits permit it.

This is easier, cheaper, more reliable, and much safer than broad web scraping.

Phase 1 jobs are admin-triggered on demand. The system should not run a continuous crawler or scheduled all-internet harvest. Discovery runs when an admin starts it, ingestion runs when an admin selects subtopics/licenses and starts it, and public visitors read only from the app database/object storage.

Every admin-triggered job must check the existing database before saving records. Repeated or overlapping jobs should reuse/update existing topics, subtopics, papers, authors, sources, license snapshots, and files instead of creating duplicates.

## Target System Diagram

```text
                 +-----------------------------+
                 | React Web App               |
                 | - Admin data collection     |
                 | - Public publication site   |
                 | - Author intelligence       |
                 +--------------+--------------+
                                |
                                v
                 +-----------------------------+
                 | Express API / BFF           |
                 | Auth, RBAC, job APIs,       |
                 | paper APIs, exports         |
                 +------+----------+-----------+
                        |          |
              reads/writes          enqueues jobs
                        |          |
                        v          v
          +------------------+   +------------------+
          | PostgreSQL       |   | Redis / BullMQ   |
          | source of truth  |   | job queue        |
          +---------+--------+   +---------+--------+
                    |                      |
                    |                      v
                    |          +----------------------+
                    |          | Worker Service       |
                    |          | discovery, ingest,   |
                    |          | license, enrichment  |
                    |          +-----+----------+-----+
                    |                |          |
                    v                v          v
          +------------------+  +---------+  +----------------+
          | Search Index     |  | Object  |  | Provider APIs  |
          | optional v2      |  | Storage |  | OpenAlex,      |
          | Meilisearch/ES   |  | GCS/S3  |  | Crossref, etc. |
          +------------------+  +---------+  +----------------+
```

## Major Components

### 1. React App

Reuse the current Vite/React app and add a new admin collection wizard:

- Step 1: topic input and discovery job progress.
- Step 2: subtopic list with paper count and distinct source count.
- Step 3: license policy selection.
- Step 4: ingestion/download job progress and result summary.
- Step 5: export download.

Existing public pages can continue to serve Tab 2 after schema normalization.

### 2. Express API

Keep Express as the API gateway, but split `server.ts` into domain modules:

- `auth`
- `papers`
- `adminReview`
- `discovery`
- `licenses`
- `ingestion`
- `exports`
- `authors`
- `storage`

The API should create jobs, expose status, enforce role permissions, and serve normalized data to the UI.

### 3. Worker Service

Recommended first implementation: Node/TypeScript worker with BullMQ.

Why:

- Existing repo already uses Node/TypeScript.
- One intern can work in one language and one dependency graph.
- BullMQ supports retries, concurrency, progress updates, delayed jobs, and Redis-backed durability.

Celery/Python is viable later if the team needs heavy PDF processing, Scrapy-based crawling, or NLP pipelines. The API contracts should stay the same either way.

### 4. PostgreSQL

PostgreSQL should be the single source of truth:

- topics and subtopics
- papers and paper versions
- authors and affiliations
- sources and providers
- licenses and policy decisions
- jobs and job events
- exports and audit logs

The current SQLite scripts should be migrated or clearly marked as local-only fixtures.

### 5. Object Storage

Use GCS or S3 for:

- downloaded PDFs
- raw provider JSON snapshots
- extracted text/JATS XML
- generated XLSX/CSV exports

Each stored object must have a checksum, source URL, retrieval timestamp, and license snapshot reference.

### 6. Provider Clients

Primary providers:

- OpenAlex for topics, works, authors, sources, grouping, and open-access fields.
- Crossref for DOI metadata, license URLs, ORCID/ROR metadata, and publisher provenance.
- Unpaywall for OA locations and best open version.
- DOAJ for OA journal/article metadata and journal-level policy signals.
- Europe PMC/PMC Open Access for full-text XML/PDF where reuse is allowed.
- ORCID/ROR for author and institution normalization.

## Workflow: Tab 1 Admin Collection

### Step 1: Discover Subtopics

1. Admin enters topic text, for example `carbon emission`.
2. Admin clicks `Discover`.
3. API creates an on-demand `discover_subtopics` job.
4. Worker queries provider APIs.
5. Worker groups results by OpenAlex topic/source and optionally by extracted keyword clusters.
6. Worker checks existing topics/subtopics by normalized name and provider IDs.
7. Worker stores new candidates or updates existing candidates with paper count, source count, provider coverage, and confidence.
8. UI displays candidates with details.

### Step 2: Select Subtopics

Admin selects up to a configured limit, for example 5 or 6 subtopics.

Each subtopic detail page should show:

- subtopic name
- normalized topic ID
- paper count
- distinct source count
- representative journals/repositories
- sample papers
- provider/source provenance

### Step 3: License Selection

Worker derives license families from candidate papers and OA locations.

License buckets:

- Auto-allowed: CC0, CC BY, clearly permissive licenses.
- Conditional/manual review: CC BY-SA, CC BY-ND, publisher-specific OA licenses.
- Blocked/review required: unknown, all rights reserved, missing license, paywall-only, no redistribution terms.
- Commercial-context review: CC BY-NC variants.

The UI should state "policy decision" and "needs review" rather than promising no legal implications.

### Step 4: Ingest Papers

1. Admin submits selected subtopics and license policies.
2. API creates an on-demand `ingest_papers` job.
3. Worker fetches metadata.
4. Worker checks existing DB records and deduplicates by DOI, provider IDs, normalized title/year, source URL, and file checksum.
5. Worker stores new/updated authors, sources, licenses, and paper versions.
6. Worker downloads only eligible files.
7. Worker records duplicates/skipped papers with reasons.
8. UI shows totals: discovered, inserted, updated, duplicate, downloaded, skipped, failed, manual-review.

### Step 5: Export

Exports should be generated per ingest job and stored in object storage.

Required export columns:

- paper id
- title
- abstract
- DOI
- publication date/year
- subtopic/topic
- source/provider/journal/repository
- source URL
- PDF URL or storage key
- license canonical name
- license URL
- license policy decision
- authors
- ORCID IDs
- affiliations/ROR IDs
- email values with provenance
- ingestion status
- skipped/failure reason

## Workflow: Tab 2 Publication Website

The public website reads only approved, policy-compliant papers:

- topic and subtopic directory
- paper listing with filters
- paper detail with source, license, author, DOI, PDF/HTML links
- author profile pages
- citation/download metrics
- comments/moderation if retained

Do not publish a downloaded paper until:

- the license decision is auto-allowed or approved by reviewer
- the source URL and license snapshot are stored
- attribution requirements are available
- the paper version has checksum and storage metadata

## Workflow: Tab 3 Author Intelligence

Author enrichment should be conservative:

- Match authors by ORCID first.
- Normalize institutions with ROR.
- Use Crossref/OpenAlex authorships and source article metadata.
- Store public/provided emails only with provenance and confidence.
- Avoid automated LinkedIn scraping.
- Prepare later outreach by storing consent/lawful-basis fields, opt-out state, and contact source.

## Data Model Overview

Core entities:

- `topics`: user-entered themes and canonical topic records.
- `subtopics`: discovered research areas with counts and confidence.
- `sources`: journals, repositories, publisher sites, OA locations.
- `papers`: normalized scholarly works.
- `paper_versions`: source-specific file/landing-page/full-text versions.
- `licenses`: canonical license families and policy rules.
- `license_snapshots`: exact license evidence at ingest time.
- `authors`: normalized people.
- `author_identities`: ORCID/OpenAlex/Crossref identity links.
- `author_contacts`: emails/URLs with provenance and confidence.
- `jobs` and `job_events`: async job state and progress logs.
- `exports`: generated XLSX/CSV outputs.

## Scalability And Reliability

Key patterns:

- Idempotent jobs using payload hashes.
- Admin-triggered jobs only for Phase 1; no continuous crawler.
- Dedupe by DOI, OpenAlex ID, normalized title, and source URL.
- Dedupe against existing database records before every insert.
- Provider-specific rate limits and retry policies.
- Durable job state in PostgreSQL, not only Redis.
- Raw provider JSON snapshots for audit and reprocessing.
- Download checksums to avoid duplicate files.
- Dead-letter queue for repeated provider/download failures.
- Manual-review queue for licenses and low-confidence author/contact matches.

## Security And Compliance

Required before production:

- Production admin password must be required, not defaulted.
- Store sessions/rate limits in Redis or another shared store.
- Add CSRF protection for admin writes.
- Restrict CORS in production.
- Audit all ingest, download, publish, and license override decisions.
- Never store secrets in `.env.example`.
- Do not scrape platforms that prohibit automation.
- Store license evidence and review decisions with timestamps.

## Phased Delivery

### Phase 0: Repo Foundation

- Fix Postgres transaction wrapper.
- Migrate seed/import scripts to Postgres.
- Normalize topic IDs.
- Fix admin pending author field mismatch.
- Remove debug API fields.
- Add Redis-backed sessions/rate limits or equivalent.

### Phase 1: Discovery MVP

- Add jobs table and BullMQ worker.
- Implement OpenAlex topic/works discovery.
- Persist subtopics and counts.
- Build admin Step 1/2 UI.

### Phase 2: License And Metadata Ingest

- Add license normalization.
- Query Crossref/Unpaywall/DOAJ/PMC where applicable.
- Persist metadata and source provenance.
- Generate XLSX/CSV exports.

### Phase 3: Controlled Downloads

- Download only eligible open-access files.
- Store files in object storage with checksums.
- Add manual review for conditional licenses.

### Phase 4: Author Intelligence

- Add ORCID/ROR-based enrichment.
- Show contact provenance and confidence.
- Prepare outreach data model for Phase 2.

## HLD Sources

- OpenAlex Topics and Works APIs: https://developers.openalex.org/api-reference/topics and https://developers.openalex.org/api-reference/works
- OpenAlex grouping: https://developers.openalex.org/guides/grouping
- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Unpaywall data format: https://unpaywall.org/data-format
- DOAJ terms/licensing: https://doaj.org/terms/ and https://doaj.org/apply/copyright-and-licensing/
- Europe PMC and PMC Open Access APIs: https://europepmc.org/RestfulWebService and https://pmc.ncbi.nlm.nih.gov/tools/oai/
- Creative Commons license references: https://creativecommons.org/licenses/by/4.0/ and https://creativecommons.org/public-domain/
- ORCID/ROR references: https://info.orcid.org/documentation/integration-and-api-faq/ and https://ror.readme.io/docs/basics
- LinkedIn automation policy: https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions
