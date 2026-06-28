import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { closePool, ensureLibrarySchema, withTransaction } from './postgres_db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const papersDir = path.resolve(__dirname, '../papers');
const uploadDir = path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const indexPath = path.join(papersDir, 'index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`Seed failed: ${indexPath} not found.`);
  process.exit(1);
}

const papersData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
const PLACEHOLDER_ABSTRACT = 'Abstract unavailable in index.';

function normalizeDate(raw) {
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

async function findExistingPaperId(client, paper) {
  const existing = await client.query(
    `
      SELECT id FROM papers
      WHERE (($1 <> '' AND doi = $1) OR title = $2)
      LIMIT 1
    `,
    [paper.doi || '', paper.title]
  );

  return existing.rows[0]?.id;
}

function copySeedPdf(paper) {
  const originalPdfName = paper.pdfPath.split('\\').pop() || paper.pdfPath.split('/').pop();
  const sourcePdfPath = path.join(papersDir, originalPdfName);
  const targetFileName = `seed-${originalPdfName}`;

  if (!fs.existsSync(sourcePdfPath)) {
    console.log(`Warning: Local PDF not found for ${paper.title}`);
    return targetFileName;
  }

  const targetPath = path.join(uploadDir, targetFileName);
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePdfPath, targetPath);
    console.log(`Copied PDF: ${targetFileName}`);
  }

  return targetFileName;
}

async function upsertPaper(client, paper, paperId, targetFileName) {
  const createdAt = normalizeDate(`${paper.published}T00:00:00Z`);

  await client.query(
    `
      INSERT INTO papers (id, title, abstract, topic, file_path, status, created_at, doi, license_url)
      VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      paperId,
      paper.title,
      PLACEHOLDER_ABSTRACT,
      'Climate Policy',
      targetFileName,
      createdAt,
      paper.doi,
      paper.licenseUrl,
    ]
  );

  await client.query(
    `
      UPDATE papers
      SET title = $1,
          abstract = CASE
            WHEN abstract = 'Abstract unavailable in index.' OR abstract = '' THEN $2
            ELSE abstract
          END,
          topic = $3,
          file_path = $4,
          status = 'approved',
          created_at = COALESCE(created_at, $5),
          doi = COALESCE(NULLIF(doi, ''), $6),
          license_url = COALESCE(NULLIF(license_url, ''), $7),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `,
    [
      paper.title,
      PLACEHOLDER_ABSTRACT,
      'Climate Policy',
      targetFileName,
      createdAt,
      paper.doi,
      paper.licenseUrl,
      paperId,
    ]
  );
}

async function linkAuthors(client, paperId, authors) {
  for (const authorName of authors) {
    const authorId = stableId('A', authorName.trim().toLowerCase());

    await client.query(
      `
        INSERT INTO authors (id, name, institution, email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `,
      [authorId, authorName, 'Independent Researcher', 'contact@open-carbon.org']
    );

    await client.query(
      `
        INSERT INTO paper_authors (paper_id, author_id)
        VALUES ($1, $2)
        ON CONFLICT (paper_id, author_id) DO NOTHING
      `,
      [paperId, authorId]
    );
  }
}

async function seedPapers(client) {
  for (const paper of papersData) {
    const paperKey = `${paper.doi || ''}|${paper.title}`;
    const generatedPaperId = stableId('P', paperKey);
    const targetFileName = copySeedPdf(paper);
    const paperId = (await findExistingPaperId(client, paper)) || generatedPaperId;

    await upsertPaper(client, paper, paperId, targetFileName);
    await linkAuthors(client, paperId, paper.authors);
  }
}

async function run() {
  try {
    await ensureLibrarySchema();
    console.log('PostgreSQL schema is ready.');
    await withTransaction(seedPapers);
    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

run();
