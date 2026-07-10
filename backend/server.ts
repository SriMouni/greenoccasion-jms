import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { JOB_TYPE } from './src/jobs/job.types.ts';
import {
  createJob,
  getLatestJobEventByJobId,
  getJobById,
  listJobEventsByJobId,
  reapInterruptedJobs,
} from './src/jobs/job.repositry.ts';
import { enqueueJob } from './src/worker/queue.ts';
import { listSubtopicsByJobId } from './src/discovery/discovery.repository.ts';
import {
    getLicensePreviewSubtopics,
    listLicenses,
} from './src/licenses/licenses.repository.ts';
import { buildLicensePreview } from './src/licenses/license-preview.ts';
import { classifyField, fieldIcon, OTHER_FIELD } from './src/topics/field-classifier.ts';

// Prefer a confident AI field; treat the generic "Other" bucket as unclassified and
// fall back to the topic's own name (keeps non-green journals from collapsing to "Other").
const effectiveField = (aiField: string | null | undefined, topic: string | null | undefined): string => {
    const ai = (aiField || '').trim();
    return ai && ai !== OTHER_FIELD ? ai : classifyField(topic);
};
import { analyzeAndStorePaper } from './src/ai/analyze-paper.ts';
import { isAiEnabled } from './src/ai/gemini.ts';
import { objectStorage } from './src/server/storage/object-storage.ts';
dotenv.config();

// DB module runs schema initialization
import { db, schemaReady } from './src/db/schema.ts';
import { sendMail, notifyEmail, isMailerConfigured } from './src/mailer.ts';
import { renderBrandedEmail, textToHtml } from './src/email-templates.ts';

const JOURNAL_NAME = 'The Carbon Review';
const REGISTER_URL = (process.env.JMS_PUBLIC_URL || 'https://jms.greenoccasion.in') + '/admin/register';
const SUBMIT_URL = (process.env.PUBLIC_SITE_URL || 'https://thecarbonreview.org') + '/submit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Reflect the request origin and allow credentials. The frontend sends
// `credentials: 'include'`, and browsers reject that against a wildcard origin,
// so we echo the caller's origin instead of returning "*".
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve locally-stored PDFs (minimal stack: STORAGE_DRIVER=local writes here).
const uploadsDir = path.resolve(process.env.PDF_STORAGE_DIR || path.join(process.cwd(), 'backend', 'uploads'));
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

type AppRole = 'admin' | 'editor' | 'author' | 'reviewer';

type SessionUser = {
    userId: string;
    username: string;
    role: AppRole;
    expiresAt: number;
};

type AuthenticatedRequest = express.Request & {
    authUser?: SessionUser;
};

const SESSION_COOKIE_NAME = 'ocrl_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

// Stateless, signed session token (HMAC). An in-memory Map did not survive process
// restarts/sleeps (e.g. Render free tier), which logged everyone out on each redeploy.
// A signed cookie carries the session and is verified by signature + expiry, so
// sessions persist across restarts with no server-side state.
const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    crypto
        .createHash('sha256')
        .update(`${process.env.DB_PASSWORD || ''}:${process.env.ADMIN_PASSWORD || ''}:greenocc-session-v1`)
        .digest('hex');

const signSession = (payload: SessionUser): string => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('hex');
    return `${body}.${sig}`;
};

const verifySession = (token: string): SessionUser | null => {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionUser;
        if (!payload.expiresAt || payload.expiresAt <= Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
};

const COMMENT_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 5;
const COMMENT_RATE_LIMIT_MAX = 3;
const commentRateLimit = new Map<string, { windowStart: number; count: number }>();

const PROFANITY_PATTERNS = [
    /\bfuck\b/i,
    /\bshit\b/i,
    /\bbitch\b/i,
    /\basshole\b/i,
    /\bdick\b/i,
];

const getRequesterIp = (req: express.Request) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
};

const isRateLimitedForComment = (ip: string) => {
    const now = Date.now();
    const state = commentRateLimit.get(ip);

    if (!state || now - state.windowStart > COMMENT_RATE_LIMIT_WINDOW_MS) {
        commentRateLimit.set(ip, { windowStart: now, count: 1 });
        return { limited: false, retryAfterSeconds: 0 };
    }

    if (state.count >= COMMENT_RATE_LIMIT_MAX) {
        const retryAfterSeconds = Math.ceil((COMMENT_RATE_LIMIT_WINDOW_MS - (now - state.windowStart)) / 1000);
        return { limited: true, retryAfterSeconds };
    }

    state.count += 1;
    commentRateLimit.set(ip, state);
    return { limited: false, retryAfterSeconds: 0 };
};

const detectAbuseReasons = (name: string, body: string) => {
    const reasons: string[] = [];
    const fullText = `${name} ${body}`;

    if (PROFANITY_PATTERNS.some((pattern) => pattern.test(fullText))) {
        reasons.push('Contains prohibited language');
    }

    if (/<script|javascript:/i.test(fullText)) {
        reasons.push('Contains script-like content');
    }

    const linkMatches = body.match(/https?:\/\//gi) || [];
    if (linkMatches.length > 2) {
        reasons.push('Contains excessive links');
    }

    if (/(.)\1{8,}/.test(body)) {
        reasons.push('Contains repeated spam pattern');
    }

    return reasons;
};

const logCommentModeration = async ({
    commentId,
    paperId,
    action,
    reason,
    actorUsername,
    actorRole,
}: {
    commentId: string;
    paperId: string;
    action: string;
    reason?: string | null;
    actorUsername?: string | null;
    actorRole?: string | null;
}) => {
    const logId = `CL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await db.prepare(`
      INSERT INTO paper_comment_moderation_logs (id, comment_id, paper_id, action, reason, actor_username, actor_role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, commentId, paperId, action, reason || null, actorUsername || null, actorRole || null);
};

const parseCookies = (cookieHeader?: string) => {
    const parsed = new Map<string, string>();
    if (!cookieHeader) return parsed;

    cookieHeader.split(';').forEach((entry) => {
        const idx = entry.indexOf('=');
        if (idx === -1) return;
        const key = entry.slice(0, idx).trim();
        const value = entry.slice(idx + 1).trim();
        parsed.set(key, decodeURIComponent(value));
    });
    return parsed;
};

const hashPassword = (password: string, salt: string) => {
    return crypto.scryptSync(password, salt, 64).toString('hex');
};

const timingSafeCompare = (a: string, b: string) => {
    const aBuf = Buffer.from(a, 'hex');
    const bBuf = Buffer.from(b, 'hex');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
};

const requireAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const cookieMap = parseCookies(req.headers.cookie);
    const token = cookieMap.get(SESSION_COOKIE_NAME);
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = verifySession(token);
    if (!session) {
        res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
        return res.status(401).json({ error: 'Session expired' });
    }

    req.authUser = session;
    next();
};

const requireRole = (roles: AppRole[]) => {
    return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
        requireAuth(req, res, () => {
            const role = req.authUser?.role;
            if (!role || !roles.includes(role)) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            next();
        });
    };
};

