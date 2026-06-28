# Detailed Intern Task Breakdown

## How To Use This Document

Work top to bottom. Each task should be small enough for one pull request or one clear commit. Do not skip the "done check"; it is how the mentor knows the task is complete.

Read these first:

1. [FUNCTIONALITY_DOCUMENT.md](./FUNCTIONALITY_DOCUMENT.md)
2. [REPO_REVIEW.md](./REPO_REVIEW.md)
3. [LLD.md](./LLD.md)

## Working Rules For Interns

- Make one small change at a time.
- Do not add broad web scraping.
- Do not download or rehost papers unless license policy says it is allowed.
- Do not scrape LinkedIn or social platforms.
- Do not call provider APIs directly from React components.
- Do not run long jobs inside an HTTP request.
- Do not build a continuous crawler for Phase 1; jobs run only when an admin starts them.
- Check the existing DB before every insert.
- Add mock data or mocked provider responses before using live APIs.
- Every skipped or failed record must have a reason.
- Every provider-sourced field must keep provenance.

## Suggested PR Size

Each PR should include:

- 1 backend feature, or
- 1 frontend screen/component, or
- 1 schema/repository change, or
- 1 provider client plus tests/mocks.

Avoid a PR that changes frontend, backend, worker, schema, storage, and exports all together.

## Track 0: Starter Repo Cleanup

These are easy warm-up tasks. They help the intern understand the repo before building the pipeline.

### Task 0.1: Run And Map The App

Goal:

- Understand current routes, pages, APIs, and data flow.

Steps:

- Read `src/App.tsx`.
- Read `server.ts`.
- Make a route/API map in a short note.
- Identify which routes are public and which are admin-only.

Files to read:

- `src/App.tsx`
- `server.ts`
- `src/pages/AdminReviewPanel.tsx`
- `src/pages/ResearchPapersPage.tsx`

Done check:

- Intern can explain how `/papers`, `/paper/:id`, `/admin`, and `/api/papers` work.
- Intern has a one-page route/API note.

### Task 0.2: Fix Admin Pending Author Display

Goal:

- Pending paper author should display in admin review queue.

Problem:

- Backend returns `author_name`.
- Frontend reads `author_names`.

Steps:

- Update backend query to return `author_names`, preferably using `STRING_AGG`.
- Or update frontend to read `author_name`.
- Prefer backend consistency with existing paper list APIs.

Files to touch:

- `server.ts`
- optionally `src/pages/AdminReviewPanel.tsx`

Done check:

- Pending paper row shows author name.
- No blank author cell for normal pending submissions.

### Task 0.3: Remove Debug Field From Paper Detail API

Goal:

- Production API should not return debug-only data.

Problem:

- `/api/paper/:id` returns `DEBUG_KEYS`.

Steps:

- Remove `DEBUG_KEYS` from the response.
- If debugging is needed, guard it behind `NODE_ENV !== 'production'`.

Files to touch:

- `server.ts`

Done check:

- `/api/paper/:id` response has no `DEBUG_KEYS` in production.

### Task 0.4: Document Topic ID/Name Mismatch

Goal:

- Make the topic mismatch visible before schema work starts.

Problem:

- Submit page stores topic id such as `carbon-capture`.
- Listing pages filter by display name such as `Carbon Capture`.

Steps:

- Write a short note in a local issue/task list.
- Recommend future `topic_id` and `topic.name` separation.
- Do not refactor the whole topic model yet.

Done check:

- Mentor agrees on the topic normalization approach before schema changes.

Local issue note:

- Current mismatch: submission stores the selected topic id/slug, for example `carbon-capture`, but listing and topic pages filter papers by display name, for example `Carbon Capture`.
- Future schema direction: split topic identity from presentation by storing papers against a stable `topic_id` and rendering/filtering through a related `topics.name` display value.
- Proposed approach: create/normalize a `topics` table, migrate existing paper topic values into matching topic rows, and update paper filters to use `topic_id` while UI labels continue to use `topics.name`.
- Do not refactor the current topic model in this task. Treat this as a mentor review item before any schema migration starts.

## Track 1: Job System Foundation

