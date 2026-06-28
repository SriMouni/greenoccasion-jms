# Work And Progress Report

Generated on 2026-06-25.

This report compares the current repository against [`INTERN_TASK_BREAKDOWN.md`](./INTERN_TASK_BREAKDOWN.md). It separates confirmed completed work, implemented-but-needs-integration-verification work, partial work, and not-started work.

## Executive Summary

The project has moved well past starter cleanup. Tracks 0 through 5 are mostly complete: route/API documentation exists, admin review cleanup is done, job infrastructure is in place, the admin collection page exists, OpenAlex discovery works through a BullMQ worker path, subtopics are persisted, and license preview is available.

Track 6 is implemented on the backend but still needs full end-to-end verification with Postgres, Redis, live OpenAlex, and the admin UI. Track 7 has a backend download path, but storage abstraction integration and manual review workflow are incomplete. Tracks 8, 9, and most of Track 10 are still the main remaining Phase 1 work.

## Current Work Snapshot

Recent uncommitted work includes:

- Added `architecture-analysis/ROUTE_API_MAP.md` and linked it from the architecture index.
- Removed the `DEBUG_KEYS` field from the paper detail API response in `server.ts`.
- Added `ADMIN_USERNAME` and `ADMIN_PASSWORD` examples to `.env.example`.
- Migrated paper seeding and abstract extraction scripts toward PostgreSQL through `scripts/postgres_db.mjs`.
- Updated PDF parsing scripts to use the current `pdf-parse` `PDFParse` API.
- Left local SQLite sidecar files `data/library.db-shm` and `data/library.db-wal` untracked.

## Verification Completed

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `node --import tsx scripts\check_subtopic_mapper.mjs` passed and returned 3 mapped OpenAlex subtopic candidates.

Not verified in this pass:

- Full discovery job from API through Redis worker.
- Full ingest job from API through Redis worker.
- Live OpenAlex provider calls.
- GCS/S3 storage credentials and real PDF download/upload.
- Admin UI click-through for a complete discovery to ingest flow.

## Progress By Intern Task

| Task | Status | Evidence / Notes |
| --- | --- | --- |
| 0.1 Run And Map The App | Done | `ROUTE_API_MAP.md` maps public routes, admin routes, and APIs. |
| 0.2 Fix Admin Pending Author Display | Done | `/api/admin/pending` returns `author_names` with `STRING_AGG`; admin UI also falls back to `author_name`. |
| 0.3 Remove Debug Field From Paper Detail API | Done | `DEBUG_KEYS` was removed from `/api/paper/:id`. |
| 0.4 Document Topic ID/Name Mismatch | Done | The mismatch is documented in the task breakdown and route/API map. Schema normalization is still future work. |
| 1.1 Add Job Types And Status Constants | Done | `src/jobs/job.types.ts` defines shared job types and statuses. |
| 1.2 Add Jobs And Job Events Tables | Done | `src/db/schema.ts` creates `jobs` and `job_events` with status, progress, payload, result, and error fields. |
| 1.3 Build Job Repository | Done with cleanup | Repository functions exist in `src/jobs/job.repositry.ts`. Filename should be corrected to `job.repository.ts`. |
| 1.4 Add No-Op Job API | Done | `POST /api/jobs/test` creates a test job. |
| 1.5 Add BullMQ Worker Skeleton | Done | `src/worker/queue.ts` and `src/worker/worker.ts` enqueue and process jobs through Redis/BullMQ. |
| 1.6 Add Job Status Endpoint | Done | `GET /api/jobs/:id/status` returns stable status JSON and latest event message. |
| 2.1 Add Admin Collection Route | Done | `/admin/collection` is protected by `RequireAdminAuth`. |
| 2.2 Add Topic Input Form | Done | Admin collection page validates topic input and calls discovery endpoint. |
| 2.3 Add Job Polling Component | Done | `JobStatusPanel` polls every 3 seconds and shows progress, messages, and errors. |
| 3.1 Add Provider Policy Config | Done | Provider policies exist for OpenAlex and additional scholarly providers. |
| 3.2 Add Mock Provider Response Fixture | Done | OpenAlex fixtures exist under `src/worker/provider-clients/__fixtures__/`. |
| 3.3 Add OpenAlex Client | Done | Client supports topic search, grouped works, grouped sources, and works listing. |
| 4.1 Add Discovery Tables | Done | `discovery_runs` and `subtopics` are created with provider IDs, counts, confidence, and evidence JSON. |
| 4.2 Build Subtopic Mapper | Done | Mapper passed the local fixture check and returns at least 3 candidates. |
| 4.3 Implement Discovery Worker Job | Implemented, needs E2E verification | Worker reads topic payload, calls OpenAlex, maps candidates, persists run/subtopics, and completes job. |
| 4.4 Add Subtopics API | Done | `GET /api/subtopics?jobId=...` returns saved discovery subtopics. |
| 4.5 Build Subtopic Selection UI | Done | Admin UI displays subtopics, details, counts, confidence, checkboxes, and max 6 selection rule. |
| 5.1 Add License Table And Seed Data | Done | Canonical license table and seed data are created in schema initialization. |
| 5.2 Build License Normalizer | Done | `normalizeLicense` maps CC BY, missing licenses, and all-rights-reserved policies. |
| 5.3 Add License Preview API | Done | `POST /api/licenses/preview` returns a mock distribution for selected subtopics. |
| 5.4 Build License Selection UI | Done | Admin UI supports license rows, policy buckets, manual review warning, and required selection. |
| 6.1 Add Paper Source And Version Tables | Done | `sources`, `paper_versions`, and `license_snapshots` exist. |
| 6.2 Add Paper Dedupe Helper | Done | Dedupe checks DOI, OpenAlex ID, normalized title/year, and source URLs. |
| 6.3 Implement Ingest Job With Fixtures | Implemented, needs E2E verification | Ingest job supports `sourceMode: fixture`, persists papers/authors/sources/versions/licenses, and tracks counts. |
| 6.4 Connect Ingest Job To OpenAlex | Implemented, needs E2E verification | Ingest job can fetch OpenAlex works for selected subtopics. |
| 6.5 Add Skipped Records | Done | `ingest_skipped_records` table and API exist; license and provider failures create skipped records. |
| 7.1 Add Storage Abstraction | Partial | S3 abstraction exists in `src/server/storage/object-storage.ts`, but active ingestion/download logic uses GCS directly. |
| 7.2 Download Only Auto-Allowed Files | Partial | Ingest job gates downloads by license, validates PDF type/size, computes checksum, and uploads to GCS when `downloadFiles` is true. Needs UI and abstraction integration. |
| 7.3 Add Manual Review Status | Partial | Conditional/unknown/blocked licenses are skipped and recorded, but there is no full manual review queue/status flow yet. |
| 8.1 Add Export Job | Not started | Only `export_papers` job type exists. Worker does not process it. |
| 8.2 Generate XLSX | Not started | No XLSX generator or `exceljs` dependency is present. |
| 8.3 Add Export Download API | Not started | No export download endpoint exists. |
| 9.1 Add Author Enrichment Tables | Not started | No `author_affiliations`, `author_contacts`, or `author_identities` tables. |
| 9.2 ORCID/ROR Mapping With Fixtures | Partial groundwork | ORCID and ROR clients exist, but mapping fixtures and enrichment persistence are not implemented. |
| 9.3 Add Enrichment Job | Not started | `enrich_authors` is defined as a type, but the worker does not handle it. |
| 9.4 Add Author Enrichment UI Fields | Not started | Author pages do not show ORCID, affiliation provenance, enrichment status, or confidence. |
| 10.1 Job Event Timeline | Partial | Job events are stored and latest message is shown, but there is no timeline UI or full event-list endpoint. |
| 10.2 Skipped Records Table | Partial | Backend skipped-records endpoint exists, but admin UI does not display the skipped-records table. |
| 10.3 Retry Button For Safe Failures | Not started | No retry endpoint or UI button exists. |

