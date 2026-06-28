# UI/UX AI Prompts For Green Occasion JMS

Use these prompts with Stitch AI and Readdy AI to generate UI/UX concepts and React/Tailwind screens for the platform.

## Prompt For Stitch AI

```text
Design a complete UI/UX for "Green Occasion JMS", a license-aware research collection and journal management platform for sustainability research.

Product positioning:
A Journal Management System where admins collect research metadata through API-first scholarly discovery, verify licenses, approve content, and publish approved papers to a public journal website.

Important architecture behavior:
- Admin jobs are on-demand only, not continuous crawlers.
- Admin enters a topic and clicks Discover.
- System fetches topics/subtopics/papers from scholarly APIs like OpenAlex, Crossref, Unpaywall, DOAJ, Europe PMC/PMC OA, ORCID, and ROR.
- System checks duplicates in existing DB before saving.
- PDFs are downloaded/rehosted only if license policy allows it.
- End users see only approved records from app DB/storage, not live API calls.

Design direction:
Create a premium academic + operational interface. Public pages should feel like a modern sustainability journal: editorial, trustworthy, refined. Admin pages should feel dense, clear, and work-focused: dashboard/table/wizard style, not marketing style.

Visual style:
- Use an editorial sustainability aesthetic.
- Avoid generic SaaS purple gradients.
- Prefer warm off-white, deep charcoal, moss/olive green, muted blue-gray, and amber warning accents.
- Typography: elegant serif for public headings, clean sans-serif for UI/table/admin text.
- Use professional icons, not emojis.
- Use clear badges for statuses: queued, running, completed, failed, duplicate, skipped, manual review, approved, blocked.
- Responsive layouts for desktop, tablet, and mobile.
- Accessibility: strong contrast, visible focus states, 44px touch targets, clear form labels.

Create screens for:

1. Public Website
- Home page: journal identity, featured topics, latest approved papers, mission.
- Topics directory: topic cards with paper counts.
- Topic/subtopic detail page: subtopics, papers, filters.
- Research papers listing: search, filters by topic/subtopic/source/license/year.
- Paper detail: title, authors, abstract, DOI, source, license, citation buttons, PDF/full-text link only when allowed.
- Authors directory: searchable authors with publication count and affiliations.
- Author profile: ORCID, affiliations, papers, provenance indicators.
- About page: mission, editorial principles, license policy.
- Submit paper page: optional paper submission form.

2. Admin Collection
- Admin login.
- Admin dashboard overview.
- Collection wizard step 1: topic input and Discover button.
- Job progress panel: queued/running/completed/failed with event timeline.
- Subtopic results table: checkbox selection, paper count, source count, confidence, details drawer.
- License preview page: license families, counts, policy buckets, allowed/manual/blocked.
- Ingestion progress page: discovered, inserted, updated, duplicate, downloaded, skipped, failed, manual review.
- Skipped/manual-review table: reason, DOI/title, source, suggested action.
- Export page: generate/download XLSX/CSV.

3. Editorial/Admin Review
- Pending papers review queue.
- License manual review queue.
- Comments moderation queue.
- Job history and diagnostics page.

4. Author Intelligence
- Admin author enrichment page.
- Unique authors list.
- Enrichment status, ORCID/ROR, confidence, provenance.
- "Do not contact yet" / outreach later placeholder.

Required UX details:
- Make it obvious that jobs run only when admin clicks an action.
- Show duplicate detection clearly: inserted, updated, duplicate counts.
- Show license safety clearly: auto allowed, conditional review, blocked, unknown review.
- Public site should never show unapproved records.
- Admin should always see skipped reasons.

Output:
Create a complete multi-page UI design system with components, layouts, navigation, tables, forms, modals/drawers, status badges, empty states, loading states, and responsive behavior.
```

## Prompt For Readdy AI

```text
Build a React + Tailwind UI for "Green Occasion JMS", a license-aware research collection and journal management system for sustainability papers.

Tech/style requirements:
- React + TypeScript + Tailwind.
- Use lucide-react icons.
- No emoji icons.
- Use clean reusable components.
- Use mock data and mock API functions only; do not build backend.
- Design must be responsive.
- Public pages should feel editorial and academic.
- Admin pages should be dense, practical, and dashboard-like.

Core product flow:
Admin Collection is the main feature.
Jobs are on-demand only:
- Admin enters topic and clicks Discover.
- Discovery job fetches related topics/subtopics from scholarly APIs.
- System checks DB duplicates before saving.
- Admin selects subtopics.
- Admin previews licenses.
- Admin starts ingestion.
- Ingestion checks existing papers/sources/authors/files before insert.
- PDFs are downloaded only when license policy allows.
- Admin/editor approves records.
- Public users see approved records from DB/storage only.

Create these routes/pages:

Public:
- `/` Home
- `/topics` Topics directory
- `/topics/:topicId` Topic/subtopic detail
- `/papers` Paper listing with search and filters
- `/paper/:id` Paper detail
- `/authors` Authors directory
- `/author/:id` Author profile
- `/about` About/license policy
- `/submit` Submit paper form

Admin:
- `/admin/login`
- `/admin` Admin dashboard
- `/admin/collection` Collection wizard
- `/admin/jobs/:jobId` Job detail/timeline
- `/admin/review` Paper review queue
- `/admin/licenses` Manual license review queue
- `/admin/comments` Comment moderation
- `/admin/authors` Author intelligence/enrichment
- `/admin/exports` Export history

Admin collection wizard screens:
1. Topic Input
- Text input for topic.
- Discover button.
- Explain: "Jobs run only when started by admin."

2. Job Progress
- Status card: queued/running/completed/failed.
- Progress bar.
- Event timeline.

3. Subtopic Selection
- Table columns: select, subtopic, paper count, source count, confidence, duplicate status, details.
- Details drawer with sample papers and sources.
- Max 6 selected.

4. License Preview
- Table columns: license, paper count, policy bucket, manual review, reason.
- Policy badges: auto_allowed, conditional_review, unknown_review, blocked.
- Continue only when valid license policy selected.

5. Ingestion Progress
- Summary cards: discovered, inserted, updated, duplicates, downloaded, skipped, failed, manual review.
- Table for skipped/manual review records with reason.

6. Export
- Generate XLSX/CSV button.
- Export history table.

Important UI states:
- Empty states.
- Loading states.
- Error states.
- Duplicate detected state.
- License blocked warning.
- Manual review required state.
- Success state after export.

Design system:
- Palette: off-white background, deep charcoal text, moss/olive primary, muted blue-gray secondary, amber warning, red danger, green success.
- Typography: elegant serif for public headings, clean sans-serif for UI.
- Components: buttons, badges, tabs, cards, tables, drawers, modals, progress bars, timeline, filters, search input, pagination.
- Public site can use more editorial spacing.
- Admin pages should use compact tables and clear status labels.

Acceptance:
- The UI should make clear that Admin Collection comes first.
- Public pages should show only approved records.
- Duplicate checking should be visible in admin ingestion results.
- License policy should be visible before any download/rehost action.
- No continuous crawler UI. No "auto scrape all internet" language.
```
