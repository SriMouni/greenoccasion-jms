# Functionality Document: Research Aggregation Platform

## Purpose

This document explains what the application should do from a user and intern implementation point of view. Read this before the HLD and LLD.

The product has three main tabs:

1. Admin Collection: discover topics, select subtopics, filter by license, ingest papers, and export metadata.
2. Publication Website: show collected papers publicly by topic, subtopic, paper, source, license, and author.
3. Author Intelligence: show unique authors and enrich author metadata for later outreach.

The implementation must be API-first. Do not build broad "complete internet" scraping for Phase 1. Use scholarly APIs first, then allowlisted crawling only when approved.

## Correct Data Flow

The admin collection workflow is where live provider/API fetching happens. Jobs are not continuous crawlers. They run only when an admin starts discovery, ingestion, export, or enrichment. The public website should not call OpenAlex, Crossref, Unpaywall, or other scholarly APIs in real time for every visitor page load.

Correct flow:

1. Admin enters a broad topic such as `carbon emission`.
2. Admin clicks `Discover`.
3. System starts an on-demand discovery job.
4. System fetches related topics, subtopics, paper counts, source counts, and sample metadata from scholarly APIs.
5. System checks existing PostgreSQL records before saving new topics/subtopics.
6. System saves only new or updated topics, subtopics, source evidence, and job results in PostgreSQL.
7. Admin selects the useful subtopics.
8. Admin clicks `Start Ingestion`.
9. System starts an on-demand ingestion job.
10. System checks paper metadata and license information for the selected subtopics.
11. System checks existing papers, sources, authors, and paper versions before inserting.
12. System saves new metadata or updates existing records with new provenance.
13. System downloads/rehosts PDFs only when the license policy allows it, for example CC0 or CC BY.
14. Papers with unknown, missing, restrictive, or conditional licenses are kept as metadata-only or sent to manual review.
15. Admin/editor approves records that should become public.
16. End users see approved topics, subtopics, papers, authors, source details, license details, and allowed PDF/full-text links from the app database and object storage.

In short:

```text
Admin discovery/ingestion job -> PostgreSQL + object storage -> admin approval -> public website
```

Important rule:

- Admin does not regularly save all PDFs.
- Admin does not run a continuous crawler in Phase 1.
- Jobs run only when an admin starts them from the admin UI or an authorized admin API call.
- The system saves all useful metadata it is allowed to store.
- The system saves/downloads PDF files only for papers that pass the license policy gate.
- Before saving anything, the system checks the existing database for duplicates.
- End users read from the app database/storage, not from live provider APIs.

## On-Demand Job And Duplicate Rules

Jobs are on-demand:

- Discovery runs when admin enters a topic and clicks `Discover`.
- Ingestion runs when admin selects subtopics/licenses and clicks `Start Ingestion`.
- Export runs when admin requests an export.
- Author enrichment runs when admin starts enrichment for a selected ingest job or author set.

Jobs are not continuous:

- No scheduled all-internet crawling in Phase 1.
- No background job should keep fetching new topics forever.
- A future scheduled refresh can be added later, but it must use the same dedupe, license, and provenance rules.

Duplicate checks are mandatory:

- Topic/subtopic duplicate check: normalized topic/subtopic name plus provider topic ID when available.
- Paper duplicate check: DOI, OpenAlex ID, normalized title plus year, and source URL.
- Source duplicate check: provider source ID, ISSN/eISSN, or normalized source name.
- Author duplicate check: ORCID first, then normalized name plus paper/context.
- File duplicate check: source URL and SHA-256 checksum.

If a duplicate exists:

- Do not create a second paper/topic/source/author row.
- Link the new source/provenance to the existing record.
- Update counts, timestamps, and job evidence where useful.
- Record the job result as `duplicate` or `updated`, not as a fresh insert.

## Users

### Admin

The admin runs the collection workflow. They enter a broad topic, review discovered subtopics, choose licenses, start ingestion, review results, download exports, and approve what appears on the website.

### Editor

The editor can review papers, comments, license warnings, and manual-review items. They should not change system settings unless given admin rights.

### Public Visitor

The visitor browses topics, reads paper details, downloads allowed papers, views authors, copies citations, and optionally comments.

### Intern/Developer

The intern builds the Phase 1 workflow in small pieces. Their main goal is to make one end-to-end API-first collection flow work reliably before adding breadth.

## Phase 1 Scope

### In Scope

- Admin enters a topic such as `carbon emission`.
- System discovers related subtopics such as industrial emissions, carbon accounting, renewable energy transition, waste emissions, or carbon capture.
- System shows counts for each subtopic:
  - total indexed papers from selected providers
  - distinct source/journal/repository count
  - sample papers
  - sample sources
- Admin selects up to 6 subtopics.
- System previews license types found in selected subtopics.
- Admin selects allowed license policies.
- System ingests metadata and downloads only eligible papers.
- System stores source, license, author, and provenance metadata.
- System exports XLSX/CSV.
- Public website displays approved papers.
- Author tab displays unique authors and enrichment fields with confidence/provenance.