## Additional Work Outside The Breakdown

- PostgreSQL seeding helper: `scripts/postgres_db.mjs` centralizes script database access, schema creation, transactions, and pool shutdown.
- Seed script migration: `scripts/seed_papers.mjs` now uses PostgreSQL, deterministic IDs, idempotent inserts/updates, and stable seed PDF copying.
- Abstract extraction migration: `scripts/extract_abstracts.mjs` now reads from PostgreSQL, supports optional paper/file arguments, and updates abstracts from PDFs.
- Python compatibility wrappers: `scripts/extract_abstracts.py` and `scripts/extract_single_abstract.py` now delegate to the Node script.
- Provider groundwork: client files exist for Crossref, DOAJ, Europe PMC, Unpaywall, ORCID, ROR, and Semantic Scholar, although the active pipeline still uses OpenAlex.
- Publication/admin improvements already present in the repo include admin auth, comment moderation, protected admin review UI, citation endpoints, and download handling.

## Main Gaps And Risks

- Backend job and collection APIs are public today, even though the UI route is admin-protected. Add `requireRole(['admin', 'editor'])` to collection job APIs before production use.
- Discovery repository logic is duplicated under `src/discovery` and `src/worker/discovery`; keep one implementation to avoid drift.
- `src/jobs/job.repositry.ts` is misspelled and should be renamed carefully with import updates.
- Storage is split between an unused S3 abstraction and active GCS code. Pick one abstraction and route downloads/uploads through it.
- `src/server/storage/object-storage.ts` instantiates storage at import time and requires `STORAGE_BUCKET`, which can break unrelated imports if the env var is missing.
- The repository is in a mixed database transition state: runtime code and scripts are PostgreSQL-oriented, while SQLite artifacts and dependencies still exist.
- `data/library.db-shm` and `data/library.db-wal` are untracked local database sidecar files and should normally stay out of commits.
- `.env.example` should only contain safe placeholder values. Replace any secret-looking values before sharing.

## Recommended Next Steps

1. Protect all collection/job/license/subtopic/ingest endpoints with admin/editor auth.
2. Wire the license "Continue" action to `POST /api/jobs/ingest-papers`, then reuse `JobStatusPanel` for ingestion progress.
3. Add skipped-records UI after ingestion completes.
4. Unify storage behind one object storage abstraction and update ingestion/download code to use it.
5. Run an end-to-end local demo with Postgres, Redis, worker, OpenAlex discovery, fixture ingest, and skipped-record display.
6. Implement Track 8 export job and XLSX download.
7. Add Track 9 enrichment tables/job/UI after export is working.
8. Add Track 10 diagnostics timeline and safe retry workflow.

## Phase 1 Demo Readiness

Current demo readiness:

1. Admin opens collection page: ready.
2. Admin enters `carbon emission`: ready.
3. Discovery job runs: implemented, needs environment verification.
4. Subtopics appear with counts: ready after discovery completion.
5. Admin selects 3 subtopics: ready.
6. License preview appears: ready.
7. Admin selects auto-allowed licenses: ready.
8. Ingestion job runs: backend implemented, UI not wired yet.
9. Results show ingested/skipped/manual-review counts: backend result exists, UI not wired yet.
10. Export is generated: not started.
11. Public paper listing shows approved ingested paper: backend should support this after ingest, needs E2E verification.
