# Architecture Analysis Index

This folder contains the repo review and design documents created from the audio transcript requirement.

## Documents

- [REPO_REVIEW.md](./REPO_REVIEW.md) - current repo assessment, existing architecture/intern-plan review, risks, and easier implementation path.
- [FUNCTIONALITY_DOCUMENT.md](./FUNCTIONALITY_DOCUMENT.md) - intern-friendly product functionality, screens, flows, rules, and acceptance criteria.
- [INTERN_TASK_BREAKDOWN.md](./INTERN_TASK_BREAKDOWN.md) - detailed easy intern tickets with steps, files, and done checks.
- [ROUTE_API_MAP.md](./ROUTE_API_MAP.md) - Track 0 route/API map for public pages, admin-only pages, and Express endpoints.
- [WORK_PROGRESS_REPORT.md](./WORK_PROGRESS_REPORT.md) - current work completed, progress against intern tasks, verification, and remaining gaps.
- [UI_UX_AI_PROMPTS.md](./UI_UX_AI_PROMPTS.md) - prompts for Stitch AI and Readdy AI UI/UX generation.
- [HLD.md](./HLD.md) - high-level architecture for the three-tab research aggregation and publication platform.
- [LLD.md](./LLD.md) - low-level API, schema, job, and worker design for implementation.
- [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md) - updated root architecture analysis moved into this folder.
- [INTERN_ASSIGNMENT_SHEET.md](./INTERN_ASSIGNMENT_SHEET.md) - week-by-week intern execution checklist.
- [Publication Platform Improvement Report.md](./Publication%20Platform%20Improvement%20Report.md) - earlier platform review and improvement plan.

## Summary Verdict

The current repo implements the publication website and basic admin review flow, but it does not implement the transcript's main Phase 1 data-collection pipeline.

The existing `ARCHITECTURE_ANALYSIS.md` and `INTERN_ASSIGNMENT_SHEET.md` are broadly correct in direction: use async jobs, provider APIs, license normalization, exports, and author enrichment. The main adjustment is to avoid a "scrape the complete internet" build. For a scalable MVP, use scholarly APIs and open-access repositories first, then add allowlisted crawling only where an API does not exist and terms allow it.

Recommended MVP backbone:

- React admin/public UI, reusing the current app.
- Express API, split into domain modules.
- PostgreSQL as source of truth.
- Redis + BullMQ worker for the first implementation, because the repo is already Node/TypeScript.
- GCS/S3 object storage for PDFs, metadata snapshots, and exports.
- OpenAlex, Crossref, Unpaywall, DOAJ, Europe PMC/PMC Open Access as primary discovery and license sources.
- License-gated ingest with human review for unknown or restrictive licenses.
- Admin-triggered jobs only in Phase 1; no continuous crawler.
- Duplicate checks against the existing DB before saving topics, subtopics, papers, authors, sources, versions, or files.

## Official Sources Consulted

Keep these official references attached to the design so implementation choices stay grounded:

- OpenAlex API docs: https://developers.openalex.org/
- Crossref REST API docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Creative Commons license docs: https://creativecommons.org/licenses/
- PMC OAI-PMH API docs: https://pmc.ncbi.nlm.nih.gov/tools/oai/
- ORCID API docs: https://info.orcid.org/documentation/
- ROR API docs: https://ror.readme.io/docs/
- LinkedIn automation/prohibited software policy: https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions
