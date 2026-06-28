# Repo And Transcript Architecture Review

## Executive Verdict

The current repo is a good seed for Tab 2, the public publication website. It is not yet the system described in the transcript.

What is correct:

- The app already has a React publication interface, paper listing/detail pages, topic and author directories, admin auth, review queues, comments, and citation support.
- The current architecture notes correctly identify the missing async ingestion backbone.
- The intern assignment is directionally useful as a phased plan.

What needs adjustment:

- Do not implement "scrape the complete internet" literally. It is unbounded, expensive, fragile, and high-risk legally.
- Use scholarly APIs and open-access repositories first. Scraping should be an allowlisted fallback with robots/terms/rate-limit controls.
- For this repo, Redis + BullMQ in Node is the easiest first worker stack. Celery/Python is also viable, but it adds another runtime for an intern before the MVP proves value.
- License handling must be a policy gate, not just a display field.
- Jobs should be admin-triggered on demand in Phase 1, not continuous crawlers or scheduled full-web harvests.
- Discovery and ingestion must check existing DB records before insert so overlapping topics reuse/update existing topics, subtopics, papers, authors, sources, versions, and files.
- Author enrichment should avoid LinkedIn scraping and should rely on ORCID, Crossref/OpenAlex authorship metadata, ROR affiliation matching, article metadata, and explicitly public/consented contact data.

## Current Repo Fit Against Transcript

| Transcript Area | Current Repo Status | Notes |
| --- | --- | --- |
| Tab 1: topic input, subtopic discovery, source/paper counts | Missing | No discovery endpoints, no job queue, no source aggregation. |
| Tab 1: license selection | Mostly missing | `license_url` is stored for submissions, but there is no canonical policy or filter. |
| Tab 1: download papers and export Excel metadata | Missing | Local seed scripts exist, but no job-driven download/export flow. |
| Tab 2: website with categories and papers | Partially implemented | Public topics, papers, details, authors, comments, citations exist. |
| Tab 3: author visualization/enrichment | Partial | Authors are listed/profiled, but no enrichment workflow or provenance. |
| Phase 2 email outreach | Not implemented | Good to defer until lawful-basis and opt-out rules are defined. |

## Important Repo Findings

### 1. Main data-collection feature is absent

The transcript's main workflow requires topic discovery, subtopic grouping, license filtering, downloads, structured exports, and author enrichment. Current backend endpoints are limited to public papers, paper detail/download/citation/comments, submission, admin review, auth, and author profiles. There are no `/api/jobs/*`, `/api/subtopics`, `/api/licenses`, or export endpoints.

### 2. Runtime data mismatch will block production seeding

The backend uses PostgreSQL in [src/db/schema.ts](../src/db/schema.ts), but the seed and abstract scripts use `better-sqlite3` and `data/library.db` in [scripts/seed_papers.mjs](../scripts/seed_papers.mjs). The Docker build runs `npm run data:sync`, which seeds SQLite inside the image, not the production PostgreSQL database. This means Cloud Run/Postgres may start with schema but no seeded papers unless a separate Postgres seed path exists.

Recommendation: pick one source of truth. For production, move seed/import scripts to PostgreSQL or create a formal migration/import command that writes to the runtime DB.

### 3. The transaction wrapper is not actually atomic

`db.transaction()` opens one PostgreSQL client and starts `BEGIN`, but the callback uses `db.prepare(...).run()` which obtains new clients from the pool. Those statements do not participate in the same transaction. This affects cleanup and paper submission flows.

Recommendation: replace the compatibility wrapper with a real repository layer that passes the same client through transaction-scoped operations, or adopt a query builder/ORM with transaction support.

### 4. Admin pending payload mismatch

The backend returns `author_name` from `/api/admin/pending`, while the frontend displays `paper.author_names` in [src/pages/AdminReviewPanel.tsx](../src/pages/AdminReviewPanel.tsx). Pending paper rows can show a blank author.

Recommendation: return `STRING_AGG(a.name, ', ') AS author_names` or update the UI field.

### 5. Topic ID/name mismatch

The submission form stores the topic id, for example `carbon-capture`, while listing and topic pages filter by topic display name such as `Carbon Capture`. This can make submitted papers disappear from topic filters.

Recommendation: introduce normalized `topics` table IDs and join papers to `topic_id`; display names should be presentation only.

### 6. Storage path model is inconsistent

Public download/detail uses GCS signed URLs, but some UI links point to `/uploads/${paper.file_path}` and seed scripts copy PDFs to a local `uploads` directory. In production, those local files are not the durable paper store.

Recommendation: store `paper_versions.storage_key`, `bucket`, `content_type`, `checksum`, and `license_snapshot_id`. Generate signed URLs through one download endpoint only.

### 7. In-memory sessions and rate limits are not multi-instance safe

Sessions and comment rate limits are in process memory. On Cloud Run scale-out or restart, sessions disappear and limits reset.

Recommendation: use Redis-backed sessions/rate limits or signed stateless sessions with server-side revocation for admin users.

### 8. Secrets hygiene needs attention

`.env.example` contains an actual-looking database password value. If it is real, rotate it and replace with a placeholder. The app also falls back to default admin credentials when `ADMIN_PASSWORD` is missing.

Recommendation: keep examples non-secret, require production secrets, and fail startup in production if admin credentials are defaults.

### 9. API responses leak debug data

`/api/paper/:id` returns `DEBUG_KEYS`. That should not be present in production responses.

