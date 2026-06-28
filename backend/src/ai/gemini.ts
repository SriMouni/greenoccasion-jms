import { GoogleGenAI } from '@google/genai';
import { FIELDS, OTHER_FIELD } from '../topics/field-classifier.ts';

export type PaperAnalysis = {
  summary: string;
  shortSummary: string;
  highlights: string[];
  field: string;
  tags: string[];
  significance: string;
  qualityScore: number;
};

// Thrown when the provider returns a 429/quota error so callers can stop a batch early.
export class QuotaExceededError extends Error {
  constructor(message = 'Gemini quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

const getApiKey = () =>
  process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || '';

export const isAiEnabled = (): boolean => Boolean(getApiKey());

const ALLOWED_FIELDS = [...FIELDS.map((f) => f.field), OTHER_FIELD];

const buildPrompt = (input: { title: string; text: string }) => `You are an expert research librarian. Analyse the academic paper below and return STRICT JSON only (no markdown), matching this shape:
{
  "summary": "a clear, neutral 150-220 word summary of the paper",
  "shortSummary": "one or two sentences, max 40 words",
  "highlights": ["5 to 10 of the single most important sentences, copied VERBATIM and exactly as they appear in the text"],
  "field": "exactly one of: ${ALLOWED_FIELDS.join(' | ')}",
  "tags": ["5 to 8 short topical keyword tags (1-3 words each), Title Case"],
  "significance": "one plain-language sentence on why this paper matters / its real-world impact",
  "qualityScore": 0
}

Rules:
- "highlights" MUST be exact substrings of the provided text (do not paraphrase) so they can be located and highlighted.
- Choose the single best "field" for the paper's primary subject.
- "qualityScore" is an integer 0-100 reflecting clarity, methodological rigor, and relevance to environmental science.
- Output JSON only.

TITLE: ${input.title}

TEXT:
${input.text}`;

const coerceAnalysis = (raw: unknown): PaperAnalysis | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const shortSummary = typeof obj.shortSummary === 'string' ? obj.shortSummary.trim() : '';
  const highlights = Array.isArray(obj.highlights)
    ? obj.highlights.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => h.trim())
    : [];
  const fieldRaw = typeof obj.field === 'string' ? obj.field.trim() : '';
  const field = ALLOWED_FIELDS.includes(fieldRaw) ? fieldRaw : OTHER_FIELD;

  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()).slice(0, 8)
    : [];
  const significance = typeof obj.significance === 'string' ? obj.significance.trim() : '';
  const scoreNum = Number(obj.qualityScore);
  const qualityScore = Number.isFinite(scoreNum) ? Math.min(100, Math.max(0, Math.round(scoreNum))) : 0;

  if (!summary && highlights.length === 0) return null;
  return { summary, shortSummary, highlights, field, tags, significance, qualityScore };
};

const stripCodeFence = (text: string) =>
  text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

/**
 * Run the one-time Gemini analysis for a paper. Returns null if AI is disabled
 * (no key) or the call fails — callers treat that as "not analysed".
 */
export const analyzePaperText = async (input: {
  title: string;
  text: string;
}): Promise<PaperAnalysis | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  if (!input.text || input.text.trim().length < 40) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GENAI_MODEL || 'gemini-2.5-flash';
    const request = {
      model,
      contents: buildPrompt(input),
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    };

    let response;
    try {
      response = await ai.models.generateContent(request);
    } catch (firstErr) {
      // Free-tier per-minute limits / transient unavailability: back off once and retry.
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 8000));
        response = await ai.models.generateContent(request);
      } else {
        throw firstErr;
      }
    }

    const text = (response.text || '').trim();
    if (!text) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = JSON.parse(stripCodeFence(text));
    }
    return coerceAnalysis(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
      throw new QuotaExceededError(msg);
    }
    console.error('Gemini analysis failed:', msg);
    return null;
  }
};