## Why Redis/BullMQ Exists

The collection pipeline is not a normal quick API call. Discovery, metadata ingestion, PDF download, export generation, and author enrichment can take minutes or hours. If this work runs directly inside `POST /api/jobs/ingest-papers`, the browser may time out, the server request may die, and progress/retry handling becomes messy.

Redis + BullMQ gives us:

- a queue where long-running work can wait safely
- background workers that continue after the API response returns
- retries for provider timeouts and rate limits
- concurrency control so we do not overload APIs
- progress/status updates for the admin UI
- separation between "start job" and "do job"

Important:

- Jobs are on-demand in Phase 1.
- Admin starts discovery when they want to add or refresh a topic.
- Admin starts ingestion after selecting subtopics and license policies.
- No worker should continuously fetch topics/subtopics forever.
- Future scheduled refreshes can be added later only if they use the same duplicate/license/provenance rules.

For a very small local prototype, Redis is not mandatory. The intern can first build the same `jobs` table and run a simple in-process or Postgres-polled worker. But once ingestion starts touching many papers, downloads, retries, and provider rate limits, BullMQ is the cleaner next step.

Recommended path:

1. Build `jobs` and `job_events` tables first.
2. Prove a no-op job can move `queued -> running -> completed`.
3. Use a simple in-process worker only if local setup needs to stay minimal.
4. Add Redis + BullMQ before real ingestion/download jobs.

### Task 1.1: Add Job Types And Status Constants

Goal:

- Define shared job names and statuses before adding queue logic.

Suggested files:

- `src/server/jobs/job.types.ts`

Types to define:

```ts
export type JobType =
  | 'discover_subtopics'
  | 'ingest_papers'
  | 'export_papers'
  | 'enrich_authors';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_manual_review';
```

Done check:

- Job type/status names match the LLD.
- No string literals are duplicated in new job code.

### Task 1.2: Add Jobs And Job Events Tables

Goal:

- Persist job state in PostgreSQL.

Steps:

- Add `jobs` table.
- Add `job_events` table.
- Add indexes for job type and payload hash.
- Keep schema compatible with LLD.

Files to touch:

- Current repo likely starts in `src/db/schema.ts`.
- Later migration system can replace runtime schema creation.

Done check:

- App starts and creates tables.
- Tables include status, progress, payload JSON, result JSON, and error text.

### Task 1.3: Build Job Repository

Goal:

- Keep database queries out of route handlers.

Suggested files:

- `src/server/jobs/job.repository.ts`

Functions:

- `createJob(payload)`
- `getJobById(jobId)`
- `updateJobStatus(jobId, status, progress, message)`
- `appendJobEvent(jobId, level, message, meta)`
- `completeJob(jobId, result)`
- `failJob(jobId, errorText)`

Done check:

- Routes/workers can use repository functions instead of writing SQL directly.

### Task 1.4: Add No-Op Job API

Goal:

- Prove async job lifecycle before real provider work.

Endpoint:

- `POST /api/jobs/test`

Behavior:

- Create a job with type `discover_subtopics` or a temporary `test`.
- Add it to the queue.
- Worker waits 2 seconds.
- Worker marks job completed.

Done check:

- API returns `jobId`.
- `GET /api/jobs/:id/status` shows `queued -> running -> completed`.

### Task 1.5: Add BullMQ Worker Skeleton

Goal:

- Worker can process jobs outside API request lifecycle.
- Keep long-running discovery/ingestion/export work out of HTTP request handlers.

Suggested files:

- `src/worker/queue.ts`
- `src/worker/worker.ts`

Steps:

- Configure Redis connection from env vars.
- Create BullMQ queue.
- Create worker process.
- Process no-op job.
- Update Postgres job status from worker.

Done check:

- API server can enqueue a job.
- Worker process completes it.
- API request does not wait for job completion.

Simpler temporary alternative:

- If Redis is not available on day one, create a local `runPendingJobs()` function that picks one `queued` job from Postgres, marks it `running`, performs no-op work, and marks it `completed`.
- Keep the API contract and `jobs` table the same so it can be replaced by BullMQ later without changing the frontend.