Recommendation: remove debug-only fields or guard them behind explicit non-production mode.

### 10. Security hardening is needed before admin data collection

The app has basic cookie auth, but admin APIs are state-changing and cookie-authenticated. There is no CSRF protection, broad CORS is enabled, and bootstrap defaults exist.

Recommendation: add CSRF tokens for admin writes, restrict CORS in production, enforce secure secrets, and add audit logs for ingest/rehost decisions.

## Review Of Existing Architecture Analysis

The current [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) is mostly accurate about the major gap: Tab 1 is missing and async job orchestration is the biggest hurdle.

Adjustments:

- Replace "scrape complete internet" language with "API-first scholarly discovery plus allowlisted crawling."
- Add source policy and license compliance as a first-class architecture concern.
- Prefer BullMQ first if one intern is implementing in this Node repo. Keep Celery/Python as an option if the team expects heavy PDF/NLP/crawler work.
- Add migration strategy. The current SQLite-vs-Postgres split will cause confusion.
- Add source provenance, license snapshots, and ingest audit logs to the schema before downloading papers.

## Review Of Intern Assignment Sheet

The current [INTERN_ASSIGNMENT_SHEET.md](./INTERN_ASSIGNMENT_SHEET.md) is a good scaffold, but the first two weeks should be narrowed.

Recommended edits:

- Week 1: implement real `jobs` table, Redis, BullMQ worker, and one no-op job.
- Week 2: add provider-client framework, rate limits, retries, and source-policy config.
- Week 3: use OpenAlex `topics` and `works group_by` for subtopic counts.
- Week 4: build admin discovery UI.
- Week 5: license normalization and legal review states.
- Week 6: ingest metadata only first; download PDFs only for auto-allowed licenses.
- Week 7: export XLSX/CSV.
- Week 8: author enrichment from ORCID/ROR/OpenAlex/Crossref metadata, not social scraping.

The intern can implement an MVP if scope stays API-first. They should not be assigned unrestricted crawling, legal determinations, or identity/contact scraping without senior review.

## Easier Implementation Path

### MVP 0: Stabilize Existing Repo

- Fix transaction handling.
- Fix topic id/name mismatch.
- Fix admin `author_name`/`author_names` mismatch.
- Remove debug fields.
- Move seeding/import to Postgres.
- Replace in-memory sessions/rate limits for production.

### MVP 1: Discovery Without Downloads

- Build `POST /api/jobs/discover-subtopics`.
- Query OpenAlex and Crossref.
- Persist subtopic candidates with paper counts and distinct source counts.
- Show selectable subtopics in admin UI.

### MVP 2: License-Gated Metadata Ingest

- Normalize licenses from OpenAlex/Crossref/Unpaywall/DOAJ/PMC.
- Persist metadata, authors, sources, and license snapshots.
- Export XLSX/CSV without downloading PDFs first.

### MVP 3: Controlled Paper Downloads

- Download only files with known rehosting-compatible licenses.
- Store raw file, checksum, source URL, retrieval time, license snapshot, and policy decision.
- Send unknown/restrictive licenses to manual review.

### MVP 4: Author Intelligence

- Merge authors by ORCID when available.
- Use ROR to normalize institutions.
- Store public/provided emails with provenance.
- Display enrichment confidence and source history.

## Recommended Sources And Why

- OpenAlex: best first source for broad discovery, topics, authors, sources, and open-access metadata.
- Crossref: DOI metadata, license links, ORCID/ROR fields where deposited.
- Unpaywall: OA locations, best open version, license hints.
- DOAJ: open-access journal/article metadata and journal policy context.
- Europe PMC/PMC OA: full-text and XML access where reuse is allowed.
- ORCID/ROR: author identity and affiliation normalization.

## License Policy Position

This system should not claim "no legal implications." It should classify licenses into operational policy buckets and preserve evidence for review.

Suggested buckets:

- Auto-allowed for rehosting: CC0, CC BY, and other explicitly permissive licenses after attribution requirements are captured.
- Conditional/manual review: CC BY-SA, CC BY-ND, publisher-specific OA licenses.
- Blocked unless legal approves: no license, all rights reserved, unknown license, login/paywall-only PDF, licenses that forbid redistribution.
- Commercial-context review: CC BY-NC variants, because the transcript mentions putting content on a new publication website and later email/outreach workflows.

This is product/legal policy, not legal advice. The implementation should make review decisions auditable rather than hidden in code.

## Sources Checked

- OpenAlex Topics and Works API: https://developers.openalex.org/api-reference/topics and https://developers.openalex.org/api-reference/works
- OpenAlex grouping: https://developers.openalex.org/guides/grouping
- Crossref REST API: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Unpaywall data format: https://unpaywall.org/data-format
- DOAJ terms and licensing docs: https://doaj.org/terms/ and https://doaj.org/apply/copyright-and-licensing/
- Europe PMC REST API: https://europepmc.org/RestfulWebService
- PMC OAI-PMH API: https://pmc.ncbi.nlm.nih.gov/tools/oai/
- Creative Commons CC BY and CC0 docs: https://creativecommons.org/licenses/by/4.0/ and https://creativecommons.org/public-domain/
- LinkedIn prohibited automation guidance: https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions
- ORCID API FAQ and ROR docs: https://info.orcid.org/documentation/integration-and-api-faq/ and https://ror.readme.io/docs/basics
