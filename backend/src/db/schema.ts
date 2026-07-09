import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const poolConfig: any = {
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  host: process.env.DB_HOST || '127.0.0.1',
};

// When running on Cloud Run with Cloud SQL, the DB_HOST should be the Unix socket path
// like /cloudsql/project:region:instance
if (poolConfig.host.startsWith('/')) {
  console.log(`Connecting to Postgres via Unix socket: ${poolConfig.host}`);
} else {
  console.log(`Connecting to Postgres via TCP: ${poolConfig.host}`);
}

console.log("DB Pool Config (redacted):", {
  user: poolConfig.user,
  database: poolConfig.database,
  host: poolConfig.host,
  port: poolConfig.port,
  ssl: !!poolConfig.ssl
});

const pool = new Pool(poolConfig);

export const db = {
  prepare: (sql: string) => {
    return {
      run: async (...params: any[]) => {
        const client = await pool.connect();
        try {
          // Replace ? with $1, $2, etc. for pg
          let i = 1;
          const pgSql = sql.replace(/\?/g, () => `$${i++}`);
          return await client.query(pgSql, params);
        } finally {
          client.release();
        }
      },
      get: async (...params: any[]) => {
        const client = await pool.connect();
        try {
          let i = 1;
          const pgSql = sql.replace(/\?/g, () => `$${i++}`);
          const res = await client.query(pgSql, params);
          return res.rows[0];
        } finally {
          client.release();
        }
      },
      all: async (...params: any[]) => {
        const client = await pool.connect();
        try {
          let i = 1;
          const pgSql = sql.replace(/\?/g, () => `$${i++}`);
          const res = await client.query(pgSql, params);
          return res.rows;
        } finally {
          client.release();
        }
      }
    };
  },
  transaction: (fn: () => void | Promise<void>) => {
    return async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await fn();
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };
  },
  exec: async (sql: string) => {
    const client = await pool.connect();
    try {
      return await client.query(sql);
    } finally {
      client.release();
    }
  }
};

