# Green Occasion JMS - Complete Architecture Analysis
*Mapping Requirements -> Design -> Current State*

> 2026-05-29 update: detailed repo review, functionality, HLD, and LLD documents are available in this folder. Start with [`FUNCTIONALITY_DOCUMENT.md`](./FUNCTIONALITY_DOCUMENT.md), then use [`HLD.md`](./HLD.md) and [`LLD.md`](./LLD.md) for implementation guidance. The key revision is to use API-first scholarly discovery plus license-gated ingestion, not unrestricted whole-internet scraping.

---

## Executive Summary

Your 3-tab Phase 1 requirement is still the right direction, and the architecture pattern is viable at scale.

**Current State (repo today):**
- **Tab 2 (Publication Website):** implemented and live in code.
- **Tab 3 (Author Intelligence):** partially implemented (author directory/profile visualization exists).
- **Tab 1 (Admin Collection Pipeline):** not implemented yet (main gap).

**Designed State (target):** multi-tab system with async discovery/ingestion workers (Tabs 1, 2, 3).

**Biggest Technical Hurdle:** standing up the async discovery/ingestion backbone (Redis + BullMQ worker queue + job orchestration), not frontend state management.

**Recommended implementation path:** API-first scholarly discovery, not broad "scrape the complete internet" crawling. Start with OpenAlex, Crossref, Unpaywall, DOAJ, Europe PMC/PMC Open Access, ORCID, and ROR. Add allowlisted crawling only when an API is unavailable and source terms, robots rules, rate limits, and license policy allow it. Use Redis + BullMQ first because this repo is already Node/TypeScript; Celery/Python remains a later option for heavier crawling, PDF processing, or NLP workloads.

**Job trigger model:** Phase 1 jobs are admin-triggered on demand, not continuous. Discovery runs when an admin wants to add or refresh a topic. Ingestion runs after the admin selects subtopics and license policies. Every job must check existing DB records and reuse/update existing topics, subtopics, papers, authors, sources, versions, and files instead of creating duplicates.

**Phase 1 planning baseline for this document:** 8 weeks, 1 intern, MVP-complete scope.

---

## Part 1: Requirements Traceability Matrix

| Requirement | Current Status | HLD/LLD Coverage | Implementation Effort |
|-------------|----------------|------------------|----------------------|
| **Tab 1: Admin Collection Pipeline** |  |  |  |
| Input topic name | Missing | Designed (`POST /api/jobs/discover-subtopics`) | Medium |
| Discover related subtopics (not exact-match only) | Missing | Designed (`GET /api/subtopics`) | High |
| Show subtopic stats (paper count + source count) | Missing | Designed | High |
| License type filtering with allow/restrict guidance | Missing | Designed (`GET /api/licenses`) | Medium |
| License-gated paper metadata ingest and eligible downloads | Missing | Designed (`POST /api/jobs/ingest-papers`) | High |
| Export structured metadata (xlsx/csv) | Missing | Designed (`GET /api/exports/:jobId.xlsx`) | Medium |
| **Tab 2: Publication Website** |  |  |  |
| Dedicated public routes (`/topics`, `/authors`, `/about`) | Implemented | Covered | 0 |
| Papers listing + topic/search filtering | Implemented | Covered | 0 |
| Paper detail with DOI/license display | Implemented | Covered | 0 |
| Citation styles + citation tracking | Implemented | Covered | 0 |
| Public comments + moderation flow | Implemented | Covered | 0 |
| Admin authentication + role-based access | Implemented | Covered | 0 |
| Admin review queue + approve/reject | Implemented | Covered | 0 |
| **Tab 3: Author Intelligence** |  |  |  |
| Show unique authors list | Partial (computed from approved papers on frontend) | Baseline only | Low |
| Show author profile and works | Implemented | Covered | 0 |
| Enrich authors from scholarly/public metadata | Missing | Designed (`POST /api/jobs/enrich-authors`) | High |

---

## Part 2: Schema Evolution