const ensureDefaultAdminUser = async () => {
    const existingUsers = await db.prepare('SELECT COUNT(*)::int AS total FROM app_users').get() as any;
    const total = Number(existingUsers?.total || 0);
    if (total > 0) return;

    const isProduction = process.env.NODE_ENV === 'production';

    // In production, refuse to bootstrap an admin with a default/blank password — a
    // defaulted admin credential is a live account-takeover risk. Fail fast instead.
    if (isProduction && !process.env.ADMIN_PASSWORD) {
        throw new Error(
            '[Security] ADMIN_PASSWORD must be set in production. Refusing to bootstrap the admin user with default credentials.'
        );
    }

    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    if (!process.env.ADMIN_PASSWORD) {
        console.warn('[Security] ADMIN_PASSWORD not set. Using default bootstrap credentials; set env vars immediately.');
    }

    const userId = `U-${Date.now()}`;
    await db.prepare(`
      INSERT INTO app_users (id, username, password_hash, password_salt, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, username, passwordHash, salt, 'admin');

    console.log(`[Auth] Bootstrapped admin user: ${username}`);
};

// Initialize GCS with explicit Project ID for production robustness
const storageGCS = new Storage({
    projectId: 'greenoccasion-489916'
});

const bucketName = process.env.GCS_BUCKET_NAME || 'greenoccasion-library-uploads';
const legacyBucketName = 'greenoccasion-library-uploads'; // Force correct bucket
const bucketCandidates = Array.from(new Set([bucketName, legacyBucketName].filter(Boolean)));

// Only use Google Cloud Storage when explicitly selected. The minimal stack
// (STORAGE_DRIVER=local, the default) serves PDFs from local disk instead.
const useGcsStorage = (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'gcs';
// S3-compatible object storage (AWS S3, Cloudflare R2, etc.) via the pluggable
// objectStorage driver. PDFs are served by redirecting to a short-lived signed URL.
const useS3Storage = (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 's3';

const resolvePdfFromStorage = async (fileName: string): Promise<{ exists: boolean; signedUrl: string | null; bucketName: string | null; }> => {
    if (!useGcsStorage) {
        return { exists: false, signedUrl: null, bucketName: null };
    }

    const cleanFileName = fileName.trim();
    for (const candidateName of bucketCandidates) {
        try {
            const candidateBucket = storageGCS.bucket(candidateName);
            const file = candidateBucket.file(cleanFileName);
            const [exists] = await file.exists();
            
            if (!exists) continue;

            const [url] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
                queryParams: { 'response-content-type': 'application/pdf' }
            });

            return { exists: true, signedUrl: url, bucketName: candidateName };
        } catch (err: any) {
            console.error(`[GCS Resolve] Error in bucket ${candidateName}:`, err.message);
        }
    }
    return { exists: false, signedUrl: null, bucketName: null };
};

// Setup Multer for Memory Storage (to upload to GCS)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error("Only PDFs are allowed."));
    }
});

// Manuscript submissions accept PDF/DOC/DOCX for the main file and any type for
// supplementary datasets/figures. Field-scoped so the manuscript stays a document.
const MANUSCRIPT_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const submissionMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 12 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'manuscript' && !MANUSCRIPT_MIME.has(file.mimetype)) {
            return cb(new Error('Manuscript must be a PDF or Word document.'));
        }
        cb(null, true);
    },
});

app.post('/api/admin/cleanup', requireRole(['admin']), async (req, res) => {
    try {
        const result = await db.transaction(async () => {
            const papersStmt = db.prepare(`SELECT id FROM papers WHERE abstract LIKE '%Abstract unavailable%' OR file_path IS NULL OR file_path = ''`);
            const invalidPapers = await papersStmt.all();
            const paperIds = invalidPapers.map((p: any) => p.id);

            if (paperIds.length > 0) {
                // To avoid issues with huge arrays in parameterized queries for sqlite/pg, we delete one by one or chunk
                const deleteAuthorLinks = db.prepare(`DELETE FROM paper_authors WHERE paper_id = $1`);
                const deleteReviews = db.prepare(`DELETE FROM reviews WHERE paper_id = $1`);
                const deletePapers = db.prepare(`DELETE FROM papers WHERE id = $1`);
                
                for (const pid of paperIds) {
                    await deleteReviews.run(pid);
                    await deleteAuthorLinks.run(pid);
                    await deletePapers.run(pid);
                }
                
                // Also clean up orphaned authors
                const deleteOrphanedAuthors = db.prepare(`
                    DELETE FROM authors
                    WHERE id NOT IN (SELECT author_id FROM paper_authors)
                `);
                await deleteOrphanedAuthors.run();
            }
        })();

        res.json({ message: `Successfully executed cleanup script for invalid papers.` });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await db.prepare('SELECT id, username, password_hash, password_salt, role, status FROM app_users WHERE username = ?').get(username) as any;
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const computedHash = hashPassword(password, user.password_salt);
        if (!timingSafeCompare(computedHash, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Self-registered authors/reviewers must be approved by an admin before they can sign in.
        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Your account is awaiting admin approval. You’ll be able to sign in once it’s approved.' });
        }
        if (user.status === 'rejected') {
            return res.status(403).json({ error: 'This account request was not approved. Please contact the editorial office.' });
        }

        const expiresAt = Date.now() + SESSION_TTL_MS;
        const token = signSession({
            userId: user.id,
            username: user.username,
            role: user.role,
            expiresAt,
        });

        const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (_req, res) => {
    // Stateless tokens: clearing the cookie ends the session client-side.
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    res.json({
        user: {
            id: user.userId,
            username: user.username,
            role: user.role,
        }
    });
});

 const normalizeStoredPdfPath = (filePathValue: unknown): string | null => {
    if (typeof filePathValue !== 'string' || filePathValue.trim().length === 0) {
        return null;
    }

    const normalized = filePathValue.replace(/\\/g, '/').trim();

    if (
        normalized.includes('..') ||
        normalized.startsWith('/') ||
        /^[a-zA-Z]:/.test(normalized) ||
        /^https?:\/\//i.test(normalized)
    ) {
        return null;
    }

    return normalized.split('/').filter(Boolean).join('/');
};

const getDownloadFileName = (paper: any, storedPath: string | null) => {
    const pathName = storedPath ? path.basename(storedPath) : '';
    if (pathName.toLowerCase().endsWith('.pdf')) return pathName;

    const titleName = String(paper?.title || paper?.id || 'paper')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120);

    return `${titleName || 'paper'}.pdf`;
};

const resolveLocalPdfPath = (storedPath: string): string | null => {
    const localPdfRoot = path.resolve(
        process.env.PDF_STORAGE_DIR || path.join(process.cwd(), 'backend', 'storage', 'openalex-pdfs')
    );

    const storageRoot = path.resolve(process.cwd(), 'backend', 'storage');
    const uploadsRoot = path.resolve(process.cwd(), 'backend', 'uploads');
    const allowedRoots = [localPdfRoot, storageRoot, uploadsRoot];

    const candidates = [
        path.resolve(localPdfRoot, storedPath),
        path.resolve(localPdfRoot, path.basename(storedPath)),
        path.resolve(process.cwd(), storedPath),
        path.resolve(uploadsRoot, path.basename(storedPath)),
    ];

    for (const candidate of candidates) {
        const isAllowed = allowedRoots.some((root) =>
            candidate === root || candidate.startsWith(`${root}${path.sep}`)
        );

        if (!isAllowed) continue;

        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch {
            // Try the next candidate.
        }
    }

    return null;
};

const getLatestOpenAlexPdfUrl = async (paperId: string): Promise<string | null> => {
    // Prefer a direct PDF url, then any landing/fulltext url, across any provider,
    // so the download endpoint can always reach the open-access source.
    const row = await db.prepare(`
        SELECT
            COALESCE(NULLIF(pdf_url, ''), NULLIF(landing_page_url, ''), NULLIF(fulltext_url, '')) AS source_url
        FROM paper_versions
        WHERE paper_id = ?
          AND COALESCE(NULLIF(pdf_url, ''), NULLIF(landing_page_url, ''), NULLIF(fulltext_url, '')) IS NOT NULL
        ORDER BY (pdf_url IS NOT NULL AND pdf_url <> '') DESC,
                 retrieved_at DESC NULLS LAST, updated_at DESC, created_at DESC
        LIMIT 1
    `).get(paperId) as any;

    const sourceUrl = row?.source_url;
    return typeof sourceUrl === 'string' && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
};

const citationText = (paper: any, style: string) => {
    const author = String(paper.author_names || 'Unknown Author').split(',')[0]?.trim() || 'Unknown Author';
    const year = paper.created_at ? new Date(paper.created_at).getFullYear() : 'n.d.';
    const title = paper.title || 'Untitled';
    const journal = 'Open Carbon Research Library';
    const doi = paper.doi ? ` https://doi.org/${paper.doi}` : '';

    if (style === 'mla') {
        return `${author}. \"${title}.\" ${journal}, ${year}.${doi}`;
    }

    if (style === 'bibtex') {
        const keyAuthor = author.replace(/[^a-zA-Z]/g, '') || 'author';
        const key = `${keyAuthor}${year}`;
        return `@article{${key},\n  title={${title}},\n  author={${author}},\n  journal={${journal}},\n  year={${year}},\n  doi={${paper.doi || ''}}\n}`;
    }

    return `${author} (${year}). ${title}. ${journal}.${doi}`;
};
app.post('/api/jobs/discover-subtopics', requireRole(['admin']), async (req, res) => {
    try {
        const topicText = typeof req.body?.topicText === 'string'
            ? req.body.topicText.trim()
            : '';

        if (topicText.length < 2) {
            return res.status(400).json({ error: 'topicText must be at least 2 characters.' });
        }

        const parsedLimit = Number(req.body?.limit ?? 30);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 50)
            : 30;

        const job = await createJob({
            type: JOB_TYPE.DISCOVER_SUBTOPICS,
            payload: {
                topicText,
                limit,
                requestedAt: new Date().toISOString(),
                runNonce: crypto.randomUUID(),
            },
        });

        await enqueueJob(job.id);

        res.status(202).json({
            jobId: job.id,
            status: job.status,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/subtopics', requireRole(['admin']), async (req, res) => {
    try {
        const jobId = typeof req.query.jobId === 'string'
            ? req.query.jobId.trim()
            : '';

        if (!jobId) {
            return res.status(400).json({ error: 'jobId query parameter is required.' });
        }

        const job = await getJobById(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        const subtopics = await listSubtopicsByJobId(jobId);
        res.json(subtopics);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Recent jobs list for the admin dashboard / jobs view.
app.get('/api/jobs', requireRole(['admin']), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const jobs = await db.prepare(`
            SELECT id, type, status, progress, result_json, error_text, created_at, updated_at
            FROM jobs
            ORDER BY created_at DESC
            LIMIT ?
        `).all(limit);
        res.json(jobs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Full event timeline for a job (what was processed, item by item).
app.get('/api/jobs/:id/events', requireRole(['admin']), async (req, res) => {
    try {
        const job = await getJobById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        const events = await listJobEventsByJobId(req.params.id, 300);
        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/jobs/:id/status', requireRole(['admin']), async (req, res) => {
    try {
        // Live status is polled — never let the browser cache it (avoids 304s that
        // make a progressing job look frozen).
        res.setHeader('Cache-Control', 'no-store');

        const job = await getJobById(req.params.id);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const latestEvent = await getLatestJobEventByJobId(req.params.id);

        res.json({
            id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            message: latestEvent?.message ?? null,
            result: job.result_json,
            errorText: job.error_text,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
// --- API Endpoints ---

// Get all papers (approved). Enriched with source/license/field for public filtering.
app.get('/api/papers', async (req, res) => {
    const { search, topic, field, journal, origin } = req.query;
    let query = `
    SELECT p.*,
           STRING_AGG(DISTINCT a.name, ', ') as author_names,
           (SELECT s.name FROM paper_versions pv JOIN sources s ON s.id = pv.source_id
              WHERE pv.paper_id = p.id AND s.name IS NOT NULL AND s.name <> '' LIMIT 1) AS source_name,
           (SELECT l.canonical_name FROM paper_versions pv
              JOIN license_snapshots ls ON ls.id = pv.license_snapshot_id
              JOIN licenses l ON l.id = ls.license_id
              WHERE pv.paper_id = p.id LIMIT 1) AS license_name
    FROM papers p
    LEFT JOIN paper_authors pa ON p.id = pa.paper_id
    LEFT JOIN authors a ON pa.author_id = a.id
    WHERE p.status = 'approved'
  `;
    const params: string[] = [];

    // Per-journal serving: a journal front-end passes ?journal=<slug>; each site only
    // ever sees its own scoped papers. Without a slug, exclude unmapped (staging) papers.
    if (journal) {
        query += ` AND p.journal_id = (SELECT id FROM journals WHERE slug = ?)`;
        params.push(journal as string);
    } else {
        query += ` AND p.journal_id IS NOT NULL`;
    }

    if (topic) {
        query += ` AND p.topic = ?`;
        params.push(topic as string);
    }
    if (origin === 'original' || origin === 'aggregated') {
        query += ` AND p.origin = ?`;
        params.push(origin);
    }
    if (search) {
        query += ` AND (p.title LIKE ? OR p.abstract LIKE ?)`;
        const term = `%${search}%`;
        params.push(term, term);
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

    try {
        const stmt = db.prepare(query);
        let papers = await stmt.all(...params) as any[];

        // Attach the effective broad field (AI-assigned, else keyword guess).
        papers = papers.map((p) => ({
            ...p,
            field_label: effectiveField(p.ai_field, p.topic),
        }));

        if (field) {
            papers = papers.filter((p) => p.field_label === String(field));
        }

        res.json(papers);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
// --- AI analysis (admin-triggered; one-time, results stored on the paper) ---
app.get('/api/ai/status', (_req, res) => {
    res.json({ enabled: isAiEnabled() });
});

app.post('/api/admin/paper/:id/analyze', requireRole(['admin']), async (req, res) => {
    try {
        if (!isAiEnabled()) {
            return res.status(503).json({ error: 'AI is not configured. Set GOOGLE_GENAI_API_KEY.' });
        }
        const result = await analyzeAndStorePaper(req.params.id);
        if (!result.ok) {
            return res.status(422).json({ error: `Analysis failed: ${result.reason}` });
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Run AI analysis as a background job (progress + per-paper events).
app.post('/api/admin/ai/analyze-pending', requireRole(['admin']), async (req, res) => {
    try {
        if (!isAiEnabled()) {
            return res.status(503).json({ error: 'AI is not configured. Set GOOGLE_GENAI_API_KEY.' });
        }
        const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100);
        const job = await createJob({
            type: JOB_TYPE.ANALYZE_PAPERS,
            payload: { limit, requestedAt: new Date().toISOString(), runNonce: crypto.randomUUID() },
        });
        await enqueueJob(job.id);
        res.status(202).json({ jobId: job.id, status: job.status });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Re-attempt PDF downloads for metadata-only papers as a background job.
app.post('/api/admin/papers/backfill-pdfs', requireRole(['admin']), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.body?.limit) || 25, 1), 200);
        const job = await createJob({
            type: JOB_TYPE.BACKFILL_PDFS,
            payload: { limit, requestedAt: new Date().toISOString(), runNonce: crypto.randomUUID() },
        });
        await enqueueJob(job.id);
        res.status(202).json({ jobId: job.id, status: job.status });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Broad fields: the many granular topics grouped into a handful of domains.
app.get('/api/topics', async (req, res) => {
    try {
        // Journal-scoped for per-journal front-ends; without a slug, exclude staging.
        const journal = req.query.journal as string | undefined;
        const scope = journal
            ? ' AND p.journal_id = (SELECT id FROM journals WHERE slug = ?)'
            : ' AND p.journal_id IS NOT NULL';
        const params = journal ? [journal] : [];
        // Per-paper rows so we can prefer the AI-assigned field over the keyword guess.
        const rows = await db.prepare(`
            SELECT p.topic AS topic, p.ai_field AS ai_field
            FROM papers p
            WHERE p.status = 'approved' AND p.topic IS NOT NULL AND p.topic <> ''${scope}
        `).all(...params) as Array<{ topic: string; ai_field: string | null }>;

        const groups = new Map<string, { field: string; icon: string; paper_count: number; topics: Set<string> }>();
        for (const row of rows) {
            const field = effectiveField(row.ai_field, row.topic);
            const existing = groups.get(field) ?? { field, icon: fieldIcon(field), paper_count: 0, topics: new Set<string>() };
            existing.paper_count += 1;
            existing.topics.add(row.topic);
            groups.set(field, existing);
        }

        const result = Array.from(groups.values())
            .map(g => ({ field: g.field, icon: g.icon, paper_count: g.paper_count, topic_count: g.topics.size }))
            .sort((a, b) => b.paper_count - a.paper_count);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/licenses/preview', requireRole(['admin']), async (req, res) => {
    try {
        const discoveryJobId = typeof req.body?.discoveryJobId === 'string'
            ? req.body.discoveryJobId.trim()
            : '';

        const subtopicIds = Array.isArray(req.body?.subtopicIds)
            ? req.body.subtopicIds
                .filter((id: unknown): id is string => typeof id === 'string')
                .map(id => id.trim())
                .filter(Boolean)
            : [];

        if (!discoveryJobId) {
            return res.status(400).json({ error: 'discoveryJobId is required.' });
        }

        if (subtopicIds.length === 0) {
            return res.status(400).json({ error: 'subtopicIds must contain at least one subtopic id.' });
        }

        const job = await getJobById(discoveryJobId);

        if (!job) {
            return res.status(404).json({ error: 'Discovery job not found.' });
        }

        if (job.type !== JOB_TYPE.DISCOVER_SUBTOPICS) {
            return res.status(422).json({ error: 'discoveryJobId must refer to a discover_subtopics job.' });
        }

        const subtopics = await getLicensePreviewSubtopics(discoveryJobId, subtopicIds);

        if (subtopics.length === 0) {
            return res.status(404).json({ error: 'No selected subtopics found for this discovery job.' });
        }

        const licenses = await listLicenses();
        const preview = buildLicensePreview({
            discoveryJobId,
            subtopics,
            licenses,
        });

        res.json(preview);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get single paper details
   app.get('/api/paper/:id', async (req, res) => {
    try {
        const paperStmt = db.prepare(`
      SELECT p.*,
             STRING_AGG(a.name, ', ') as author_names,
             (SELECT s.name FROM paper_versions pv JOIN sources s ON s.id = pv.source_id
                WHERE pv.paper_id = p.id AND s.name IS NOT NULL AND s.name <> '' LIMIT 1) AS source_name,
             (SELECT l.canonical_name FROM paper_versions pv
                JOIN license_snapshots ls ON ls.id = pv.license_snapshot_id
                JOIN licenses l ON l.id = ls.license_id
                WHERE pv.paper_id = p.id LIMIT 1) AS license_name
      FROM papers p
      LEFT JOIN paper_authors pa ON p.id = pa.paper_id
      LEFT JOIN authors a ON pa.author_id = a.id
      WHERE p.id = ?
      GROUP BY p.id
    `);
        const paper = await paperStmt.get(req.params.id) as any;

        if (!paper) return res.status(404).json({ error: 'Paper not found' });

        const storedPath = normalizeStoredPdfPath(paper.file_path);

        // pdfStored = a real PDF file exists in our storage (local disk or bucket).
        let pdfStored = false;
        if (storedPath) {
            const resolvedPdf = await resolvePdfFromStorage(storedPath);
            pdfStored = resolvedPdf.exists || Boolean(resolveLocalPdfPath(storedPath));
            if (!pdfStored && useS3Storage) {
                pdfStored = await objectStorage.objectExists(storedPath).catch(() => false);
            }
        }

        // sourceUrl = the external open-access page/PDF (may be a publisher/S3 link).
        const sourceUrl = await getLatestOpenAlexPdfUrl(req.params.id);
        const fileExists = pdfStored || Boolean(sourceUrl);

        try {
            await db.prepare('UPDATE papers SET views = views + 1 WHERE id = ?').run(req.params.id);
        } catch (viewErr: any) {
            console.error("Error updating view count:", viewErr);
        }

        const responseBody: Record<string, unknown> = {
            ...paper,
            file_path: storedPath ?? paper.file_path,
            file_exists: fileExists,
            // Only treat a locally/bucket-stored PDF as embeddable/downloadable on-site.
            pdf_stored: pdfStored,
            source_url: sourceUrl,
            pdf_url: pdfStored ? `/api/paper/${encodeURIComponent(req.params.id)}/download?disposition=inline` : null,
        };

        res.json(responseBody);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
// Related papers by shared AI tags / field (DB-only, no AI cost per request).
app.get('/api/paper/:id/related', async (req, res) => {
    try {
        const target = await db.prepare(
            `SELECT id, topic, ai_field, ai_tags FROM papers WHERE id = ?`
        ).get(req.params.id) as any;
        if (!target) return res.status(404).json({ error: 'Paper not found' });

        const targetTags = new Set(
            (Array.isArray(target.ai_tags) ? target.ai_tags : []).map((t: string) => String(t).toLowerCase())
        );

        const rows = await db.prepare(`
            SELECT p.id, p.title, p.topic, p.ai_field, p.ai_tags, p.created_at,
                   STRING_AGG(a.name, ', ') AS author_names
            FROM papers p
            LEFT JOIN paper_authors pa ON p.id = pa.paper_id
            LEFT JOIN authors a ON pa.author_id = a.id
            WHERE p.status = 'approved' AND p.id <> ?
            GROUP BY p.id
        `).all(req.params.id) as any[];

        const scored = rows.map((row) => {
            const tags = (Array.isArray(row.ai_tags) ? row.ai_tags : []).map((t: string) => String(t).toLowerCase());
            const shared = tags.filter((t: string) => targetTags.has(t)).length;
            const fieldMatch = target.ai_field && row.ai_field === target.ai_field ? 1 : 0;
            const topicMatch = target.topic && row.topic === target.topic ? 1 : 0;
            return { row, score: shared * 3 + fieldMatch * 2 + topicMatch };
        });

        const related = scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score || new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime())
            .slice(0, 4)
            .map((s) => s.row);

        res.json(related);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get canonical license policy options
app.get('/api/licenses', async (_req, res) => {
    try {
        const licenses = await listLicenses();
        res.json(licenses);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Download paper and track metric
 app.get('/api/paper/:id/download', async (req, res) => {
    try {
        const paper = await db.prepare(`
            SELECT id, title, file_path
            FROM papers
            WHERE id = ?
        `).get(req.params.id) as any;

        if (!paper) return res.status(404).json({ error: 'Paper not found' });

        const storedPath = normalizeStoredPdfPath(paper.file_path);
        const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
        const downloadFileName = getDownloadFileName(paper, storedPath);

        if (storedPath) {
            // S3-compatible storage (Cloudflare R2, Supabase Storage, etc.): stream the
            // object through the backend. Works on any S3 provider and lets us set the
            // inline/attachment header (no dependency on presigned-URL support).
            if (useS3Storage && await objectStorage.objectExists(storedPath).catch(() => false)) {
                await db.prepare('UPDATE papers SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `${disposition}; filename="${downloadFileName}"`);
                const stream = await objectStorage.getObjectStream(storedPath);
                stream.on('error', (err: Error) => {
                    if (!res.headersSent) res.status(500).json({ error: err.message });
                    else res.destroy(err);
                });
                stream.pipe(res);
                return;
            }

            const resolvedPdf = await resolvePdfFromStorage(storedPath);

            if (resolvedPdf.exists && resolvedPdf.bucketName) {
                await db.prepare('UPDATE papers SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `${disposition}; filename="${downloadFileName}"`);

                const file = storageGCS.bucket(resolvedPdf.bucketName).file(storedPath);
                const stream = file.createReadStream();

                stream.on('error', (err) => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    res.destroy(err);
                });

                stream.pipe(res);
                return;
            }

            const localPdfPath = resolveLocalPdfPath(storedPath);

            if (localPdfPath) {
                await db.prepare('UPDATE papers SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `${disposition}; filename="${downloadFileName}"`);

                fs.createReadStream(localPdfPath).pipe(res);
                return;
            }
        }

        const openAlexPdfUrl = await getLatestOpenAlexPdfUrl(req.params.id);

        if (openAlexPdfUrl) {
            const response = await fetch(openAlexPdfUrl, {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept': 'application/pdf,*/*',
                },
            });

            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                const looksLikePdf = buffer.subarray(0, 4).toString() === '%PDF';

                // Only stream when the upstream actually returned a PDF. Many OA URLs are
                // HTML landing pages — for those, send the user to the source page instead.
                if (looksLikePdf || contentType.includes('pdf')) {
                    await db.prepare('UPDATE papers SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `${disposition}; filename="${downloadFileName}"`);
                    res.send(buffer);
                    return;
                }
            }

            // Upstream is not a usable PDF: redirect to the open-access source page.
            return res.redirect(302, openAlexPdfUrl);
        }

        return res.status(404).json({ error: 'PDF file not found' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
// Increment citation count
app.post('/api/paper/:id/cite', async (req, res) => {
    try {
        const resDb = await db.prepare('UPDATE papers SET citations = citations + 1 WHERE id = ?').run(req.params.id) as any;
        if (resDb.rowCount === 0) return res.status(404).json({ error: 'Paper not found' });

        res.json({ success: true, message: 'Citation tracked' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/paper/:id/citation', async (req, res) => {
    try {
        const style = String(req.query.style || 'apa').toLowerCase();
        const validStyles = new Set(['apa', 'mla', 'bibtex']);
        if (!validStyles.has(style)) {
            return res.status(400).json({ error: 'Invalid citation style' });
        }

        const paperStmt = db.prepare(`
            SELECT p.*, STRING_AGG(a.name, ', ') as author_names
            FROM papers p
            LEFT JOIN paper_authors pa ON p.id = pa.paper_id
            LEFT JOIN authors a ON pa.author_id = a.id
            WHERE p.id = ?
            GROUP BY p.id
        `);
        const paper = await paperStmt.get(req.params.id) as any;
        if (!paper) {
            return res.status(404).json({ error: 'Paper not found' });
        }

        const text = citationText(paper, style);
        res.json({ style, text });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/paper/:id/comments', async (req, res) => {
    try {
        const pageRaw = Number(req.query.page || 1);
        const limitRaw = Number(req.query.limit || 5);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 20) : 5;
        const offset = (page - 1) * limit;

        const countRow = await db.prepare(`
            SELECT COUNT(*)::int AS total
            FROM paper_comments
            WHERE paper_id = ? AND status = 'approved'
        `).get(req.params.id) as any;
        const total = Number(countRow?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / limit));

        const comments = await db.prepare(`
            SELECT id, paper_id, commenter_name, body, created_at
            FROM paper_comments
            WHERE paper_id = ? AND status = 'approved'
            ORDER BY created_at DESC
            OFFSET ?
            LIMIT ?
        `).all(req.params.id, offset, limit);

        res.json({
            items: comments,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasPrev: page > 1,
                hasNext: page < totalPages,
            },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/paper/:id/comments', async (req, res) => {
    try {
        const { commenterName, body } = req.body || {};
        if (!commenterName || !body) {
            return res.status(400).json({ error: 'Name and comment body are required' });
        }

        const requesterIp = getRequesterIp(req);
        const limitState = isRateLimitedForComment(requesterIp);
        if (limitState.limited) {
            res.setHeader('Retry-After', String(limitState.retryAfterSeconds));
            return res.status(429).json({ error: `Too many comments. Try again in ${limitState.retryAfterSeconds} seconds.` });
        }

        const paper = await db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id) as any;
        if (!paper) {
            return res.status(404).json({ error: 'Paper not found' });
        }

        const id = `C-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const cleanName = String(commenterName).trim();
        const cleanBody = String(body).trim();
        const abuseReasons = detectAbuseReasons(cleanName, cleanBody);

        if (abuseReasons.length > 0) {
            const reason = abuseReasons.join('; ');
            await db.prepare(`
                INSERT INTO paper_comments (id, paper_id, commenter_name, body, status, moderator_note)
                VALUES (?, ?, ?, ?, 'rejected', ?)
            `).run(id, req.params.id, cleanName, cleanBody, reason);

            await logCommentModeration({
                commentId: id,
                paperId: req.params.id,
                action: 'auto-rejected',
                reason,
                actorUsername: 'system-filter',
                actorRole: 'system',
            });

            return res.status(202).json({ success: true, message: 'Comment blocked by content safety filter.' });
        }

        await db.prepare(`
            INSERT INTO paper_comments (id, paper_id, commenter_name, body, status)
            VALUES (?, ?, ?, ?, 'pending')
        `).run(id, req.params.id, cleanName, cleanBody);

        await logCommentModeration({
            commentId: id,
            paperId: req.params.id,
            action: 'submitted',
            reason: 'Awaiting moderation',
            actorUsername: cleanName,
            actorRole: 'public',
        });

        res.status(201).json({ success: true, message: 'Comment submitted for moderation' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Submit a new paper
app.post('/api/submit-paper', upload.single('pdfFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required.' });
    }

    const { title, abstract, topic, authorName, authorInstitution, authorEmail } = req.body;

    if (!title || !abstract || !topic || !authorName || !authorEmail) {
        return res.status(400).json({ error: 'Missing required metadata.' });
    }

    try {
        const paperId = `P-${Date.now()}`;
        const authorId = `A-${Date.now()}`;
        const fileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;

        // Upload to GCS
        const blob = storageGCS.bucket(bucketName).file(fileName);
        const blobStream = blob.createWriteStream({
            resumable: false,
        });

        await new Promise((resolve, reject) => {
            blobStream.on('error', (err) => reject(err));
            blobStream.on('finish', () => resolve(true));
            blobStream.end(req.file!.buffer);
        });

        // Origin: this is a submission form, so default to 'original'; allow the
        // admin to flag a manual add as 'aggregated' when uploading external content.
        const origin = req.body.origin === 'aggregated' ? 'aggregated' : 'original';

        const insertPaper = db.prepare(`
      INSERT INTO papers (id, title, abstract, topic, file_path, status, doi, license_url, origin)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `);
        const insertAuthor = db.prepare(`
      INSERT INTO authors (id, name, institution, email)
      VALUES (?, ?, ?, ?)
    `);
        const linkAuthor = db.prepare(`
      INSERT INTO paper_authors (paper_id, author_id)
      VALUES (?, ?)
    `);

        const transaction = db.transaction(async () => {
            await insertPaper.run(paperId, title, abstract, topic, fileName, req.body.doi || null, req.body.licenseUrl || null, origin);
            await insertAuthor.run(authorId, authorName, authorInstitution || 'Independent', authorEmail);
            await linkAuthor.run(paperId, authorId);
        });

        await transaction();

        res.status(201).json({ message: 'Paper submitted successfully for review.', paperId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Review Endpoints
app.get('/api/admin/pending', requireRole(['admin']), async (req, res) => {
    try {
        const stmt = db.prepare(`
       SELECT p.*, STRING_AGG(a.name, ', ') as author_names
       FROM papers p
      JOIN paper_authors pa ON p.id = pa.paper_id
      JOIN authors a ON pa.author_id = a.id
      WHERE p.status = 'pending'
      GROUP BY p.id
      ORDER BY p.created_at ASC
    `);
        const pending = await stmt.all();
        res.json(pending);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/review', requireRole(['admin']), async (req, res) => {
    const { paperId, status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status update.' });
    }

    try {
        const stmt = db.prepare(`UPDATE papers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        const info = await stmt.run(status, paperId) as any;

        if (info.rowCount === 0) return res.status(404).json({ error: 'Paper not found.' });

        if (status === 'approved') {
            const paper = await db.prepare('SELECT file_path FROM papers WHERE id = ?').get(paperId) as any;
            if (paper && paper.file_path) {
                // Background extraction logic would need GCS awareness or download paper locally first
                // For now, logging.
                console.log(`Triggering extraction for approved paper ${paperId} (GCS: ${paper.file_path})`);
            }
        }

        res.json({ message: `Paper ${status} successfully.` });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/comments/pending', requireRole(['admin']), async (req, res) => {
    try {
        const comments = await db.prepare(`
            SELECT c.id, c.paper_id, c.commenter_name, c.body, c.created_at, p.title
            FROM paper_comments c
            JOIN papers p ON p.id = c.paper_id
            WHERE c.status = 'pending'
            ORDER BY c.created_at ASC
        `).all();

        res.json(comments);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/comments/:id/moderate', requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const { action, note } = req.body || {};
        if (!['approved', 'rejected'].includes(action)) {
            return res.status(400).json({ error: 'Invalid moderation action' });
        }

        const existing = await db.prepare('SELECT id, paper_id FROM paper_comments WHERE id = ?').get(req.params.id) as any;
        if (!existing) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const result = await db.prepare(`
            UPDATE paper_comments
            SET status = ?, moderator_note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(action, note || null, req.params.id) as any;

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        await logCommentModeration({
            commentId: existing.id,
            paperId: existing.paper_id,
            action,
            reason: note || `Moderated as ${action}`,
            actorUsername: req.authUser?.username || null,
            actorRole: req.authUser?.role || null,
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get author details and their papers
app.get('/api/author/:name', async (req, res) => {
    try {
        const authorName = decodeURIComponent(req.params.name);

        const authorStmt = db.prepare(`SELECT * FROM authors WHERE name = ? LIMIT 1`);
        const author = await authorStmt.get(authorName) as any;

        if (!author) return res.status(404).json({ error: 'Author not found' });

        const papersStmt = db.prepare(`
            SELECT p.* 
            FROM papers p
            JOIN paper_authors pa ON p.id = pa.paper_id
            WHERE pa.author_id = ? AND p.status = 'approved'
            ORDER BY p.created_at DESC
        `);
        const papers = await papersStmt.all(author.id) as any[];

        const affiliations = await db.prepare(`
            SELECT organization_name, ror_id, country, source, confidence
            FROM author_affiliations WHERE author_id = ?
            ORDER BY confidence DESC NULLS LAST
        `).all(author.id) as any[];

        const identities = await db.prepare(`
            SELECT scheme, identifier, source, source_url, confidence
            FROM author_identities WHERE author_id = ?
        `).all(author.id) as any[];

        // Real co-authors: other authors who share approved papers with this one.
        const coAuthors = await db.prepare(`
            SELECT a.id, a.name, a.institution, a.orcid,
                   COUNT(DISTINCT pa1.paper_id) AS shared
            FROM paper_authors pa1
            JOIN papers p ON p.id = pa1.paper_id AND p.status = 'approved'
            JOIN paper_authors pa2 ON pa2.paper_id = pa1.paper_id AND pa2.author_id <> pa1.author_id
            JOIN authors a ON a.id = pa2.author_id
            WHERE pa1.author_id = ?
            GROUP BY a.id, a.name, a.institution, a.orcid
            ORDER BY shared DESC, a.name ASC
            LIMIT 6
        `).all(author.id) as any[];

        const enrichedAuthor = {
            ...author,
            totalPublications: papers.length,
            researchAreas: Array.from(new Set(papers.map((p: any) => p.topic))),
            affiliations,
            identities,
            coAuthors,
            bio: `${author.name} is a researcher${author.institution && author.institution !== 'Unknown' ? ` at ${author.institution}` : ''} contributing to the Green Occasion library.`,
        };

        res.json({ author: enrichedAuthor, papers });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Authors directory with publication counts + enrichment status.
app.get('/api/authors', async (req, res) => {
    try {
        // Journal-scoped author directory. Resolve the slug to an id once, then reuse.
        const journal = req.query.journal as string | undefined;
        let jid: string | null = null;
        if (journal) {
            const j = await db.prepare('SELECT id FROM journals WHERE slug = ?').get(journal) as any;
            jid = j?.id ?? '__none__';
        }
        const cond = jid
            ? "p.status = 'approved' AND p.journal_id = ?"
            : "p.status = 'approved' AND p.journal_id IS NOT NULL";
        const params = jid ? [jid, jid] : [];
        const rows = await db.prepare(`
            SELECT a.id, a.name, a.institution, a.orcid, a.enrichment_status,
                   a.enrichment_confidence, a.works_count,
                   COUNT(DISTINCT pa.paper_id) FILTER (WHERE ${cond}) AS publication_count
            FROM authors a
            LEFT JOIN paper_authors pa ON pa.author_id = a.id
            LEFT JOIN papers p ON p.id = pa.paper_id
            GROUP BY a.id
            HAVING COUNT(DISTINCT pa.paper_id) FILTER (WHERE ${cond}) > 0
            ORDER BY publication_count DESC, a.name ASC
        `).all(...params);
        res.json(rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Start an author enrichment background job (ORCID/ROR via OpenAlex).
app.post('/api/admin/authors/enrich', requireRole(['admin']), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
        const job = await createJob({
            type: JOB_TYPE.ENRICH_AUTHORS,
            payload: { limit, requestedAt: new Date().toISOString(), runNonce: crypto.randomUUID() },
        });
        await enqueueJob(job.id);
        res.status(202).json({ jobId: job.id, status: job.status });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
   app.get('/api/jobs/:id/skipped-records', requireRole(['admin']), async (req, res) => {
  try {
    const job = await getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const records = await db.prepare(`
      SELECT
        id,
        job_id AS "jobId",
        provider,
        provider_source_id AS "providerSourceId",
        source_url AS "sourceUrl",
        title,
        doi,
        reason,
        raw_error AS "rawError",
        raw_json AS "rawJson",
        created_at AS "createdAt"
      FROM ingest_skipped_records
      WHERE job_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id);

    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/jobs/ingest-papers', requireRole(['admin']), async (req, res) => {
  try {
    const discoveryJobId = typeof req.body?.discoveryJobId === 'string'
      ? req.body.discoveryJobId.trim()
      : '';

    const subtopicIds = Array.isArray(req.body?.subtopicIds)
      ? req.body.subtopicIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    if (!discoveryJobId || subtopicIds.length === 0) {
      return res.status(400).json({ error: 'discoveryJobId and subtopicIds are required.' });
    }

    const sourceMode = req.body?.sourceMode === 'fixture' ? 'fixture' : 'openalex';
    const parsedPerPage = Number(req.body?.perPage ?? 10);
    const perPage = Number.isFinite(parsedPerPage)
      ? Math.min(Math.max(Math.trunc(parsedPerPage), 1), 50)
      : 10;

    const job = await createJob({
      type: JOB_TYPE.INGEST_PAPERS,
      payload: {
        discoveryJobId,
        subtopicIds,
        sourceMode,
        perPage,
        downloadFiles: req.body?.downloadFiles === true,
        requestedAt: new Date().toISOString(),
        runNonce: crypto.randomUUID(),
      },
    });

    await enqueueJob(job.id);

    res.status(202).json({
      jobId: job.id,
      status: job.status,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Editorial workflow: self-registered authors → submissions → peer review →
// editor decision → publish. Roles: author, reviewer, editor, admin.
// ─────────────────────────────────────────────────────────────────────────────

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const setSessionCookie = (
    res: express.Response,
    user: { userId: string; username: string; role: AppRole }
) => {
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const token = signSession({ userId: user.userId, username: user.username, role: user.role, expiresAt });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${secure}`
    );
};

// Self-registration — creates a PENDING author/reviewer account. No auto-login: an admin must
// approve the account before the person can sign in.
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body || {};
        if (!email || !password || String(password).length < 6) {
            return res.status(400).json({ error: 'Email and a password (min 6 chars) are required.' });
        }
        // Self-registration is limited to author or reviewer; editor/admin are granted by an admin.
        const requestedRole: AppRole = role === 'reviewer' ? 'reviewer' : 'author';
        const username = String(email).trim().toLowerCase();
        const existing = await db.prepare('SELECT id FROM app_users WHERE username = ?').get(username);
        if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(String(password), salt);
        const userId = newId('U');
        await db.prepare(`
          INSERT INTO app_users (id, username, password_hash, password_salt, role, full_name, email, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(userId, username, passwordHash, salt, requestedRole, fullName || null, username);

        res.json({ pending: true, role: requestedRole, message: 'Your account has been created and is awaiting admin approval.' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Author: create a submission (optional manuscript upload).
const submissionUpload = submissionMulter.fields([
    { name: 'manuscript', maxCount: 1 },
    { name: 'supplementary', maxCount: 10 },
]);

// Upload one file buffer under a submission's storage prefix; returns the key.
const storeSubmissionFile = async (submissionId: string, version: number, kind: string, f: any) => {
    const safe = String(f.originalname || 'file').replace(/[^\w.\-]/g, '_');
    const key = `submissions/${submissionId}/v${version}/${kind}-${safe}`;
    await objectStorage.uploadBuffer({ key, body: f.buffer, contentType: f.mimetype || 'application/octet-stream' });
    return key;
};

app.post('/api/submissions', requireRole(['author', 'editor', 'admin']), submissionUpload, async (req: AuthenticatedRequest, res) => {
    try {
        const { title, abstract, keywords, authors, articleType, coverLetter, declarations } = req.body || {};
        if (!title || !abstract) return res.status(400).json({ error: 'Title and abstract are required.' });

        let authorList: any[] = [];
        try { authorList = authors ? (typeof authors === 'string' ? JSON.parse(authors) : authors) : []; } catch { authorList = []; }
        authorList = authorList.filter((a) => (a?.firstName || a?.lastName || a?.name || '').trim());

        let declarationsObj: any = {};
        try { declarationsObj = declarations ? (typeof declarations === 'string' ? JSON.parse(declarations) : declarations) : {}; } catch { declarationsObj = {}; }

        const files = (req.files || {}) as Record<string, any[]>;
        const manuscriptFile = files.manuscript?.[0];
        if (!manuscriptFile) return res.status(400).json({ error: 'A main manuscript file is required.' });

        const submissionId = newId('sub');
        const manuscriptPath = await storeSubmissionFile(submissionId, 1, 'manuscript', manuscriptFile);
        const supplementary: { name: string; key: string }[] = [];
        for (const f of files.supplementary || []) {
            supplementary.push({ name: f.originalname, key: await storeSubmissionFile(submissionId, 1, 'supp', f) });
        }

        // Keep authors_json populated for backward-compat with the publish path.
        const legacyAuthors = authorList.map((a) => ({
            name: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.name || '',
            email: a.email || '', affiliation: a.affiliation || '',
        }));

        await db.prepare(`
          INSERT INTO submissions (id, title, abstract, keywords, authors_json, author_user_id, manuscript_path,
            status, article_type, cover_letter, declarations, current_version)
          VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, 'submitted', ?, ?, ?::jsonb, 1)
        `).run(submissionId, title, abstract, keywords || null, JSON.stringify(legacyAuthors), req.authUser!.userId,
            manuscriptPath, articleType || null, coverLetter || null, JSON.stringify(declarationsObj));

        await db.prepare(`
          INSERT INTO submission_versions (id, submission_id, version, manuscript_path, supplementary_json)
          VALUES (?, ?, 1, ?, ?::jsonb)
        `).run(newId('ver'), submissionId, manuscriptPath, JSON.stringify(supplementary));

        let order = 0;
        for (const a of authorList) {
            await db.prepare(`
              INSERT INTO submission_authors (id, submission_id, author_order, first_name, last_name, email, affiliation, orcid, is_corresponding)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(newId('sau'), submissionId, order++, a.firstName || null, a.lastName || null,
                a.email || null, a.affiliation || null, a.orcid || null, Boolean(a.isCorresponding));
        }

        res.json({ id: submissionId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Author: upload a revised version (response-to-reviewers) when revisions were requested.
app.post('/api/submissions/:id/revise', requireRole(['author', 'editor', 'admin']), submissionUpload, async (req: AuthenticatedRequest, res) => {
    try {
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub) return res.status(404).json({ error: 'Not found' });
        const isOwner = sub.author_user_id === req.authUser!.userId;
        const isStaff = req.authUser!.role === 'editor' || req.authUser!.role === 'admin';
        if (!isOwner && !isStaff) return res.status(403).json({ error: 'Forbidden' });
        if (sub.status !== 'revisions_requested') return res.status(400).json({ error: 'This submission is not awaiting a revision.' });

        const files = (req.files || {}) as Record<string, any[]>;
        const manuscriptFile = files.manuscript?.[0];
        if (!manuscriptFile) return res.status(400).json({ error: 'A revised manuscript file is required.' });

        const nextVersion = (sub.current_version || 1) + 1;
        const nextRound = (sub.round || 1) + 1;
        const manuscriptPath = await storeSubmissionFile(req.params.id, nextVersion, 'manuscript', manuscriptFile);
        const supplementary: { name: string; key: string }[] = [];
        for (const f of files.supplementary || []) {
            supplementary.push({ name: f.originalname, key: await storeSubmissionFile(req.params.id, nextVersion, 'supp', f) });
        }

        await db.prepare(`
          INSERT INTO submission_versions (id, submission_id, version, manuscript_path, supplementary_json, response_to_reviewers)
          VALUES (?, ?, ?, ?, ?::jsonb, ?)
        `).run(newId('ver'), req.params.id, nextVersion, manuscriptPath, JSON.stringify(supplementary), req.body?.responseToReviewers || null);

        await db.prepare(`
          UPDATE submissions SET manuscript_path = ?, current_version = ?, round = ?, status = 'submitted',
            decision = NULL, updated_at = now() WHERE id = ?
        `).run(manuscriptPath, nextVersion, nextRound, req.params.id);

        res.json({ ok: true, version: nextVersion });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Author: my submissions.
app.get('/api/submissions/mine', requireRole(['author', 'editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const rows = await db.prepare(`
          SELECT s.*,
            (SELECT COUNT(*)::int FROM submission_reviews sr WHERE sr.submission_id = s.id) AS review_count
          FROM submissions s WHERE s.author_user_id = ? ORDER BY s.created_at DESC
        `).all(req.authUser!.userId);
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Submission detail. Owner + staff see everything; an assigned reviewer sees a blinded copy.
app.get('/api/submissions/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub) return res.status(404).json({ error: 'Not found' });
        const role = req.authUser!.role;
        const isOwner = sub.author_user_id === req.authUser!.userId;
        const isStaff = role === 'editor' || role === 'admin';
        let isReviewer = false;
        if (role === 'reviewer') {
            const a = await db.prepare('SELECT id FROM review_assignments WHERE submission_id = ? AND reviewer_user_id = ?').get(req.params.id, req.authUser!.userId);
            isReviewer = Boolean(a);
        }
        if (!isOwner && !isStaff && !isReviewer) return res.status(403).json({ error: 'Forbidden' });

        const settings = await getJournalSettings();
        const blinded = isReviewer && !isStaff && Boolean(settings.double_blind);

        // Reviews: staff + owner see submitted reviews (staff also see confidential notes + reviewer id).
        // Reviewers do not see peers' reviews.
        let reviews: any[] = [];
        if (isStaff) {
            reviews = await db.prepare(`
              SELECT sr.id, sr.recommendation, sr.comments_to_author, sr.comments_to_editor, sr.reviewer_user_id,
                     sr.score_originality, sr.score_rigor, sr.score_significance, sr.score_clarity, sr.created_at,
                     u.full_name AS reviewer_name
              FROM submission_reviews sr LEFT JOIN app_users u ON u.id = sr.reviewer_user_id
              WHERE sr.submission_id = ? ORDER BY sr.created_at
            `).all(req.params.id);
        } else if (isOwner) {
            reviews = await db.prepare(`
              SELECT id, recommendation, comments_to_author,
                     score_originality, score_rigor, score_significance, score_clarity, created_at
              FROM submission_reviews WHERE submission_id = ? ORDER BY created_at
            `).all(req.params.id);
        }

        const versions = await db.prepare(`
          SELECT id, version, manuscript_path, supplementary_json, response_to_reviewers, created_at
          FROM submission_versions WHERE submission_id = ? ORDER BY version
        `).all(req.params.id);

        // Author identities are hidden from a reviewer under double-blind.
        const authors = blinded ? [] : await db.prepare(`
          SELECT author_order, first_name, last_name, email, affiliation, orcid, is_corresponding
          FROM submission_authors WHERE submission_id = ? ORDER BY author_order
        `).all(req.params.id);

        // Assignment roster for the editor detail view.
        const assignments = isStaff ? await db.prepare(`
          SELECT ra.id, ra.status, ra.invited_at, ra.due_date, ra.responded_at, ra.round,
                 u.full_name AS reviewer_name, u.email AS reviewer_email,
                 (SELECT COUNT(*)::int FROM submission_reviews sr WHERE sr.assignment_id = ra.id) AS submitted
          FROM review_assignments ra LEFT JOIN app_users u ON u.id = ra.reviewer_user_id
          WHERE ra.submission_id = ? ORDER BY ra.invited_at
        `).all(req.params.id) : [];

        const payload: any = { ...sub, reviews, versions, authors, assignments, blinded };
        if (blinded) {
            // Strip anything that could deanonymize the author from a reviewer.
            payload.authors_json = null;
            payload.author_user_id = null;
            payload.cover_letter = null;
            payload.declarations = null;
        }
        res.json(payload);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Manuscript download (owner, assigned reviewer, or staff).
app.get('/api/submissions/:id/manuscript', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub || !sub.manuscript_path) return res.status(404).json({ error: 'No manuscript' });
        const role = req.authUser!.role;
        const isOwner = sub.author_user_id === req.authUser!.userId;
        const isStaff = role === 'editor' || role === 'admin';
        let isReviewer = false;
        if (role === 'reviewer') {
            const a = await db.prepare('SELECT id FROM review_assignments WHERE submission_id = ? AND reviewer_user_id = ?').get(req.params.id, req.authUser!.userId);
            isReviewer = Boolean(a);
        }
        if (!isOwner && !isStaff && !isReviewer) return res.status(403).json({ error: 'Forbidden' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="manuscript.pdf"');
        const stream = await objectStorage.getObjectStream(sub.manuscript_path);
        stream.on('error', (e: Error) => { if (!res.headersSent) res.status(500).json({ error: e.message }); else res.destroy(e); });
        stream.pipe(res);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Editor: submissions queue.
app.get('/api/editor/submissions', requireRole(['editor', 'admin']), async (_req, res) => {
    try {
        const rows = await db.prepare(`
          SELECT s.*, u.full_name AS author_name, u.email AS author_email,
            (SELECT COUNT(*)::int FROM review_assignments ra WHERE ra.submission_id = s.id) AS assigned_count,
            (SELECT COUNT(*)::int FROM review_assignments ra WHERE ra.submission_id = s.id AND ra.status = 'completed') AS completed_count,
            (SELECT COUNT(*)::int FROM submission_reviews sr WHERE sr.submission_id = s.id) AS review_count
          FROM submissions s JOIN app_users u ON u.id = s.author_user_id
          ORDER BY s.created_at DESC
        `).all();
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Editor: reviewers available to assign.
app.get('/api/editor/reviewers', requireRole(['editor', 'admin']), async (_req, res) => {
    try {
        const rows = await db.prepare(`SELECT id, username, full_name, email FROM app_users WHERE role = 'reviewer' ORDER BY full_name NULLS LAST, username`).all();
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Fetch the singleton journal settings (double-blind, deadlines, ISSN/DOI).
const getJournalSettings = async (): Promise<any> => {
    const s = await db.prepare('SELECT * FROM journal_settings WHERE id = 1').get();
    return s || { double_blind: true, review_due_days: 21, journal_name: 'Green Occasion', journal_acronym: 'go' };
};

// Editor: invite a reviewer (creates an assignment with a deadline + accept/decline token).
app.post('/api/editor/submissions/:id/assign', requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const { reviewerUserId, dueDays } = req.body || {};
        if (!reviewerUserId) return res.status(400).json({ error: 'reviewerUserId required' });
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub) return res.status(404).json({ error: 'Not found' });
        const settings = await getJournalSettings();
        const days = Number(dueDays) > 0 ? Number(dueDays) : (settings.review_due_days || 21);

        await db.prepare(`
          INSERT INTO review_assignments (id, submission_id, reviewer_user_id, round, assigned_by,
            status, invited_at, due_date, invite_token)
          VALUES (?, ?, ?, ?, ?, 'invited', now(), now() + make_interval(days => ?), ?)
          ON CONFLICT (submission_id, reviewer_user_id, round) DO NOTHING
        `).run(newId('asg'), req.params.id, reviewerUserId, sub.round, req.authUser!.userId, days, crypto.randomUUID());

        if (sub.status === 'submitted') {
            await db.prepare(`UPDATE submissions SET status = 'under_review', updated_at = now() WHERE id = ?`).run(req.params.id);
        }
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Editor: decision. accept -> publish to the public library.
app.post('/api/editor/submissions/:id/decision', requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const { decision, note } = req.body || {};
        if (!['accept', 'reject', 'desk_reject', 'minor', 'major'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' });
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub) return res.status(404).json({ error: 'Not found' });

        const status = decision === 'accept' ? 'accepted'
            : decision === 'reject' || decision === 'desk_reject' ? 'rejected'
            : 'revisions_requested';
        await db.prepare(`UPDATE submissions SET decision = ?, decision_note = ?, status = ?, updated_at = now() WHERE id = ?`)
            .run(decision, note || null, status, req.params.id);

        if (decision === 'accept') {
            const paperId = newId('paper');
            const topic = String(sub.keywords || '').split(',')[0]?.trim() || 'General Submission';
            await db.prepare(`
              INSERT INTO papers (id, title, abstract, topic, file_path, status, origin)
              VALUES (?, ?, ?, ?, ?, 'approved', 'original')
            `).run(paperId, sub.title, sub.abstract, topic, sub.manuscript_path || '');

            let authorsJson: any[] = [];
            try { authorsJson = sub.authors_json ? (typeof sub.authors_json === 'string' ? JSON.parse(sub.authors_json) : sub.authors_json) : []; } catch { /* ignore */ }
            if (!authorsJson.length) {
                const u = await db.prepare('SELECT full_name, email FROM app_users WHERE id = ?').get(sub.author_user_id) as any;
                if (u?.full_name) authorsJson = [{ name: u.full_name, email: u.email, affiliation: '' }];
            }
            for (const a of authorsJson) {
                if (!a?.name) continue;
                const authorId = newId('author');
                await db.prepare('INSERT INTO authors (id, name, institution, email) VALUES (?, ?, ?, ?)')
                    .run(authorId, a.name, a.affiliation || '', a.email || '');
                await db.prepare('INSERT INTO paper_authors (paper_id, author_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
                    .run(paperId, authorId);
            }
            await db.prepare(`UPDATE submissions SET status = 'published', published_paper_id = ?, published_at = now(), updated_at = now() WHERE id = ?`)
                .run(paperId, req.params.id);
        }
        res.json({ ok: true, status });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Editor: auto-drafted decision letter (pulls each reviewer's author-facing comments into a template).
app.get('/api/editor/submissions/:id/decision-letter', requireRole(['editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const decision = String(req.query.decision || 'minor');
        const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
        if (!sub) return res.status(404).json({ error: 'Not found' });
        const reviews = await db.prepare(`
          SELECT recommendation, comments_to_author FROM submission_reviews
          WHERE submission_id = ? ORDER BY created_at
        `).all(req.params.id) as any[];
        const settings = await getJournalSettings();

        const verdict: Record<string, string> = {
            accept: 'accept your manuscript for publication',
            minor: 'invite you to submit a minor revision',
            major: 'invite you to submit a major revision',
            reject: 'not proceed with your manuscript at this time',
            desk_reject: 'not send your manuscript out for review',
        };
        const lines: string[] = [];
        lines.push(`Dear Author,`);
        lines.push('');
        lines.push(`Thank you for submitting "${sub.title}" to ${settings.journal_name || 'Green Occasion'}.`);
        lines.push(`After consideration, we have decided to ${verdict[decision] || 'reach a decision'}.`);
        if (reviews.length) {
            lines.push('');
            lines.push('The reviewers provided the following comments:');
            reviews.forEach((r, i) => {
                lines.push('');
                lines.push(`Reviewer ${i + 1} (${r.recommendation}):`);
                lines.push(r.comments_to_author?.trim() || '(no comments to author)');
            });
        }
        lines.push('');
        lines.push('We look forward to your response.');
        lines.push('');
        lines.push('Kind regards,');
        lines.push('The Editorial Office');
        res.json({ draft: lines.join('\n') });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Reviewer: my assignments (with deadlines + overdue flag).
app.get('/api/reviewer/assignments', requireRole(['reviewer', 'editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const rows = await db.prepare(`
          SELECT ra.id AS assignment_id, ra.status AS assignment_status, ra.created_at,
                 ra.invited_at, ra.due_date, ra.responded_at,
                 (ra.due_date IS NOT NULL AND ra.due_date < now() AND ra.status <> 'completed') AS overdue,
                 s.id AS submission_id, s.title, s.abstract, s.article_type, s.status AS submission_status,
                 (SELECT COUNT(*)::int FROM submission_reviews sr WHERE sr.assignment_id = ra.id) AS reviewed
          FROM review_assignments ra JOIN submissions s ON s.id = ra.submission_id
          WHERE ra.reviewer_user_id = ? ORDER BY ra.due_date NULLS LAST, ra.created_at DESC
        `).all(req.authUser!.userId);
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Reviewer: accept or decline an invitation.
app.post('/api/reviewer/assignments/:id/respond', requireRole(['reviewer', 'editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const { accept } = req.body || {};
        const asg = await db.prepare('SELECT * FROM review_assignments WHERE id = ?').get(req.params.id) as any;
        if (!asg) return res.status(404).json({ error: 'Assignment not found' });
        if (req.authUser!.role === 'reviewer' && asg.reviewer_user_id !== req.authUser!.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const status = accept ? 'accepted' : 'declined';
        await db.prepare(`UPDATE review_assignments SET status = ?, responded_at = now() WHERE id = ?`).run(status, asg.id);
        res.json({ ok: true, status });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Reviewer: submit a review.
app.post('/api/reviewer/assignments/:id/review', requireRole(['reviewer', 'editor', 'admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const { recommendation, commentsToAuthor, commentsToEditor, scores } = req.body || {};
        if (!['accept', 'minor', 'major', 'reject'].includes(recommendation)) return res.status(400).json({ error: 'Invalid recommendation' });
        const asg = await db.prepare('SELECT * FROM review_assignments WHERE id = ?').get(req.params.id) as any;
        if (!asg) return res.status(404).json({ error: 'Assignment not found' });
        if (req.authUser!.role === 'reviewer' && asg.reviewer_user_id !== req.authUser!.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // Clamp rubric scores to 1-5 (or null).
        const clamp = (v: any) => (Number.isFinite(Number(v)) ? Math.min(5, Math.max(1, Math.round(Number(v)))) : null);
        const s = scores || {};
        await db.prepare(`
          INSERT INTO submission_reviews (id, assignment_id, submission_id, reviewer_user_id, recommendation,
            comments_to_author, comments_to_editor, score_originality, score_rigor, score_significance, score_clarity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(newId('rev'), asg.id, asg.submission_id, req.authUser!.userId, recommendation,
            commentsToAuthor || null, commentsToEditor || null,
            clamp(s.originality), clamp(s.rigor), clamp(s.significance), clamp(s.clarity));
        await db.prepare(`UPDATE review_assignments SET status = 'completed', responded_at = COALESCE(responded_at, now()) WHERE id = ?`).run(asg.id);
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Journal settings: editors + admins read; admins update (double-blind, deadlines, ISSN/DOI).
app.get('/api/journal/settings', requireRole(['editor', 'admin']), async (_req, res) => {
    try { res.json(await getJournalSettings()); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/journal/settings', requireRole(['admin']), async (req, res) => {
    try {
        const b = req.body || {};
        await db.prepare(`
          UPDATE journal_settings SET
            double_blind = COALESCE(?, double_blind),
            review_due_days = COALESCE(?, review_due_days),
            journal_name = COALESCE(?, journal_name),
            journal_acronym = COALESCE(?, journal_acronym),
            issn_print = COALESCE(?, issn_print),
            issn_online = COALESCE(?, issn_online),
            doi_prefix = COALESCE(?, doi_prefix),
            updated_at = now()
          WHERE id = 1
        `).run(
            typeof b.doubleBlind === 'boolean' ? b.doubleBlind : null,
            Number.isFinite(Number(b.reviewDueDays)) ? Number(b.reviewDueDays) : null,
            b.journalName ?? null, b.journalAcronym ?? null,
            b.issnPrint ?? null, b.issnOnline ?? null, b.doiPrefix ?? null,
        );
        res.json(await getJournalSettings());
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public journal metadata (by slug) — powers each front-end's heading, title, and theme.
app.get('/api/journal-site', async (req, res) => {
    try {
        const slug = String(req.query.slug || '').trim();
        if (!slug) return res.status(400).json({ error: 'slug is required' });
        const j = await db.prepare(`
          SELECT name, slug, description, acronym, theme, issn_print, issn_online, doi_prefix
          FROM journals WHERE slug = ? AND status = 'active'
        `).get(slug);
        if (!j) return res.status(404).json({ error: 'Journal not found' });
        res.json(j);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Hard-delete a paper and its dependents (no ON DELETE CASCADE in the schema).
const deletePaperCascade = async (paperId: string) => {
    await db.prepare('DELETE FROM paper_comment_moderation_logs WHERE paper_id = ?').run(paperId);
    await db.prepare('DELETE FROM paper_comments WHERE paper_id = ?').run(paperId);
    await db.prepare('DELETE FROM reviews WHERE paper_id = ?').run(paperId);
    await db.prepare('DELETE FROM paper_authors WHERE paper_id = ?').run(paperId);
    await db.prepare('DELETE FROM paper_versions WHERE paper_id = ?').run(paperId);
    await db.prepare('DELETE FROM papers WHERE id = ?').run(paperId);
};

// Change a paper's topic and/or journal (admin). journalId '' or null => staging.
app.patch('/api/admin/papers/:id', requireRole(['admin']), async (req, res) => {
    try {
        const { topic, journalId, origin } = req.body || {};
        const paper = await db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id);
        if (!paper) return res.status(404).json({ error: 'Paper not found' });
        if (typeof topic === 'string' && topic.trim()) {
            await db.prepare('UPDATE papers SET topic = ? WHERE id = ?').run(topic.trim(), req.params.id);
        }
        if (origin === 'original' || origin === 'aggregated') {
            await db.prepare('UPDATE papers SET origin = ? WHERE id = ?').run(origin, req.params.id);
        }
        if (journalId !== undefined) {
            const jid = journalId ? String(journalId) : null;
            if (jid) {
                const j = await db.prepare('SELECT id FROM journals WHERE id = ?').get(jid);
                if (!j) return res.status(400).json({ error: 'Target journal not found' });
            }
            await db.prepare('UPDATE papers SET journal_id = ? WHERE id = ?').run(jid, req.params.id);
        }
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Delete a single paper (admin).
app.delete('/api/admin/papers/:id', requireRole(['admin']), async (req, res) => {
    try {
        const paper = await db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id);
        if (!paper) return res.status(404).json({ error: 'Paper not found' });
        await deletePaperCascade(req.params.id);
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Call-for-Papers leads (inbound author interest from the public popup) ──
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: an author expresses interest via the site popup. Stores the lead and
// notifies the editorial inbox (if a mail provider is configured).
app.post('/api/author-leads', async (req, res) => {
    try {
        const { name, email, phone, affiliation, interest, message, journalSlug } = req.body || {};
        if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'A valid email is required.' });

        let journalId: string | null = null;
        if (journalSlug) {
            const j = await db.prepare('SELECT id FROM journals WHERE slug = ?').get(String(journalSlug)) as any;
            journalId = j?.id ?? null;
        }

        const id = newId('lead');
        await db.prepare(`
          INSERT INTO author_leads (id, name, email, phone, affiliation, interest, message, journal_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name ? String(name).trim() : null, String(email).trim(),
            phone ? String(phone).trim() : null,
            affiliation ? String(affiliation).trim() : null,
            interest ? String(interest).trim() : null,
            message ? String(message).trim() : null,
            journalId);

        // Fire-and-forget notification — never blocks the author's response.
        const safe = (s: string) => String(s || '').replace(/[<>]/g, '');
        sendMail({
            to: notifyEmail(),
            subject: `New author interest${name ? `: ${safe(name)}` : ''}`,
            replyTo: String(email).trim(),
            html: `<h2>New author interest</h2>
              <p><b>Name:</b> ${safe(name) || '—'}</p>
              <p><b>Email:</b> ${safe(email)}</p>
              <p><b>Phone:</b> ${safe(phone) || '—'}</p>
              <p><b>Affiliation:</b> ${safe(affiliation) || '—'}</p>
              <p><b>Area of interest:</b> ${safe(interest) || '—'}</p>
              <p><b>Message:</b> ${safe(message) || '—'}</p>
              <p style="color:#888">Captured from the site's "Publish with us" widget.</p>`,
        }).catch(() => { /* logged in mailer */ });

        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: list inbound leads.
app.get('/api/admin/author-leads', requireRole(['admin']), async (_req, res) => {
    try {
        const leads = await db.prepare(`
          SELECT l.*, j.name AS journal_name
          FROM author_leads l LEFT JOIN journals j ON j.id = l.journal_id
          ORDER BY l.created_at DESC
        `).all();
        res.json({ leads, mailerConfigured: isMailerConfigured() });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: start the contact-harvest job (extracts corresponding-author emails from
// stored OA PDFs into author_contacts). Background job — never runs inline here.
app.post('/api/admin/authors/harvest-contacts', requireRole(['admin']), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.body?.limit) || 25, 1), 100);
        const job = await createJob({
            type: JOB_TYPE.HARVEST_CONTACTS,
            payload: { limit, requestedAt: new Date().toISOString(), runNonce: crypto.randomUUID() },
        });
        await enqueueJob(job.id);
        res.status(202).json({ jobId: job.id, status: job.status });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: send a test email and return the real result (surfaces SMTP errors inline
// instead of only in the server logs). Used to verify provider config.
app.post('/api/admin/mailer/test', requireRole(['admin']), async (req, res) => {
    try {
        const to = (req.body?.to && EMAIL_RE.test(String(req.body.to))) ? String(req.body.to) : notifyEmail();
        const result = await sendMail({
            to,
            subject: 'The Carbon Review — SMTP test',
            html: '<p>This is a test email. If you received it, outbound email is configured correctly.</p>',
        });
        res.json({ ...result, configured: isMailerConfigured(), to });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err.message, configured: isMailerConfigured() });
    }
});

// Admin: harvested corresponding-author emails (with the author they belong to).
app.get('/api/admin/author-contacts', requireRole(['admin']), async (_req, res) => {
    try {
        const contacts = await db.prepare(`
          SELECT c.id, c.value AS email, c.source, c.confidence, c.captured_at,
                 a.name AS author_name, a.institution, a.orcid
          FROM author_contacts c JOIN authors a ON a.id = c.author_id
          WHERE c.contact_type = 'email'
          ORDER BY c.captured_at DESC
        `).all();
        res.json({ contacts });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: update a lead's outreach status.
app.patch('/api/admin/author-leads/:id', requireRole(['admin']), async (req, res) => {
    try {
        const { status } = req.body || {};
        const allowed = ['new', 'contacted', 'onboarded', 'archived'];
        if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
        await db.prepare('UPDATE author_leads SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: email a lead an invitation to submit (or a custom message). Marks 'contacted'.
app.post('/api/admin/author-leads/:id/email', requireRole(['admin']), async (req, res) => {
    try {
        const lead = await db.prepare(`
          SELECT l.*, j.name AS journal_name
          FROM author_leads l LEFT JOIN journals j ON j.id = l.journal_id
          WHERE l.id = ?
        `).get(req.params.id) as any;
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const journalName = lead.journal_name || JOURNAL_NAME;
        const greeting = lead.name ? `Dear ${String(lead.name).replace(/[<>]/g, '')}` : 'Dear Researcher';
        const subject = String(req.body?.subject || `Invitation to submit to ${journalName}`);
        const bodyHtml = req.body?.message
            ? textToHtml(String(req.body.message))
            : `${greeting},<br/><br/>
               Thank you for your interest in publishing with <b>${journalName}</b>, an open-access,
               peer-reviewed journal on climate change, carbon, and the sustainable-future transition.<br/><br/>
               We'd be glad to consider an original research article, review, or perspective from you.
               You can register and submit through our platform, and we're happy to answer any questions
               on scope, format, or timelines — simply reply to this email.<br/><br/>
               Warm regards,<br/>The Editorial Team`;
        const html = renderBrandedEmail({
            journalName,
            heading: req.body?.message ? undefined : `Invitation to submit to ${journalName}`,
            bodyHtml,
            cta: { label: 'Register & Submit', url: REGISTER_URL },
            cta2: { label: 'Browse the journal', url: SUBMIT_URL },
        });

        const result = await sendMail({ to: lead.email, subject, html, replyTo: notifyEmail() });
        if (result.ok) {
            await db.prepare(`UPDATE author_leads SET status = 'contacted' WHERE id = ? AND status = 'new'`).run(req.params.id);
        }
        res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: bulk outreach — paste comma/newline-separated emails, send each an
// individual branded email (register + submit CTAs). Capped to the daily quota.
app.post('/api/admin/outreach/send', requireRole(['admin']), async (req, res) => {
    try {
        const { emails, subject, message, includeCta } = req.body || {};
        if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Subject is required.' });
        if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required.' });

        const parsed = String(emails || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
        const valid = Array.from(new Set(parsed)).filter((e) => EMAIL_RE.test(e));
        if (valid.length === 0) return res.status(400).json({ error: 'No valid email addresses found.' });

        const CAP = 100; // aligns with the free provider daily quota
        const capped = valid.slice(0, CAP);
        const bodyHtml = textToHtml(String(message));
        const html = renderBrandedEmail({
            journalName: JOURNAL_NAME,
            heading: String(subject),
            bodyHtml,
            cta: includeCta === false ? undefined : { label: 'Register & Submit a Paper', url: REGISTER_URL },
            cta2: includeCta === false ? undefined : { label: 'Explore the journal', url: SUBMIT_URL },
        });

        let sent = 0;
        const failures: Array<{ email: string; error: string }> = [];
        // Small concurrency to stay responsive without hammering the provider.
        for (let i = 0; i < capped.length; i += 5) {
            const batch = capped.slice(i, i + 5);
            const results = await Promise.all(batch.map((email) =>
                sendMail({ to: email, subject: String(subject), html, replyTo: notifyEmail() }).then((r) => ({ email, r }))
            ));
            for (const { email, r } of results) {
                if (r.ok) sent += 1;
                else failures.push({ email, error: r.skipped ? 'email not configured' : (r.error || 'failed') });
            }
        }

        res.json({ total: valid.length, attempted: capped.length, sent, failed: failures.length, failures, cappedAt: valid.length > CAP ? CAP : null });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Journals (multi-journal foundation) ──
const slugify = (s: string) =>
    String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'journal';

// List journals (any authenticated user — authors pick one to submit to). With counts.
app.get('/api/journals', requireAuth, async (_req, res) => {
    try {
        const rows = await db.prepare(`
          SELECT j.*,
            (SELECT COUNT(*)::int FROM papers p WHERE p.journal_id = j.id) AS paper_count,
            (SELECT COUNT(*)::int FROM submissions s WHERE s.journal_id = j.id) AS submission_count,
            (SELECT COUNT(*)::int FROM topics t WHERE t.journal_id = j.id AND t.parent_id IS NULL) AS topic_count
          FROM journals j ORDER BY j.created_at
        `).all();
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Journal detail: journal + its topic tree + associated authors. (staff)
app.get('/api/journals/:id', requireRole(['editor', 'admin']), async (req, res) => {
    try {
        const journal = await db.prepare('SELECT * FROM journals WHERE id = ?').get(req.params.id) as any;
        if (!journal) return res.status(404).json({ error: 'Not found' });
        const topics = await db.prepare(`
          SELECT id, name, slug, parent_id FROM topics WHERE journal_id = ? ORDER BY parent_id NULLS FIRST, name
        `).all(req.params.id);
        const authors = await db.prepare(`
          SELECT DISTINCT u.id, u.full_name, u.email,
            (SELECT COUNT(*)::int FROM submissions s2 WHERE s2.author_user_id = u.id AND s2.journal_id = ?) AS submissions
          FROM submissions s JOIN app_users u ON u.id = s.author_user_id
          WHERE s.journal_id = ? ORDER BY u.full_name NULLS LAST
        `).all(req.params.id, req.params.id);
        // Papers mapped into this journal, so the admin can see topics and the papers under each.
        const papers = await db.prepare(`
          SELECT id, title, topic, status, origin FROM papers
          WHERE journal_id = ? ORDER BY topic NULLS LAST, created_at DESC
        `).all(req.params.id);
        res.json({ ...journal, topics, authors, papers });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Create a journal (admin).
app.post('/api/journals', requireRole(['admin']), async (req, res) => {
    try {
        const { name, description, acronym, issnPrint, issnOnline, doiPrefix, status, theme } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Journal name is required.' });
        let slug = slugify(name);
        const exists = await db.prepare('SELECT 1 FROM journals WHERE slug = ?').get(slug);
        if (exists) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
        const id = newId('jrnl');
        await db.prepare(`
          INSERT INTO journals (id, name, slug, description, acronym, issn_print, issn_online, doi_prefix, status, theme)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, String(name).trim(), slug, description || null, acronym || null,
            issnPrint || null, issnOnline || null, doiPrefix || null, status === 'draft' ? 'draft' : 'active',
            theme || 'default');
        res.json({ id, slug });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update a journal (admin).
app.put('/api/journals/:id', requireRole(['admin']), async (req, res) => {
    try {
        const b = req.body || {};
        await db.prepare(`
          UPDATE journals SET
            name = COALESCE(?, name), description = COALESCE(?, description), acronym = COALESCE(?, acronym),
            issn_print = COALESCE(?, issn_print), issn_online = COALESCE(?, issn_online),
            doi_prefix = COALESCE(?, doi_prefix), status = COALESCE(?, status), theme = COALESCE(?, theme),
            updated_at = now()
          WHERE id = ?
        `).run(b.name ?? null, b.description ?? null, b.acronym ?? null, b.issnPrint ?? null,
            b.issnOnline ?? null, b.doiPrefix ?? null, b.status ?? null, b.theme ?? null, req.params.id);
        res.json(await db.prepare('SELECT * FROM journals WHERE id = ?').get(req.params.id));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Staging pool: ingested/scraped papers not yet mapped to a journal, grouped by topic.
// This is the "central staging table categorized by topic."
app.get('/api/staging/topics', requireRole(['admin']), async (_req, res) => {
    try {
        const rows = await db.prepare(`
          SELECT p.topic,
            COUNT(*)::int AS paper_count,
            COUNT(*) FILTER (WHERE p.status = 'approved')::int AS approved_count
          FROM papers p
          WHERE p.journal_id IS NULL AND p.topic IS NOT NULL AND p.topic <> ''
          GROUP BY p.topic ORDER BY paper_count DESC
        `).all();
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Map a staged topic into a journal: ports every unmapped paper with that topic into the
// journal (sets journal_id) and registers the topic in the journal's managed topic tree.
app.post('/api/journals/:id/map-topic', requireRole(['admin']), async (req, res) => {
    try {
        const body = req.body || {};
        // Accept a single `topic` or a `topics` array (bulk mapping).
        const rawArr: unknown[] = Array.isArray(body.topics) ? body.topics : (body.topic != null ? [body.topic] : []);
        const topics = [...new Set(rawArr.map((t) => String(t).trim()).filter(Boolean))];
        if (!topics.length) return res.status(400).json({ error: 'At least one topic is required' });
        const journal = await db.prepare('SELECT id FROM journals WHERE id = ?').get(req.params.id);
        if (!journal) return res.status(404).json({ error: 'Journal not found' });

        let moved = 0;
        for (const topic of topics) {
            const result = await db.prepare(`
              UPDATE papers SET journal_id = ? WHERE topic = ? AND journal_id IS NULL
            `).run(req.params.id, topic);
            moved += (result as any)?.rowCount ?? (result as any)?.changes ?? 0;
            await db.prepare(`
              INSERT INTO topics (id, name, slug, journal_id, parent_id)
              VALUES (?, ?, ?, ?, NULL)
              ON CONFLICT (journal_id, parent_id, slug) DO NOTHING
            `).run(newId('topic'), topic, slugify(topic), req.params.id);
        }
        res.json({ ok: true, moved, topics: topics.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Delete a journal: its papers/submissions return to staging (journal_id NULL); topics removed.
app.delete('/api/journals/:id', requireRole(['admin']), async (req, res) => {
    try {
        if (req.params.id === 'jrnl_green_occasion') {
            return res.status(400).json({ error: 'The default journal cannot be deleted.' });
        }
        const journal = await db.prepare('SELECT id FROM journals WHERE id = ?').get(req.params.id);
        if (!journal) return res.status(404).json({ error: 'Not found' });
        await db.prepare('UPDATE papers SET journal_id = NULL WHERE journal_id = ?').run(req.params.id);
        await db.prepare('UPDATE submissions SET journal_id = NULL WHERE journal_id = ?').run(req.params.id);
        await db.prepare('DELETE FROM topics WHERE journal_id = ?').run(req.params.id);
        await db.prepare('DELETE FROM journals WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Rename a topic within a journal (admin). Rewrites papers.topic; renaming to an existing
// topic merges them. Deterministic curation — no AI.
app.put('/api/journals/:id/topics/rename', requireRole(['admin']), async (req, res) => {
    try {
        const from = String(req.body?.from || '').trim();
        const to = String(req.body?.to || '').trim();
        if (!from || !to) return res.status(400).json({ error: 'Both `from` and `to` are required.' });
        if (from === to) return res.json({ ok: true, moved: 0 });
        const journal = await db.prepare('SELECT id FROM journals WHERE id = ?').get(req.params.id);
        if (!journal) return res.status(404).json({ error: 'Journal not found' });

        const result = await db.prepare(`
          UPDATE papers SET topic = ? WHERE journal_id = ? AND topic = ?
        `).run(to, req.params.id, from);
        const moved = (result as any)?.rowCount ?? (result as any)?.changes ?? 0;

        // Update the managed topic row (drop the old name, ensure the new one exists).
        await db.prepare('DELETE FROM topics WHERE journal_id = ? AND name = ? AND parent_id IS NULL').run(req.params.id, from);
        await db.prepare(`
          INSERT INTO topics (id, name, slug, journal_id, parent_id)
          VALUES (?, ?, ?, ?, NULL) ON CONFLICT (journal_id, parent_id, slug) DO NOTHING
        `).run(newId('topic'), to, slugify(to), req.params.id);

        res.json({ ok: true, moved });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Delete a topic within a journal AND its papers (admin).
app.delete('/api/journals/:id/topics', requireRole(['admin']), async (req, res) => {
    try {
        const topic = String(req.body?.topic || '').trim();
        if (!topic) return res.status(400).json({ error: 'topic is required' });
        const rows = await db.prepare('SELECT id FROM papers WHERE journal_id = ? AND topic = ?').all(req.params.id, topic) as any[];
        for (const row of rows) await deletePaperCascade(row.id);
        await db.prepare('DELETE FROM topics WHERE journal_id = ? AND name = ?').run(req.params.id, topic);
        res.json({ ok: true, deleted: rows.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Add a topic or subtopic to a journal (admin). parentId set = subtopic.
app.post('/api/journals/:id/topics', requireRole(['admin']), async (req, res) => {
    try {
        const { name, parentId } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ error: 'Topic name is required.' });
        const journal = await db.prepare('SELECT id FROM journals WHERE id = ?').get(req.params.id);
        if (!journal) return res.status(404).json({ error: 'Journal not found' });
        const id = newId('topic');
        await db.prepare(`
          INSERT INTO topics (id, name, slug, journal_id, parent_id)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (journal_id, parent_id, slug) DO NOTHING
        `).run(id, String(name).trim(), slugify(name), req.params.id, parentId || null);
        res.json({ id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: user + role management (promote authors to reviewer/editor).
app.get('/api/admin/users', requireRole(['admin']), async (_req, res) => {
    try {
        const rows = await db.prepare('SELECT id, username, full_name, email, role, status, created_at FROM app_users ORDER BY (status = \'pending\') DESC, created_at DESC').all();
        res.json(rows);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users/:id/role', requireRole(['admin']), async (req, res) => {
    try {
        const { role } = req.body || {};
        if (!['admin', 'editor', 'reviewer', 'author'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
        await db.prepare('UPDATE app_users SET role = ? WHERE id = ?').run(role, req.params.id);
        res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin: approve or reject a pending self-registered account.
app.post('/api/admin/users/:id/approval', requireRole(['admin']), async (req, res) => {
    try {
        const { approve } = req.body || {};
        const status = approve ? 'approved' : 'rejected';
        await db.prepare('UPDATE app_users SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ ok: true, status });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

const startServer = async () => {
    try {
        await schemaReady;
        await ensureDefaultAdminUser();

        // Inline jobs run in this process; a restart/redeploy/sleep can orphan an
        // in-flight job as "running". Nothing is actually running at boot, so fail
        // any leftover queued/running jobs instead of letting them poll forever.
        const reaped = await reapInterruptedJobs();
        if (reaped > 0) {
            console.log(`[Jobs] Marked ${reaped} interrupted job(s) as failed on startup.`);
        }

        // Serve the built admin SPA. Vite outputs to <project>/frontend/dist; this file
        // lives in <project>/backend/. The public reading site is a separate project
        // (see ../web) hosted elsewhere (usually a CDN/Cloudflare Pages).
        const adminDir = path.join(__dirname, '..', 'frontend', 'dist');
        if (fs.existsSync(adminDir)) {
            app.use(express.static(adminDir));
            app.get(/^(?!\/api).*/, (_req, res) => {
                res.sendFile(path.join(adminDir, 'index.html'));
            });
        }

        app.listen(PORT, () => {
            console.log(`Backend API Server running on port ${PORT}`);
        });
    } catch (err: any) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
};

startServer();
