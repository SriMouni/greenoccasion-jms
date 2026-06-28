# Route And API Map

This note completes Track 0.1 from `INTERN_TASK_BREAKDOWN.md`.

## Frontend Routes

| Route | Page | Access | Main data flow |
| --- | --- | --- | --- |
| `/` | `HomePage` | Public | Shows landing/home content and paper summaries. |
| `/papers` | `ResearchPapersPage` | Public | Reads approved papers from `GET /api/papers`. Supports search/topic filters through query params. |
| `/paper/:id` | `PaperDetailPage` | Public | Reads one paper from `GET /api/paper/:id`, downloads through `/api/paper/:id/download`, and uses citation/comment endpoints. |
| `/topics` | `TopicsDirectoryPage` | Public | Shows topic directory data from the app pages/data layer. |
| `/topics/:topicId` | `TopicPage` | Public | Shows papers for a selected topic; current topic values still need the documented topic-id/topic-name normalization. |
| `/submit` | `SubmitPaperPage` | Public | Submits a pending paper with metadata and a PDF through `POST /api/submit-paper`. |
| `/authors` | `AuthorsDirectoryPage` | Public | Builds author directory from paper/author API data. |
| `/author/:authorName` | `AuthorProfilePage` | Public | Reads author details and papers from `GET /api/author/:name`. |
| `/about` | `AboutPage` | Public | Static informational page. |
| `/admin/login` | `AdminLoginPage` | Public | Starts admin/editor session through `POST /api/auth/login`. |
| `/admin` | `AdminReviewPanel` | Admin/editor only | Protected by `RequireAdminAuth`; reviews pending papers/comments through admin APIs. |
| `/admin/collection` | `AdminCollectionPage` | Admin/editor only | Protected by `RequireAdminAuth`; starts discovery jobs, polls status, displays subtopics, previews licenses, and prepares ingestion. |

## API Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Creates an auth session for admin/editor users. |
| `POST` | `/api/auth/logout` | Authenticated session | Clears the auth session. |
| `GET` | `/api/auth/me` | Authenticated session | Returns the current authenticated user. |
| `GET` | `/api/papers` | Public | Lists approved papers with aggregated `author_names`; accepts optional `search` and `topic`. |
| `GET` | `/api/paper/:id` | Public | Returns one paper detail payload with author names, file availability, and inline PDF URL when available. |
| `GET` | `/api/paper/:id/download` | Public | Streams local/stored paper PDF or redirects/proxies latest available provider PDF. |
| `POST` | `/api/paper/:id/cite` | Public | Returns citation text for the requested style. |
| `GET` | `/api/paper/:id/citation` | Public | Returns citation text for the requested style. |
| `GET` | `/api/paper/:id/comments` | Public | Lists approved comments for a paper. |
| `POST` | `/api/paper/:id/comments` | Public, rate-limited | Adds a pending paper comment. |
| `POST` | `/api/submit-paper` | Public | Creates a pending paper, author, and paper-author link from submission form data. |
| `GET` | `/api/author/:name` | Public | Returns an author profile and that author's papers. |
| `GET` | `/api/licenses` | Public | Returns canonical license policy options. |
| `POST` | `/api/licenses/preview` | Public currently; intended for admin workflow | Returns mock license distribution for selected discovery subtopics. |
| `POST` | `/api/jobs/test` | Public currently; intended for admin workflow | Enqueues a no-op BullMQ job for lifecycle testing. |
| `POST` | `/api/jobs/discover-subtopics` | Public currently; intended for admin workflow | Creates a `discover_subtopics` job and enqueues it. |
| `GET` | `/api/jobs/:id/status` | Public currently; intended for admin workflow | Returns job status, progress, latest event message, result, and error text. |
| `GET` | `/api/subtopics?jobId=...` | Public currently; intended for admin workflow | Lists subtopics saved by a discovery job. |
| `POST` | `/api/jobs/ingest-papers` | Public currently; intended for admin workflow | Creates an `ingest_papers` job for selected discovery subtopics. |
| `GET` | `/api/jobs/:id/skipped-records` | Public currently; intended for admin workflow | Lists skipped ingestion records for diagnostics. |
| `POST` | `/api/admin/cleanup` | Admin only | Deletes all papers/authors/reviews/uploads for maintenance cleanup. |
| `GET` | `/api/admin/pending` | Admin/editor only | Lists pending papers with aggregated `author_names`. |
| `POST` | `/api/admin/review` | Admin/editor only | Approves or rejects a pending paper. |
| `GET` | `/api/admin/comments/pending` | Admin/editor only | Lists pending comments for moderation. |
| `POST` | `/api/admin/comments/:id/moderate` | Admin/editor only | Approves or rejects a pending comment and records moderation metadata. |

## Required Flow Checks

- `/papers` calls `GET /api/papers`, which returns only approved papers and aggregates authors as `author_names`.
- `/paper/:id` calls `GET /api/paper/:id`, which returns one paper detail record, increments views, exposes `file_exists`, and no longer returns debug-only keys.
- `/admin` is protected by `RequireAdminAuth`; it calls `GET /api/admin/pending`, where pending paper rows now expose `author_names`.
- `/api/papers` is the public list API and filters by `p.topic` when a topic query is supplied. Topic ID/display-name mismatch is documented separately as a schema normalization item.