### Task 1.6: Add Job Status Endpoint

Endpoint:

- `GET /api/jobs/:id/status`

Response fields:

- `id`
- `type`
- `status`
- `progress`
- `message`
- `result`
- `errorText`
- `createdAt`
- `updatedAt`

Done check:

- Unknown job returns 404.
- Known job returns stable JSON.

## Track 2: Admin Job UI

### Task 2.1: Add Admin Collection Route

Goal:

- Create a place for the new collection workflow.

Route:

- `/admin/collection`

Suggested files:

- `src/pages/AdminCollectionPage.tsx`
- update `src/App.tsx`
- optionally update admin navigation

Done check:

- Admin can open `/admin/collection`.
- Route is protected by existing admin auth.

### Task 2.2: Add Topic Input Form

Fields:

- topic text input
- optional year range later
- submit button

Validation:

- required
- at least 2 characters

Done check:

- Invalid topic cannot submit.
- Valid topic calls discovery endpoint.

### Task 2.3: Add Job Polling Component

Goal:

- Reuse job status display across discovery, ingestion, export, and enrichment.

Suggested component:

- `src/components/JobStatusPanel.tsx`

Behavior:

- Poll every 2 to 5 seconds.
- Stop polling when status is completed, failed, cancelled, or waiting_manual_review.
- Show progress, current message, and error.

Done check:

- No-op job progress is visible in UI.

## Track 3: Provider Client Foundation

### Task 3.1: Add Provider Policy Config

Goal:

- Keep rate limits and provider settings in one place.

Suggested file:

- `src/worker/provider-clients/provider-policy.ts`

Fields:

- provider name
- base URL
- max concurrent requests
- retry count
- retry backoff
- requires API key

Done check:

- OpenAlex config exists.
- Future providers can use same shape.

### Task 3.2: Add Mock Provider Response Fixture

Goal:

- Develop without depending on live network.

Suggested folder:

- `src/worker/provider-clients/__fixtures__/`

Fixtures:

- OpenAlex topic search response.
- OpenAlex works group-by response.
- OpenAlex sample works response.

Done check:

- Discovery mapper can be tested using local fixture JSON.

### Task 3.3: Add OpenAlex Client

Goal:

- Query OpenAlex through one reusable client.

Suggested file:

- `src/worker/provider-clients/openalex.client.ts`

Methods:

- `searchTopics(topicText)`
- `groupWorksByTopic(topicText)`
- `groupWorksBySource(topicText)`
- `listWorksForTopic(topicId, filters)`

Done check:

- Client can run against fixtures.
- Live API use is isolated to this client.

## Track 4: Subtopic Discovery

### Task 4.1: Add Discovery Tables

Tables:

- `discovery_runs`
- `subtopics`

Done check:

- Discovery run can store topic text.
- Subtopics can store name, paper count, source count, provider ID, confidence, evidence JSON.
- Schema supports checking duplicates by normalized name and provider topic ID.

### Task 4.2: Build Subtopic Mapper

Goal:

- Convert provider response into app subtopic candidates.

Input:

- OpenAlex topic results.
- OpenAlex group-by counts.

Output:

- normalized subtopic rows.

Done check:

- Given fixture input, mapper returns at least 3 sensible subtopics.
- Each subtopic has name, paper count, source count, confidence, and evidence.

### Task 4.3: Implement Discovery Worker Job

Job:

- `discover_subtopics`

Steps:

- Read topic text from job payload.
- Query OpenAlex client.
- Map candidate subtopics.
- Check existing topic/subtopic rows by normalized name/provider topic ID.
- Save discovery run.
- Insert new subtopics or update existing subtopics.
- Mark job completed with summary.

Done check:

- `carbon emission` discovery job completes.
- Subtopics are persisted.
- Job result contains count of saved subtopics.
- Re-running the job records existing/updated subtopics instead of duplicate rows.

### Task 4.4: Add Subtopics API

Endpoint:

- `GET /api/subtopics?jobId=...`

Response:

- list of subtopics for discovery job.

Done check:

- Unknown job returns empty list or 404, based on agreed API behavior.
- Completed discovery job returns saved subtopics.