### Current Schema (from codebase)
```
papers:
  id, title, abstract, topic, file_path, doi, license_url,
  status, downloads, citations, views, created_at, updated_at

authors:
  id, name, institution, email, research_fields, created_at

paper_authors:
  paper_id, author_id

reviews:
  id, paper_id, reviewer_name, comment, recommendation, created_at

app_users:
  id, username, password_hash, password_salt, role, created_at

paper_comments:
  id, paper_id, commenter_name, body, status, moderator_note, created_at, updated_at

paper_comment_moderation_logs:
  id, comment_id, paper_id, action, reason, actor_username, actor_role, created_at
```

### Proposed Schema (Phase 1 target additions)
```
topics:
  id, name, created_at

subtopics:
  id, topic_id, name, paper_count, source_count, created_at

licenses:
  id, canonical_name, policy, policy_note, requires_manual_review

jobs:
  id, type, status, progress, payload_json, result_json, error_text, created_at, updated_at

job_events:
  id, job_id, level, message, meta_json, created_at

paper_sources:
  id, paper_id, provider, source_url, source_name, discovered_at

author_enrichment:
  id, author_id, contact_type, contact_value, affiliation, confidence, provenance_json, updated_at
```

**Important runtime note:** the application runtime uses PostgreSQL, while data seeding/abstract scripts currently use SQLite (`data/library.db`). Migration work should align scripts with PostgreSQL or make the dual-path explicit.

---

## Part 3: Data Gap Analysis (`papers/index.json`)

**Current Papers Snapshot:** 16 entries.

Representative entry shape:
```json
{
  "title": "Climatic benefits of black carbon emission reduction...",
  "doi": "10.1186/s40984-015-0013-8",
  "licenseUrl": "http://creativecommons.org/licenses/by/4.0",
  "pdfPath": "data\\cc-papers\\climatic-benefits-of-black-carbon...",
  "published": "2015-8-21",
  "authors": ["Ashish Sharma", "Chul E. Chung"],
  "authorEmails": [],
  "reviewerEmails": []
}
```

**What is still missing for your requirement:**
1. Subtopic assignment and hierarchy (topic -> subtopic).
2. Source provenance (provider/journal/site URL, discovery timestamp).
3. Reliable author contact enrichment (email, ORCID, affiliation, public profile links) with confidence/provenance.
4. Canonical license classification (allow/restrict/manual review).
5. Dedupe metadata (`doi` + normalized-title hash + source fingerprint).

### Known Baseline Gaps To Fix Early
1. Topic value mismatch: submit flow sends topic id while filtering expects topic name.
2. Admin pending payload mismatch: backend returns `author_name`, panel reads `author_names`.
3. Script/runtime mismatch: SQLite scripts vs PostgreSQL runtime schema.

---

## Part 4: Architecture Components - Implementation Roadmap

### Phase 0: Foundation (Weeks 1-2)
Set up async infrastructure before discovery, ingestion, and controlled download logic.

#### A. Message Broker
- Redis for queueing long-running jobs.
- Job status stored in PostgreSQL (`jobs` + `job_events`).

#### B. Worker Environment
Recommended first worker service for this repo: Node/TypeScript with BullMQ.
```
src/worker/
  queue.ts
  worker.ts
  provider-clients/
    openalex.client.ts
    crossref.client.ts
    unpaywall.client.ts
    doaj.client.ts
    europepmc.client.ts
    orcid.client.ts
    ror.client.ts
  jobs/
    discover-subtopics.job.ts
    ingest-papers.job.ts
    enrich-authors.job.ts
    export-papers.job.ts
```

#### C. API-First Data Strategy (recommended)
Use provider APIs first, allowlisted crawling second:
- OpenAlex
- Crossref
- Unpaywall
- DOAJ
- Europe PMC / PMC Open Access
- ORCID
- ROR

This reduces legal/operational risk and accelerates delivery.

Jobs should run only from admin actions or authorized admin API calls in Phase 1. Do not create a continuous crawler. Future scheduled refresh can be added later only if it uses the same duplicate checks, license gates, and provenance tracking.