// Initialize schema
const initSchema = async () => {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        abstract TEXT NOT NULL,
        topic TEXT NOT NULL,
        file_path TEXT NOT NULL,
        doi TEXT,
        license_url TEXT,
        status TEXT DEFAULT 'pending', 
        downloads INTEGER DEFAULT 0,
        citations INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS authors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        institution TEXT NOT NULL,
        email TEXT NOT NULL,
        research_fields TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS paper_authors (
        paper_id TEXT,
        author_id TEXT,
        PRIMARY KEY (paper_id, author_id),
        FOREIGN KEY(paper_id) REFERENCES papers(id),
        FOREIGN KEY(author_id) REFERENCES authors(id)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        paper_id TEXT,
        reviewer_name TEXT NOT NULL,
        comment TEXT,
        recommendation TEXT NOT NULL, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(paper_id) REFERENCES papers(id)
      );

      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS paper_comments (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        commenter_name TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        moderator_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(paper_id) REFERENCES papers(id)
      );

      CREATE TABLE IF NOT EXISTS paper_comment_moderation_logs (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        actor_username TEXT,
        actor_role TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(comment_id) REFERENCES paper_comments(id),
        FOREIGN KEY(paper_id) REFERENCES papers(id)
      );
      CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json JSONB,
  error_text TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
        CREATE UNIQUE INDEX IF NOT EXISTS jobs_type_payload_hash_uidx
        ON jobs (type, payload_hash);
        CREATE TABLE IF NOT EXISTS discovery_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  topic_text TEXT NOT NULL,
  provider_summary_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discovery_runs_job_id_idx
  ON discovery_runs (job_id);

CREATE TABLE IF NOT EXISTS subtopics (
  id TEXT PRIMARY KEY,
  discovery_run_id TEXT NOT NULL REFERENCES discovery_runs(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_topic_id TEXT,
  paper_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subtopics_paper_count_nonnegative_check CHECK (paper_count >= 0),
  CONSTRAINT subtopics_source_count_nonnegative_check CHECK (source_count >= 0),
  CONSTRAINT subtopics_confidence_range_check CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS subtopics_discovery_run_idx
  ON subtopics (discovery_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS subtopics_normalized_name_uidx
  ON subtopics (normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS subtopics_provider_topic_uidx
  ON subtopics (provider, provider_topic_id)
  WHERE provider_topic_id IS NOT NULL;
       CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  policy TEXT NOT NULL,
  policy_note TEXT NOT NULL,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT licenses_policy_check CHECK (
    policy IN ('auto_allowed', 'conditional_review', 'unknown_review', 'blocked')
  )
);

INSERT INTO licenses (
  id,
  canonical_name,
  canonical_url,
  policy,
  policy_note,
  requires_manual_review
)
VALUES
  ('license_cc0', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'auto_allowed', 'Public domain dedication. Store attribution when available.', false),
  ('license_cc_by', 'CC BY', 'https://creativecommons.org/licenses/by/4.0/', 'auto_allowed', 'Attribution required.', false),
  ('license_cc_by_sa', 'CC BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/', 'conditional_review', 'Share-alike obligations require review before rehosting.', true),
  ('license_cc_by_nd', 'CC BY-ND', 'https://creativecommons.org/licenses/by-nd/4.0/', 'conditional_review', 'No-derivatives terms require review before rehosting.', true),
  ('license_cc_by_nc', 'CC BY-NC', 'https://creativecommons.org/licenses/by-nc/4.0/', 'conditional_review', 'Non-commercial terms require policy review.', true),
  ('license_cc_by_nc_sa', 'CC BY-NC-SA', 'https://creativecommons.org/licenses/by-nc-sa/4.0/', 'conditional_review', 'Non-commercial and share-alike terms require review.', true),
  ('license_cc_by_nc_nd', 'CC BY-NC-ND', 'https://creativecommons.org/licenses/by-nc-nd/4.0/', 'conditional_review', 'Most restrictive Creative Commons family; do not auto-download.', true),
  ('license_unknown', 'Unknown', NULL, 'unknown_review', 'Missing or unknown license. Never auto-allow.', true),
  ('license_all_rights_reserved', 'All rights reserved', NULL, 'blocked', 'Do not download or rehost.', true)
ON CONFLICT (canonical_name) DO UPDATE
SET canonical_url = EXCLUDED.canonical_url,
    policy = EXCLUDED.policy,
    policy_note = EXCLUDED.policy_note,
    requires_manual_review = EXCLUDED.requires_manual_review;
      CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_source_id TEXT,
  name TEXT NOT NULL,
  source_type TEXT,
  issn TEXT,
  eissn TEXT,
  publisher TEXT,
  homepage_url TEXT,
  is_oa BOOLEAN,
  is_in_doaj BOOLEAN,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sources_provider_source_uidx
  ON sources (provider, provider_source_id)
  WHERE provider_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS license_snapshots (
  id TEXT PRIMARY KEY,
  license_id TEXT REFERENCES licenses(id),
  raw_license_text TEXT,
  raw_license_url TEXT,
  source_url TEXT,
  provider TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  reviewer_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT license_snapshots_decision_check CHECK (
    decision IN ('auto_allowed', 'conditional_review', 'unknown_review', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS license_snapshots_license_id_idx
  ON license_snapshots (license_id);

CREATE TABLE IF NOT EXISTS paper_versions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id),
  source_id TEXT REFERENCES sources(id),
  provider TEXT NOT NULL,
  landing_page_url TEXT,
  pdf_url TEXT,
  fulltext_url TEXT,
  storage_bucket TEXT,
  storage_key TEXT,
  content_type TEXT,
  checksum_sha256 TEXT,
  license_snapshot_id TEXT REFERENCES license_snapshots(id),
  version_type TEXT,
  download_status TEXT NOT NULL DEFAULT 'not_requested',
  retrieved_at TIMESTAMPTZ,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paper_versions_paper_id_idx
  ON paper_versions (paper_id);

CREATE INDEX IF NOT EXISTS paper_versions_source_id_idx
  ON paper_versions (source_id);

CREATE INDEX IF NOT EXISTS paper_versions_license_snapshot_id_idx
  ON paper_versions (license_snapshot_id);
    CREATE TABLE IF NOT EXISTS ingest_skipped_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  provider TEXT NOT NULL,
  provider_source_id TEXT,
  source_url TEXT,
  title TEXT,
  doi TEXT,
  reason TEXT NOT NULL,
  raw_error TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_skipped_records_job_id_idx
  ON ingest_skipped_records (job_id);

CREATE INDEX IF NOT EXISTS ingest_skipped_records_provider_idx
  ON ingest_skipped_records (provider);

CREATE INDEX IF NOT EXISTS ingest_skipped_records_doi_idx
  ON ingest_skipped_records (doi)
  WHERE doi IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_skipped_records_provider_source_idx
  ON ingest_skipped_records (provider_source_id)
  WHERE provider_source_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        meta_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE papers ADD COLUMN IF NOT EXISTS openalex_id TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS publication_year INTEGER;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS normalized_title_hash TEXT;
-- One-time AI analysis results (computed in admin/ingest, replayed to all users).
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_short_summary TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_highlights JSONB;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_field TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_tags JSONB;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_significance TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS ai_score INTEGER;
-- Content provenance: 'original' (published by us via peer review / direct upload)
-- vs 'aggregated' (ingested open-access papers from other sources). Existing rows
-- backfill to 'aggregated'. Drives the public original/indexed split + SEO directives.
ALTER TABLE papers ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'aggregated';
-- Set once the contact-harvest job has scanned this paper's PDF for author emails.
ALTER TABLE papers ADD COLUMN IF NOT EXISTS contacts_harvested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS papers_doi_lower_idx
  ON papers (lower(doi))
  WHERE doi IS NOT NULL;

CREATE INDEX IF NOT EXISTS papers_openalex_id_idx
  ON papers (openalex_id)
  WHERE openalex_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS papers_title_year_dedupe_idx
  ON papers (normalized_title_hash, publication_year)
  WHERE normalized_title_hash IS NOT NULL AND publication_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS paper_versions_landing_page_url_idx
  ON paper_versions (landing_page_url)
  WHERE landing_page_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS paper_versions_pdf_url_idx
  ON paper_versions (pdf_url)
  WHERE pdf_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS paper_versions_fulltext_url_idx
  ON paper_versions (fulltext_url)
  WHERE fulltext_url IS NOT NULL;
    ALTER TABLE authors ADD COLUMN IF NOT EXISTS openalex_author_id TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS normalized_name TEXT;

CREATE INDEX IF NOT EXISTS authors_openalex_author_id_idx
  ON authors (openalex_author_id)
  WHERE openalex_author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS authors_normalized_name_idx
  ON authors (normalized_name)
  WHERE normalized_name IS NOT NULL;

-- Author enrichment (ORCID / ROR / OpenAlex), with provenance + confidence.
ALTER TABLE authors ADD COLUMN IF NOT EXISTS orcid TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS enrichment_status TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS enrichment_confidence NUMERIC(5,4);
ALTER TABLE authors ADD COLUMN IF NOT EXISTS works_count INTEGER;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS author_identities (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id),
  scheme TEXT NOT NULL,            -- 'orcid' | 'openalex'
  identifier TEXT NOT NULL,
  source TEXT NOT NULL,            -- provider that supplied it
  source_url TEXT,
  confidence NUMERIC(5,4),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS author_identities_uidx
  ON author_identities (author_id, scheme, identifier);

CREATE TABLE IF NOT EXISTS author_affiliations (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id),
  organization_name TEXT NOT NULL,
  ror_id TEXT,
  country TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  confidence NUMERIC(5,4),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_affiliations_author_idx
  ON author_affiliations (author_id);

CREATE TABLE IF NOT EXISTS author_contacts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES authors(id),
  contact_type TEXT NOT NULL,     -- 'email'
  value TEXT NOT NULL,
  source TEXT NOT NULL,           -- only stored with provenance
  source_url TEXT,
  confidence NUMERIC(5,4),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_contacts_author_idx
  ON author_contacts (author_id);

-- Inbound "Call for Papers" leads: authors who express interest via the public popup.
-- Admin-only; drives editorial outreach. Distinct from author_contacts (which is
-- harvested corresponding-author emails from published OA papers).
CREATE TABLE IF NOT EXISTS author_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  affiliation TEXT,
  interest TEXT,                  -- research area / what they'd like to submit
  message TEXT,
  journal_id TEXT REFERENCES journals(id),
  source TEXT NOT NULL DEFAULT 'call-for-papers-popup',
  status TEXT NOT NULL DEFAULT 'new',   -- new | contacted | onboarded | archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_leads_status_idx ON author_leads (status);
-- The quick corner widget captures email + phone only; name is optional.
ALTER TABLE author_leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE author_leads ALTER COLUMN name DROP NOT NULL;

-- ── Editorial workflow: self-registered authors, submissions, peer review ──
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
-- Account approval gate: self-registered authors/reviewers start 'pending' and cannot sign
-- in until an admin approves. Default 'approved' grandfathers existing + admin-created users.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  keywords TEXT,
  authors_json JSONB,                       -- co-authors: [{name,email,affiliation}]
  author_user_id TEXT NOT NULL REFERENCES app_users(id),
  manuscript_path TEXT,                     -- uploaded file (storage key)
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted|under_review|revisions_requested|accepted|rejected|published
  decision TEXT,                            -- accept|minor|major|reject
  decision_note TEXT,
  round INTEGER NOT NULL DEFAULT 1,
  published_paper_id TEXT,                  -- papers.id once published
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_author_idx ON submissions(author_user_id);
CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status);

CREATE TABLE IF NOT EXISTS review_assignments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  reviewer_user_id TEXT NOT NULL REFERENCES app_users(id),
  round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'assigned',  -- assigned|completed|declined
  assigned_by TEXT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, reviewer_user_id, round)
);
CREATE INDEX IF NOT EXISTS review_assignments_reviewer_idx ON review_assignments(reviewer_user_id);
CREATE INDEX IF NOT EXISTS review_assignments_submission_idx ON review_assignments(submission_id);

CREATE TABLE IF NOT EXISTS submission_reviews (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES review_assignments(id),
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  reviewer_user_id TEXT NOT NULL REFERENCES app_users(id),
  recommendation TEXT NOT NULL,             -- accept|minor|major|reject
  comments_to_author TEXT,
  comments_to_editor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_reviews_submission_idx ON submission_reviews(submission_id);

-- ── Phase 2A: submission depth (article type, declarations, versions, structured authors) ──
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS article_type TEXT;          -- research|review|case_study|...
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS cover_letter TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS declarations JSONB;         -- {funding,conflicts,copyrightAgreed,license}
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Each revision (V1, V2, …): manuscript file + supplementary + response-to-reviewers.
CREATE TABLE IF NOT EXISTS submission_versions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  version INTEGER NOT NULL,
  manuscript_path TEXT,                     -- storage key of the main manuscript
  supplementary_json JSONB,                 -- [{name, key}]
  response_to_reviewers TEXT,               -- author's response letter (revisions only)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version)
);
CREATE INDEX IF NOT EXISTS submission_versions_sub_idx ON submission_versions(submission_id);

-- Structured authorship (ORCID, corresponding flag) — supersedes submissions.authors_json.
CREATE TABLE IF NOT EXISTS submission_authors (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  author_order INTEGER NOT NULL DEFAULT 0,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  affiliation TEXT,
  orcid TEXT,
  is_corresponding BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS submission_authors_sub_idx ON submission_authors(submission_id);

-- ── Phase 2B: peer-review engine (invitations, deadlines, structured rubric, blinding) ──
-- Assignment lifecycle: invited -> accepted|declined -> completed. Deadlines + token for
-- future emailed accept/decline links (2D).
ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS invite_token TEXT;

-- Structured 1-5 rubric scores on each review.
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS score_originality INTEGER;
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS score_rigor INTEGER;
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS score_significance INTEGER;
ALTER TABLE submission_reviews ADD COLUMN IF NOT EXISTS score_clarity INTEGER;

-- Journal-wide settings (singleton row id=1). Double-blind default on; ISSN/DOI land in 2C.
CREATE TABLE IF NOT EXISTS journal_settings (
  id INTEGER PRIMARY KEY,
  double_blind BOOLEAN NOT NULL DEFAULT true,
  review_due_days INTEGER NOT NULL DEFAULT 21,
  journal_name TEXT,
  journal_acronym TEXT,
  issn_print TEXT,
  issn_online TEXT,
  doi_prefix TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_settings_singleton CHECK (id = 1)
);
INSERT INTO journal_settings (id, double_blind, journal_name, journal_acronym)
  VALUES (1, true, 'Green Occasion', 'go')
  ON CONFLICT (id) DO NOTHING;

-- ── Phase 3A: multi-journal foundation (Journal → Topic → Subtopic, journal_id scoping) ──
-- Each journal is a distinct front-end site; isolation is enforced by journal_id row-scoping.
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,               -- front-end route / subdomain key
  description TEXT,
  acronym TEXT,
  issn_print TEXT,
  issn_online TEXT,
  doi_prefix TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active|draft
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Managed topic hierarchy: parent_id NULL = top-level Topic, set = Subtopic.
-- journal_id NULL = unmapped (staging pool); set = mapped to a journal.
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  journal_id TEXT REFERENCES journals(id),
  parent_id TEXT REFERENCES topics(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journal_id, parent_id, slug)
);
CREATE INDEX IF NOT EXISTS topics_journal_idx ON topics(journal_id);
CREATE INDEX IF NOT EXISTS topics_parent_idx ON topics(parent_id);

-- journal_id scoping on the content + submission tables (NULL = staging/unassigned).
ALTER TABLE papers ADD COLUMN IF NOT EXISTS journal_id TEXT REFERENCES journals(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS journal_id TEXT REFERENCES journals(id);
CREATE INDEX IF NOT EXISTS papers_journal_idx ON papers(journal_id);
CREATE INDEX IF NOT EXISTS submissions_journal_idx ON submissions(journal_id);

-- Default journal so the existing public site keeps serving. One-time backfill guarded by a flag.
-- Per-journal public-site theme (palette key applied by the front-end).
ALTER TABLE journals ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default';
ALTER TABLE journal_settings ADD COLUMN IF NOT EXISTS default_journal_backfilled BOOLEAN NOT NULL DEFAULT false;
INSERT INTO journals (id, name, slug, description, acronym, status)
  VALUES ('jrnl_green_occasion', 'Climate Change and Sustainable Future Journal', 'green-occasion',
          'Peer-reviewed, open-access research on climate change and a sustainable future.', 'go', 'active')
  ON CONFLICT (slug) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM journal_settings WHERE id = 1 AND default_journal_backfilled) THEN
    UPDATE papers SET journal_id = 'jrnl_green_occasion' WHERE journal_id IS NULL;
    UPDATE submissions SET journal_id = 'jrnl_green_occasion' WHERE journal_id IS NULL;
    UPDATE journal_settings SET default_journal_backfilled = true WHERE id = 1;
  END IF;
END $$;
    `);
    console.log("PostgreSQL database initialized with schema.");
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      try {
        const sockets = fs.readdirSync('/cloudsql');
        console.error("Cloud SQL Directory Contents:", sockets);
      } catch (fsErr) {
        console.error("Failed to read /cloudsql directory:", fsErr);
      }
    }
    console.error("Error initializing PostgreSQL schema:", err);
  }
};

export const schemaReady = initSchema();