### Out Of Scope For Phase 1

- Full-web crawling at internet scale.
- Automatic legal decisions with no manual review.
- Automated email outreach.
- LinkedIn scraping or social profile automation.
- Rehosting papers with unknown, missing, restrictive, or unreviewed licenses.
- Perfect author identity matching.

## Key Rule: API-First Collection

Use these sources first:

- OpenAlex for topics, works, authors, sources, and counts.
- Crossref for DOI metadata, license URLs, ORCID/ROR fields, and publisher metadata.
- Unpaywall for open-access locations and license hints.
- DOAJ for open-access journal/article policy context.
- Europe PMC/PMC Open Access for reusable full text where applicable.
- ORCID for public author identity data.
- ROR for institution normalization.

Allowlisted crawling is a fallback only. It must respect source policy, robots rules, rate limits, and license rules.

## Tab 1: Admin Collection

### Screen 1: Topic Input

User action:

- Admin types a topic name.
- Admin clicks `Discover`.

System behavior:

- Create a `discover_subtopics` job.
- The job runs only because admin clicked `Discover`.
- Show job status: queued, running, completed, failed.
- Keep job events visible for troubleshooting.

Validation:

- Topic is required.
- Topic should be at least 2 characters.
- Duplicate active jobs for the same payload should not be created.
- Existing topics/subtopics should be updated or reused, not duplicated.

Done when:

- Admin can enter `carbon emission`.
- A job starts.
- UI shows progress.
- Completed job leads to subtopic results.

### Screen 2: Subtopic Results

User action:

- Admin reviews subtopic candidates.
- Admin opens details for a subtopic.
- Admin selects up to 6 subtopics.
- Admin clicks `Next`.

Each subtopic row should show:

- subtopic name
- paper count
- distinct source count
- confidence score or quality label
- provider/source evidence
- details action
- checkbox

Details drawer/page should show:

- representative sources/journals/repositories
- source paper counts
- sample papers with DOI/title/year
- provider IDs if available
- raw provider names

Validation:

- At least 1 subtopic required.
- Maximum 6 selected by default.
- Disabled `Next` until valid selection.

Done when:

- At least 15 useful subtopics can appear for a broad topic.
- Admin can select a subset and continue.

### Screen 3: License Preview And Selection

User action:

- Admin reviews license families found in selected subtopics.
- Admin selects policy buckets to include.
- Admin clicks `Start Ingestion`.

Each license row should show:

- canonical license name
- example license URL
- paper count
- policy bucket
- whether manual review is required
- short policy note

Policy buckets:

- `auto_allowed`: safe to ingest and rehost under current policy, usually CC0 or CC BY.
- `conditional_review`: may be usable, but needs editor/legal review.
- `blocked`: do not download or rehost.
- `unknown_review`: metadata can be stored, but files cannot be downloaded until reviewed.

Validation:

- Unknown licenses must not be treated as allowed.
- NonCommercial licenses should not auto-download unless business/legal policy explicitly permits it.
- No license should claim "no legal implications"; use "policy decision" and "manual review" wording.

Done when:

- Admin can see which licenses are available.
- Admin can choose allowed policies.
- Ingestion starts only with a valid license policy selection.

### Screen 4: Ingestion Progress

User action:

- Admin watches ingestion status.
- Admin can inspect failed/skipped records.
- Admin can retry failed provider calls where appropriate.

System behavior:

- Create an `ingest_papers` job.
- The job runs only because admin clicked `Start Ingestion`.
- Fetch metadata from selected providers.
- Deduplicate papers.
- Check existing DB records before inserting topics, papers, authors, sources, versions, or files.
- Store paper, author, source, and license metadata.
- Download files only when license policy allows it.
- Store skipped/manual-review records with reasons.

Progress summary should show:

- discovered records
- deduplicated records
- metadata ingested
- files downloaded
- skipped records
- manual-review records
- failed records

Skipped reasons can include:

- duplicate paper
- unknown license
- blocked license
- missing PDF/full text
- provider timeout
- source disallowed
- bad content type

Done when:

- Re-running the same payload does not create duplicates.
- Running a new job for an overlapping topic links to existing DB records where possible.
- The job completes with partial-failure tolerance.
- Every skipped record has a reason.

### Screen 5: Export

User action:

- Admin clicks `Generate Export`.
- Admin downloads XLSX or CSV.

System behavior:

- Create an export job or generate export for completed ingest job.
- Store export in object storage.
- Return a download link.

Workbook sheets:

- `Papers`
- `Authors`
- `Sources`
- `Licenses`
- `Skipped`
- `JobSummary`

Required paper columns:

- paper id
- title
- abstract
- DOI
- publication date/year
- topic
- subtopic
- source name
- provider
- source URL
- PDF/source file URL
- local storage path/key
- license name
- license URL
- license policy decision
- authors
- ORCID IDs
- affiliations/ROR IDs
- emails/contact values
- contact provenance
- ingest status
- skip/failure reason