### Phase 1: Tab 1 + Tab 3 enrichment pipeline

**Interfaces to implement and track in Phase 1:**
- `POST /api/jobs/discover-subtopics`
- `GET /api/jobs/:id/status`
- `GET /api/subtopics`
- `GET /api/licenses`
- `POST /api/jobs/ingest-papers`
- `GET /api/exports/:jobId.xlsx`
- `POST /api/jobs/enrich-authors`

---

## Part 5: Technical Hurdle Assessment

### Top 3 Challenges (ranked by risk)

#### 1) Async job orchestration and reliability (highest risk)
- Queue reliability, retries, timeouts, job observability, failure recovery.
- Correct progress reporting across long-running ingest/download tasks.

#### 2) Cross-source normalization and legal filtering
- Mapping different metadata and license formats into one canonical model.
- Ensuring only policy-compliant content proceeds to download/publish flows.

#### 3) Author/contact enrichment quality
- Sparse/ambiguous author metadata, confidence scoring, and provenance capture.
- Avoiding false positives when matching identities and contact points.

---

## Part 6: Recommended Implementation Sequence

Primary execution track (8 weeks):

```mermaid
Week 1:   Infra bootstrap (Redis/BullMQ/jobs skeleton)
Week 2:   Jobs table + status APIs + polling contract
Week 3:   OpenAlex discovery + subtopic extraction
Week 4:   Admin Step 1 UI (topic -> subtopic selection)
Week 5:   License normalization + API + selection step
Week 6:   Ingestion job + dedupe + persistence
Week 7:   Export (xlsx/csv) + validation
Week 8:   Author enrichment baseline + stabilization
```

### Intern Execution Plan (Weekwise + Subtasks)

#### Week 1: Environment and Queue Bootstrap
Goal: run one worker task end-to-end.

- Set up `src/worker/` workspace and queue files.
- Configure Redis + BullMQ locally.
- Add a dummy task and invoke via API trigger.
- Add minimal logging with `job_id`.

Deliverables:
- Worker starts and executes test task.

Definition of done:
- Status transitions observed: `queued -> in_progress -> completed`.

#### Week 2: Jobs Contracts and Status APIs
Goal: persist and expose job lifecycle.

- Add `jobs` (and optional `job_events`) table.
- Implement create-job and get-status endpoints.
- Wire worker progress callbacks to DB updates.
- Add basic error-state handling.

Deliverables:
- API polling contract for UI consumption.

Definition of done:
- Failed and successful jobs both represented correctly.

#### Week 3: Topic/Subtopic Discovery via OpenAlex
Goal: produce selectable subtopic candidates.

- Query OpenAlex by topic keyword.
- Expand related terms and normalize candidate subtopics.
- Check existing topics/subtopics before insert.
- Persist new or updated paper/source counts per subtopic.
- Add `GET /api/subtopics`.

Deliverables:
- Discovery output for topics like `carbon emission`.

Definition of done:
- At least 15 coherent subtopics returned for a broad query.

#### Week 4: Admin Step 1 UI
Goal: topic input -> discovery job -> subtopic selection.

- Build topic input + submit action.
- Add polling for job status.
- Render subtopic list with counts.
- Enforce max 6 selections with clear validation.

Deliverables:
- Functional Step 1 user flow.

Definition of done:
- User can submit a topic and select up to 6 subtopics.

#### Week 5: License Intelligence Layer
Goal: classify and expose license options.

- Create `licenses` table and seed canonical values.
- Implement URL/text normalization into canonical license type.
- Mark allow/restrict/manual-review policy flags.
- Expose `GET /api/licenses` and integrate UI selection step.

Deliverables:
- Policy-tagged license options visible in UI.

Definition of done:
- Unknown licenses land in manual-review category.

#### Week 6: Paper Ingestion + Dedupe Persistence
Goal: ingest metadata for selected subtopics and licenses.

