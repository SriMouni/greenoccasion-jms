# Open Carbon Research Library

## Admin Security Setup

Phase 1 security is implemented with session authentication and role-based authorization.

### Environment Variables

Set these values in your runtime environment before production deploy:

- ADMIN_USERNAME: bootstrap admin username (local default: admin)
- ADMIN_PASSWORD: bootstrap admin password; set this in `.env` before the first local start
- NODE_ENV: set to production to enable Secure cookie attribute

If no users exist, the server bootstraps one admin account from ADMIN_USERNAME and ADMIN_PASSWORD.

### Auth Endpoints

- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

### Role Protection

- /api/admin/pending requires admin or editor
- /api/admin/review requires admin or editor
- /api/admin/cleanup requires admin

### Frontend Admin Access

- Login page: /admin/login
- Protected admin panel: /admin

Unauthenticated users are redirected from /admin to /admin/login.

## Phase 2 Implementation Checklist (Strict)

All items below are implemented and marked complete.

1. [x] Dedicated Topics Directory
- Done criteria:
	- Public route /topics renders a unique topic-directory page.
	- Topic cards show topic descriptions and paper counts.
	- Each card links to a topic-specific listing route.

2. [x] Topic-Based Paper Navigation
- Done criteria:
	- /topics/:topicId fetches topic papers from backend by selected topic.
	- Users can navigate from topic page to individual paper detail pages.
	- Empty and loading states are visible.

3. [x] Dedicated Authors Directory
- Done criteria:
	- Public route /authors renders a unique author-directory page.
	- Author records are aggregated from approved papers.
	- Directory supports live name search and links to profile pages.

4. [x] Author Profile Integration
- Done criteria:
	- Paper listings show clickable author links.
	- Paper detail sidebar author names are clickable.
	- Author profile shows affiliation and publication list.

5. [x] Dedicated About Page
- Done criteria:
	- Public route /about renders a unique About page.
	- Page includes mission, editorial principles, review process, and publication policy.
	- No fallback duplication to Home page remains.

6. [x] Route De-Duplication
- Done criteria:
	- /topics, /authors, and /about are no longer mapped to duplicate content.
	- App router points each section to its own page component.

7. [x] UI Consistency + Aesthetic Direction
- Done criteria:
	- Existing UI structure remains consistent with current navigation model.
	- Font system uses Cormorant Garamond + Manrope (non-default aesthetic).
	- Shared visual language (glass cards, editorial typography, warm palette) is applied.

## Phase 3 Implementation Checklist (Strict)

All items below are implemented and marked complete.

1. [x] Public Comments Section on Paper Page
- Done criteria:
	- Each paper page shows approved public comments.
	- Visitors can submit new comments with name and message.
	- New comments are saved as pending (not auto-published).

2. [x] Admin Moderation Controls for Comments
- Done criteria:
	- Admin panel includes a dedicated Comments moderation tab.
	- Pending comments can be approved or rejected.
	- Moderation endpoints are role-protected (admin/editor).

3. [x] Enhanced Citation Options
- Done criteria:
	- Paper page supports APA, MLA, and BibTeX citation styles.
	- Citation text can be copied with one click.
	- Citation copy action tracks citation metric increment.

4. [x] Inline Reading Experience Maintained
- Done criteria:
	- Embedded PDF viewer remains available on paper detail page.
	- Missing PDF state is clearly communicated.

5. [x] UI Consistency + Aesthetic Direction
- Done criteria:
	- Existing page structure and navigation pattern are preserved.
	- Font and aesthetic system remain aligned with Phase 2 direction.
	- New comments/citation sections use same component language (glass cards, editorial labels, warm palette).

## Phase 3 Hardening Additions (Strict)

All items below are implemented and marked complete.

1. [x] Anti-Spam Rate Limit for Comment Submission
- Done criteria:
	- Comment submission enforces per-IP rate limit window.
	- API responds with HTTP 429 and Retry-After on limit hit.

2. [x] Profanity and Abuse Filter
- Done criteria:
	- Comment content is checked for prohibited language and abuse patterns.
	- Flagged comments are blocked from publication and stored as rejected.

3. [x] Moderation Reason Logging
- Done criteria:
	- System and admin moderation actions are written to moderation logs table.
	- Admin rejection flow captures an explicit reason.

4. [x] Comment Pagination on Paper Page
- Done criteria:
	- Approved comments endpoint supports page/limit.
	- Paper page renders Previous/Next controls and comment totals.