Done when:

- Export row counts match database counts for the job.
- Skipped rows are included.
- Export can be consumed by downstream tools.

## Tab 2: Publication Website

### Topic Directory

Visitors should see all public topics and subtopics with paper counts.

Requirements:

- Show topic/subtopic names.
- Show approved paper counts.
- Link to paper listing.
- Empty states should be clear.

### Paper Listing

Visitors should browse and search approved papers.

Filters:

- topic
- subtopic
- author
- source
- license
- year
- text search

Each paper card/row should show:

- title
- authors
- topic/subtopic
- year
- source
- license
- short abstract preview

### Paper Detail

Paper detail should show:

- title
- authors with profile links
- abstract
- DOI
- source/journal/repository
- publication date
- license name and URL
- license policy note
- PDF/full-text link when allowed
- citation formats
- download/citation/view metrics
- comments if the comments feature remains enabled

Publishing rule:

- Only approved papers should be public.
- Downloaded/rehosted files should appear only if license decision is allowed or manually approved.

## Tab 3: Author Intelligence

### Author Directory

Show unique authors from ingested/approved papers.

Each author row should show:

- display name
- publication count
- known affiliations
- ORCID if available
- enrichment status
- confidence/quality label

### Author Profile

Profile should show:

- author name
- ORCID/OpenAlex ID if available
- affiliations normalized with ROR where possible
- publication list
- contact values only if collected with provenance
- source/provenance for each enriched field
- confidence score for enrichment

### Author Enrichment Rules

Allowed:

- ORCID public API fields.
- OpenAlex author metadata.
- Crossref authorship metadata.
- ROR institution matching.
- Emails present in paper metadata or submitted metadata.
- Manually reviewed public profile links.

Not allowed in Phase 1:

- Automated LinkedIn scraping.
- Contact guessing.
- Email scraping from unrelated websites without policy review.
- Outreach emails.

Done when:

- Unique authors are visible.
- Enriched fields include source/provenance.
- Low-confidence matches are not silently accepted.

## Job Status Behavior

All long-running actions use jobs:

- discovery
- ingestion
- export
- author enrichment

Statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `waiting_manual_review`

Every job should have:

- job id
- type
- status
- progress percentage
- current message
- created time
- updated time
- result summary
- error text if failed

## Data Quality Rules

### Paper Deduplication

Deduplicate in this order:

1. DOI exact match.
2. OpenAlex ID exact match.
3. Normalized title hash plus publication year.
4. Source URL exact match.

### License Evidence

For every ingested paper version, store:

- raw license URL/text
- canonical license
- provider/source
- captured timestamp
- policy decision
- decision reason
- reviewer if manual

### Source Provenance

For every paper/source relationship, store:

- provider name
- source name
- source URL
- journal/repository/publisher if known
- discovered time
- raw provider ID where available

### Author Provenance

For every enriched author field, store:

- field name
- value
- source/provider
- source URL or provider ID
- confidence score
- captured time

## Acceptance Criteria For Phase 1 MVP

- Admin can run topic discovery for `carbon emission`.
- System returns useful subtopics with paper/source counts.
- Admin can select up to 6 subtopics.
- System previews license options and policy buckets.
- Admin can run ingestion for auto-allowed licenses.
- Metadata is stored in PostgreSQL.
- Eligible files are stored in object storage.
- Skipped/manual-review records are visible.
- XLSX/CSV export is generated.
- Public pages show approved ingested papers.
- Author directory shows unique authors and enrichment status.
- No unrestricted web scraping is required for MVP.

## Common Intern Pitfalls

- Do not put provider calls directly inside React components.
- Do not run long ingestion work inside an API request.
- Do not treat missing license as allowed.
- Do not create duplicate papers on repeated ingestion.
- Do not create duplicate topics/subtopics when an admin searches an overlapping topic.
- Do not store files without source URL, checksum, and license snapshot.
- Do not scrape LinkedIn or other social platforms.
- Do not assume API counts equal the whole internet.
- Do not mix topic display names and topic IDs.
- Do not hide skipped records; they are important output.

## Suggested Build Order

1. Fix current repo baseline issues listed in `REPO_REVIEW.md`.
2. Add jobs table and BullMQ worker.
3. Implement no-op job and job polling UI.
4. Implement OpenAlex discovery.
5. Render subtopic selection.
6. Implement license preview.
7. Implement metadata ingest without downloads.
8. Add license-gated downloads.
9. Add export.
10. Add author enrichment.

## Related Documents

- [Repo Review](./REPO_REVIEW.md)
- [High-Level Design](./HLD.md)
- [Low-Level Design](./LLD.md)
- [Intern Assignment Sheet](./INTERN_ASSIGNMENT_SHEET.md)
- [Detailed Intern Task Breakdown](./INTERN_TASK_BREAKDOWN.md)
- Official source links are listed in [README.md](./README.md#official-sources-consulted).