### Task 4.5: Build Subtopic Selection UI

UI behavior:

- Show table of subtopics.
- Checkbox selection.
- Maximum 6 selected.
- Show paper count and source count.
- Show details button or drawer.

Done check:

- Admin can select 1 to 6 subtopics.
- Next button disabled when none selected.

## Track 5: License Preview

### Task 5.1: Add License Table And Seed Data

Canonical licenses:

- CC0
- CC BY
- CC BY-SA
- CC BY-ND
- CC BY-NC
- CC BY-NC-SA
- CC BY-NC-ND
- Unknown
- All rights reserved

Policy buckets:

- `auto_allowed`
- `conditional_review`
- `unknown_review`
- `blocked`

Done check:

- Licenses can be read from DB.
- Unknown license is not auto-allowed.

### Task 5.2: Build License Normalizer

Suggested file:

- `src/server/licenses/license-normalizer.ts`

Inputs:

- license URL
- license text/name

Outputs:

- canonical name
- policy bucket
- reason

Done check:

- `https://creativecommons.org/licenses/by/4.0/` maps to CC BY and auto_allowed.
- Missing license maps to unknown_review.
- All rights reserved maps to blocked.

### Task 5.3: Add License Preview API

Endpoint:

- `POST /api/licenses/preview`

Request:

- selected discovery job id
- selected subtopic ids

Response:

- license name
- paper count
- policy bucket
- manual review flag
- reason

Done check:

- API returns mock preview before full ingestion is ready.
- UI can render license choices.

### Task 5.4: Build License Selection UI

Behavior:

- Show license rows with policy labels.
- Allow selecting policy buckets or specific licenses.
- Warn on conditional/manual-review choices.

Done check:

- Admin cannot proceed with no license selection.
- Unknown license is shown as manual review.

## Track 6: Metadata Ingestion Without Downloads

Start with metadata only. This is easier and safer than downloading files.

### Task 6.1: Add Paper Source And Version Tables

Tables:

- `sources`
- `paper_versions`
- `license_snapshots`

Done check:

- A paper can be connected to a provider source.
- A license snapshot can be connected to a paper version.

### Task 6.2: Add Paper Dedupe Helper

Rules:

1. DOI exact match.
2. OpenAlex ID exact match.
3. Normalized title hash plus year.
4. Source URL exact match.

Done check:

- Same DOI does not create duplicate paper.
- Same title/year does not create duplicate when DOI is missing.
- Existing source URL links to the existing paper/version instead of creating a duplicate.

### Task 6.3: Implement Ingest Job With Fixtures

Job:

- `ingest_papers`

Behavior:

- Read selected subtopics.
- Use fixture works first.
- Normalize paper metadata.
- Normalize license.
- Check existing papers, authors, sources, versions, and license snapshots.
- Persist paper, authors, source, paper version, license snapshot.
- Skip blocked/unknown license downloads.

Done check:

- Job ingests fixture papers.
- Re-running same job does not create duplicates.
- Job result includes inserted, updated, duplicate, skipped counts.

### Task 6.4: Connect Ingest Job To OpenAlex

Goal:

- Replace fixture input with OpenAlex works client for selected subtopics.

Done check:

- Ingest job can fetch metadata for one selected subtopic.
- Job result includes ingested, skipped, duplicate counts.

### Task 6.5: Add Skipped Records

Goal:

- Make failures useful.

Skipped record fields:

- job id
- provider
- source URL or provider ID
- title/DOI if known
- reason
- raw error if safe

Done check:

- Unknown license creates skipped/manual-review record.
- Provider timeout creates failed/skipped record with reason.

## Track 7: Controlled Downloads

Only do this after metadata ingestion works.

### Task 7.1: Add Storage Abstraction

Suggested file:

- `src/server/storage/object-storage.ts`

Methods:

- `uploadBuffer`
- `createSignedReadUrl`
- `objectExists`

Done check:

- Storage logic is not scattered across routes/workers.

### Task 7.2: Download Only Auto-Allowed Files

Rules:

- Download only `auto_allowed` license versions.
- Validate content type.
- Enforce max file size.
- Compute SHA-256 checksum.
- Store storage key and checksum.