- Implement `POST /api/jobs/ingest-papers`.
- Fetch metadata from APIs for selected subtopics.
- Download files only when the normalized license policy is approved for rehosting.
- Deduplicate against existing DB records by DOI, provider IDs, normalized title/year, source URL, and file checksum.
- Persist papers/authors/link tables and source provenance.

Deliverables:
- Ingestion job writes consistent data to PostgreSQL.

Definition of done:
- Re-running same payload does not create duplicates.
- Overlapping topics reuse/update existing DB records where possible.

#### Week 7: Structured Export
Goal: export downstream-ready file outputs.

- Implement export service and endpoint.
- Generate `.xlsx` with required metadata columns.
- Add optional CSV fallback.
- Add failure/skipped records section.

Deliverables:
- Downloadable export for completed jobs.

Definition of done:
- Export row counts match DB query counts for the job.

#### Week 8: Author Enrichment Baseline + Stabilization
Goal: make Tab 3 enrichment useful for Phase 1.

- Implement `POST /api/jobs/enrich-authors`.
- Add best-effort enrichment for email, affiliation, ORCID, ROR, and public scholarly profile metadata.
- Store confidence + provenance for enriched fields.
- Do not automate LinkedIn scraping; use approved APIs or manually reviewed public links only.
- Stabilize error handling and retry behavior.

Deliverables:
- Author enrichment status and fields available for visualization.

Definition of done:
- Enrichment completes with partial-failure tolerance.

### Stretch / Hardening Backlog (Weeks 9-12)

#### Week 9
- Expand provider coverage and improve normalization quality.
- Add stronger dedupe heuristics and collision audits.

#### Week 10
- Add richer admin diagnostics for failed records and retries.
- Improve export formats for downstream tooling.

#### Week 11
- Add unit/integration coverage and workflow smoke tests.
- Add structured metrics dashboards for job reliability.

#### Week 12
- Final runbook, onboarding docs, and handoff package.
- Phase 2 recommendation backlog (email outreach automation).

### Weekly Ownership Template (for Intern Tracking)

- Planned items
- Risks/blockers
- PR links
- Demo evidence (screenshots or clips)
- What moved to next week and why

### Mentor Checkpoints (Recommended)

- Tuesday review: architecture and implementation direction.
- Friday review: demo and quality gate.
- Gate rule: do not start new scope before current flow is working end to end.

---

## Part 7: Technology Stack (Final Recommendation)

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19 + lightweight state store | Existing stack; fast for multi-step flows |
| API Server | Express.js | Existing stack; straightforward job API surface |
| Message Broker | Redis | Standard queue backbone |
| Task Queue | BullMQ (Node/TypeScript) | Fits current repo stack and is enough for the first async ingestion MVP |
| Later Worker Option | Celery/Python | Keep as an option for heavier crawling, PDF processing, or NLP workloads |
| Discovery Sources | OpenAlex + Crossref + Unpaywall + DOAJ + Europe PMC/PMC OA + ORCID + ROR first | Structured metadata, license evidence, and safer delivery |
| Database | PostgreSQL | Current runtime database |
| File Storage | GCS/S3 | Durable object storage for PDFs/exports |
| Export | exceljs (or equivalent) | Fits Node/TypeScript MVP and supports reliable XLSX generation |

---

## Part 8: Critical Path to MVP (Minimum Viable Product)

To deliver a working Phase 1 MVP quickly:

1. Bootstrap queue and worker infra.
2. Implement topic discovery + subtopic selection.
3. Implement license filtering + ingestion job.
4. Implement export and baseline author enrichment.

**Initial de-prioritization if schedule pressure appears:**
- Broad full-web crawling breadth.
- Advanced PDF parsing heuristics for every source.
- Complex author identity resolution beyond baseline confidence scoring.

---

## Summary: Answer to Your Question

**Biggest technical hurdle:** async worker and job-queue architecture for discovery/ingestion/enrichment at reliable scale.

Once that backbone is stable, UI steps and reporting layers are straightforward to build incrementally.
