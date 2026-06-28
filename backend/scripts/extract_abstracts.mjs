import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { closePool, ensureLibrarySchema, pool } from './postgres_db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../uploads');
const papersDir = path.resolve(__dirname, '../papers');

const PLACEHOLDER_ABSTRACT = 'Abstract unavailable in index.';

function cleanupAbstract(text) {
    let abstract = text.replace(/\n\s*\n/g, '\n\n').replace(/([^\n])\n([^\n])/g, '$1 $2');
    abstract = abstract.replace(/\s+/g, ' ').trim();
    if (abstract.length > 800) {
        abstract = `${abstract.substring(0, 797)}...`;
    }
    return abstract;
}

function findLikelyAbstract(rawText) {
    const lowerText = rawText.toLowerCase();
    const abstractIdx = lowerText.indexOf('abstract');

    if (abstractIdx !== -1) {
        const start = abstractIdx + 'abstract'.length;
        const candidate = rawText.substring(start, start + 2500);
        const lowerCandidate = candidate.toLowerCase();
        const introIdx = lowerCandidate.indexOf('introduction');
        const keywordsIdx = lowerCandidate.indexOf('keywords');

        let endIdx = candidate.length;
        if (introIdx !== -1) endIdx = Math.min(endIdx, introIdx);
        if (keywordsIdx !== -1) endIdx = Math.min(endIdx, keywordsIdx);

        return cleanupAbstract(candidate.substring(0, endIdx).trim());
    }

    return cleanupAbstract(rawText.substring(0, 1000).trim());
}

async function extractFromPdf(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });

    try {
        const data = await parser.getText();
        return findLikelyAbstract(data.text || '');
    } catch (e) {
        console.error('Error parsing', filePath, e.message);
        return null;
    } finally {
        await parser.destroy();
    }
}

function getArgValue(name) {
    const index = process.argv.findIndex((arg) => arg === name);
    return index !== -1 ? process.argv[index + 1] : null;
}

async function loadPapersNeedingAbstracts() {
    const paperIdFilter = getArgValue('--paper-id');
    const fileNameOverride = getArgValue('--file-name') || getArgValue('--pdf-filename');

    if (paperIdFilter && fileNameOverride) {
        return [{ id: paperIdFilter, file_path: fileNameOverride }];
    }

    if (paperIdFilter) {
        const result = await pool.query('SELECT id, file_path FROM papers WHERE id = $1', [paperIdFilter]);
        return result.rows;
    }

    const result = await pool.query(
        "SELECT id, file_path FROM papers WHERE abstract = $1 OR abstract = ''",
        [PLACEHOLDER_ABSTRACT]
    );
    return result.rows;
}

async function run() {
    try {
        await ensureLibrarySchema();
        const papers = await loadPapersNeedingAbstracts();

        console.log(`Found ${papers.length} papers needing abstracts.`);

        let updated = 0;

        for (const p of papers) {
            const uploadPath = path.join(uploadDir, p.file_path);
            const paperPath = path.join(papersDir, p.file_path.replace(/^seed-/, ''));
            const fullPath = fs.existsSync(uploadPath) ? uploadPath : paperPath;

            if (fs.existsSync(fullPath)) {
                console.log(`Extracting for ${fullPath}...`);
                const abstract = await extractFromPdf(fullPath);
                if (abstract && abstract.trim() !== '') {
                    await pool.query(
                        'UPDATE papers SET abstract = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [abstract.trim(), p.id]
                    );
                    console.log(`Updated paper ${p.id} with abstract.`);
                    updated += 1;
                }
            } else {
                console.log(`File not found: ${fullPath}`);
            }
        }

        console.log(`Abstract extraction complete. Updated ${updated} paper(s).`);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        await closePool();
    }
}

run();