Done check:

- CC BY fixture downloads.
- Unknown license fixture does not download.
- Stored file has checksum.

### Task 7.3: Add Manual Review Status

Goal:

- Conditional licenses should not disappear.

Behavior:

- Save metadata.
- Mark version as `waiting_manual_review`.
- Do not download until approved.

Done check:

- Conditional license appears in manual-review count.

## Track 8: Export

### Task 8.1: Add Export Job

Job:

- `export_papers`

Input:

- ingest job id
- format: xlsx or csv

Done check:

- Export job can start for a completed ingest job.
- Export job fails gracefully if ingest job is missing.

### Task 8.2: Generate XLSX

Recommended library:

- `exceljs`

Sheets:

- Papers
- Authors
- Sources
- Licenses
- Skipped
- JobSummary

Done check:

- XLSX opens locally.
- Row counts match DB counts for the ingest job.

### Task 8.3: Add Export Download API

Endpoint options:

- `GET /api/exports/:exportId/download`
- or `GET /api/exports/:jobId.xlsx`

Done check:

- API returns file or signed URL.
- Filename includes job id and date.

## Track 9: Author Enrichment

### Task 9.1: Add Author Enrichment Tables

Tables:

- `author_affiliations`
- `author_contacts`
- optional `author_identities`

Done check:

- Author field can store source, confidence, and provenance.

### Task 9.2: ORCID/ROR Mapping With Fixtures

Goal:

- Normalize identity and affiliation without live API dependency.

Done check:

- Fixture ORCID maps to author identity.
- Fixture institution maps to ROR ID.

### Task 9.3: Add Enrichment Job

Job:

- `enrich_authors`

Behavior:

- Load unique authors from ingest job.
- Match by ORCID when available.
- Normalize affiliations.
- Store contacts only with provenance.

Done check:

- Job completes even when some authors cannot be enriched.
- Low-confidence results are marked, not silently trusted.

### Task 9.4: Add Author Enrichment UI Fields

UI locations:

- author directory
- author profile

Show:

- ORCID
- affiliation
- enrichment status
- confidence/provenance

Done check:

- Author profile shows enrichment fields when present.
- Missing enrichment shows clean empty state.

## Track 10: Admin Diagnostics

### Task 10.1: Job Event Timeline

Goal:

- Admin can understand what happened in a job.

UI should show:

- timestamp
- level
- message
- optional metadata

Done check:

- Discovery and ingestion jobs show event history.

### Task 10.2: Skipped Records Table

Columns:

- title/DOI
- provider
- reason
- source URL
- action needed

Done check:

- Admin can see why records were skipped.

### Task 10.3: Retry Button For Safe Failures

Only retry:

- timeout
- temporary provider error
- rate limit after cooldown

Do not retry:

- blocked license
- missing license
- source disallowed

Done check:

- Retry is unavailable for blocked-license records.

## Easy First Week Plan

### Day 1

- Read functionality document.
- Run app locally if environment allows.
- Make route/API map.

### Day 2

- Fix admin author display.
- Remove `DEBUG_KEYS`.

### Day 3

- Add job types/status constants.
- Add jobs table.

### Day 4

- Add job repository.
- Add no-op job API.

### Day 5

- Add BullMQ worker skeleton.
- Demo `queued -> running -> completed`.

## Mentor Checkpoints

Ask for review when:

- Job lifecycle works.
- First provider fixture maps into subtopics.
- First live OpenAlex discovery completes.
- License normalizer maps CC BY and unknown correctly.
- Metadata ingest is idempotent.
- First XLSX export opens and row counts match.

## Final Phase 1 Demo Script

The intern should be able to demo:

1. Admin opens collection page.
2. Admin enters `carbon emission`.
3. Discovery job runs.
4. Subtopics appear with counts.
5. Admin selects 3 subtopics.
6. License preview appears.
7. Admin selects auto-allowed licenses.
8. Ingestion job runs.
9. Results show ingested/skipped/manual-review counts.
10. Export is generated.
11. Public paper listing shows approved ingested paper.
12. Author page shows author metadata and provenance.
