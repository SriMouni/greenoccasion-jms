import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

// Resolve a stored paper file_path (a storage key) to an absolute local path.
const resolveLocalPdf = (storedPath: string | null | undefined): string | null => {
  if (!storedPath || typeof storedPath !== 'string') return null;
  if (storedPath.startsWith('metadata-only')) return null;

  const baseDir = path.resolve(process.env.PDF_STORAGE_DIR || './uploads');
  const candidates = [
    path.resolve(baseDir, storedPath),
    path.resolve(baseDir, path.basename(storedPath)),
    path.resolve(process.cwd(), storedPath),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
};

/**
 * Extract plain text from a stored PDF. Returns null when no local PDF is available
 * (e.g. metadata-only papers) so callers can fall back to the abstract.
 */
export const extractPdfText = async (
  storedPath: string | null | undefined,
  maxChars = 60000
): Promise<string | null> => {
  const localPath = resolveLocalPdf(storedPath);
  if (!localPath) return null;

  const parser = new PDFParse({ data: fs.readFileSync(localPath) });
  try {
    const data = await parser.getText();
    const text = (data.text || '').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
    return text ? text.slice(0, maxChars) : null;
  } catch (err) {
    console.error('PDF text extraction failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    await parser.destroy();
  }
};
