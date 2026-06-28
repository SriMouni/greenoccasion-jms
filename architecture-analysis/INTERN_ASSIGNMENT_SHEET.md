# Intern Assignment Sheet

## Objective
Build Phase 1 of the research aggregation workflow: API-first topic discovery, subtopic selection, license filtering, paper ingestion, export, and author intelligence enrichment.

Baseline note: **Tab 2 is already live; Phase 1 work focuses on Tab 1 pipeline + Tab 3 enrichment.**

Implementation note: use scholarly/provider APIs first, not unrestricted internet scraping. Start with OpenAlex, Crossref, Unpaywall, DOAJ, Europe PMC/PMC Open Access, ORCID, and ROR. Add allowlisted crawling only when an API is unavailable and source terms, robots rules, rate limits, and license policy allow it. Use Redis + BullMQ first because this repo is already Node/TypeScript; Celery/Python can be considered later for heavier crawling, PDF processing, or NLP workloads.

Job trigger note: Phase 1 jobs are on-demand only. They run when an admin starts discovery, ingestion, export, or author enrichment. Do not build a continuous crawler or scheduled all-internet harvest. Every job must check the existing DB and reuse/update existing records instead of creating duplicate topics, subtopics, papers, authors, sources, versions, or files.

Start by reading [FUNCTIONALITY_DOCUMENT.md](./FUNCTIONALITY_DOCUMENT.md), then use [INTERN_TASK_BREAKDOWN.md](./INTERN_TASK_BREAKDOWN.md) for detailed tickets. Use the HLD/LLD for implementation details.

## Interfaces to Build in Phase 1
- `POST /api/jobs/discover-subtopics`
- `GET /api/jobs/:id/status`
- `GET /api/subtopics`
- `GET /api/licenses`
- `POST /api/jobs/ingest-papers`
- `GET /api/exports/:jobId.xlsx`
- `POST /api/jobs/enrich-authors`

## Week 1 - Infra Bootstrap (Redis/BullMQ/Jobs Skeleton)
Why this exists: discovery, ingestion, downloads, exports, and enrichment are long-running jobs. They should run in a background worker instead of inside an HTTP request. A simple DB-backed worker is acceptable for the first local proof, but Redis + BullMQ should be in place before real ingestion/download work.

Tasks:
- Create `src/worker/` workspace and queue files.
- Configure Redis and BullMQ locally.
- Add one dummy worker task and run it end to end.
- Add minimal job logging with `job_id`.

Deliverables:
- Worker process starts and executes one test task.

Definition of Done:
- Task lifecycle is visible (`queued -> in_progress -> completed`).

## Week 2 - Jobs Table and Status Endpoints
Tasks:
- Add `jobs` table for status/progress/error payloads.
- Add optional `job_events` table for progress logs.
- Build API to create job and fetch status.
- Wire worker callbacks to update status/progress.
- Add provider-client config for rate limits, retries, and API keys.

Deliverables:
- UI can poll a stable job-status contract.

Definition of Done:
- Success and failure states are persisted and returned correctly.

## Week 3 - OpenAlex Topic/Subtopic Discovery
Tasks:
- Integrate OpenAlex topic query client.
- Use OpenAlex works grouping for topic/source counts.
- Add keyword expansion for related-topic discovery.
- Extract and normalize subtopics from API results.
- Check existing topics/subtopics before insert.
- Save new or updated subtopic paper/source counts in PostgreSQL.

Deliverables:
- Discovery output for broad queries (example: carbon emission).

Definition of Done:
- At least 15 quality subtopics returned for one broad topic.
- Re-running discovery for the same topic does not create duplicate subtopic rows.

## Week 4 - Admin Step 1 UI (Topic -> Subtopic Selection)
Tasks:
- Build topic input and trigger discovery job.
- Implement polling for job progress/status.
- Render subtopics with paper count and source count.
- Add checkbox selection with max 6 validation.

Deliverables:
- Functional Step 1 flow in admin UI.

Definition of Done:
- User can submit a topic and select up to 6 subtopics.

## Week 5 - License Normalization + API + UI Step
Tasks:
- Add `licenses` table and seed canonical license families.
- Normalize raw license URL/text to canonical license name.
- Mark each license as allowed, restricted, or manual review.
- Expose `GET /api/licenses` and integrate selection UI.

Deliverables:
- License list visible with policy labels.

Definition of Done:
- Unknown license values are classified as manual review.

## Week 6 - Ingestion Job + Dedupe + Metadata Persistence
Tasks:
- Build `POST /api/jobs/ingest-papers` job trigger.
- Fetch paper metadata for selected subtopics/licenses from provider APIs first.
- Deduplicate against existing DB records with DOI, provider IDs, normalized title/year, source URL, and file checksum.
- Save papers, authors, links, and source provenance to PostgreSQL.
- Download PDFs/files only for licenses approved by the policy gate.
- Store skipped/manual-review records with reasons.

Deliverables:
- Ingestion job writes production-usable metadata.

Definition of Done:
- Re-running same payload does not create duplicate records.
- Running an overlapping topic links to existing papers/sources/authors where possible.

## Week 7 - Export (XLSX/CSV) + Validation
Tasks:
- Build export service for completed jobs.
- Add `GET /api/exports/:jobId.xlsx`.
- Include required fields: title, DOI, source, license, authors, emails, publication date, file path.
- Add failures/skipped records section and optional CSV fallback.

Deliverables:
- Downloadable structured export per completed job.

Definition of Done:
- Export row counts match job-scoped DB counts.

## Week 8 - Author Enrichment Baseline + Stabilization
Tasks:
- Build `POST /api/jobs/enrich-authors`.
- Enrich authors with best-effort email, affiliation, ORCID, ROR, and public scholarly profile metadata.
- Store confidence/provenance for enriched fields.
- Do not automate LinkedIn scraping; store LinkedIn/public profile links only when they come from approved APIs, submitted metadata, or manual review.
- Stabilize retries/error handling and partial-failure behavior.

Deliverables:
- Tab 3 can display enrichment-ready author metadata.

Definition of Done:
- Enrichment jobs complete with graceful handling of partial failures.

## Stretch Backlog (Weeks 9-12)

### Week 9
- Expand providers beyond OpenAlex where needed.
- Improve subtopic normalization and dedupe quality.

### Week 10
- Add admin diagnostics for failed records and retry controls.
- Improve export variants for downstream tools.

### Week 11
- Add unit/integration test coverage for jobs and exports.
- Add structured metrics and reliability dashboards.

### Week 12
- Finalize runbooks, onboarding guide, and handover kit.
- Create Phase 2 backlog for email outreach automation.

## Weekly Reporting
- Share one demo every Friday.
- Submit one status update with completed work, blockers, and next-week plan.
- Do not start next week's tasks until the current week's flow works end to end.
