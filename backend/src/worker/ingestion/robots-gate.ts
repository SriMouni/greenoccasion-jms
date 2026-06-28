/**
 * robots.txt gate + per-host politeness for the PDF download step.
 *
 * We do not crawl — we fetch individual open-access PDFs by direct URL. This module
 * makes that fetch a good web citizen:
 *   - checks the target host's robots.txt before downloading (cached per host),
 *   - honors Disallow rules and Crawl-delay for our bot token (and `*`),
 *   - enforces a minimum delay between requests to the same host,
 *   - fails safe: any uncertainty (server error / unreachable robots) => disallow,
 *     so the caller falls back to metadata-only rather than forcing a download.
 *
 * Trusted open-access hosts that serve via APIs / dedicated OA endpoints skip the
 * robots round-trip entirely.
 */

const BOT_TOKEN = 'GreenOccasionBot';

const PDF_FETCH_CONTACT =
  process.env.INGEST_CONTACT_EMAIL ||
  process.env.UNPAYWALL_EMAIL ||
  process.env.OPENALEX_MAILTO ||
  '';

export const INGEST_USER_AGENT = PDF_FETCH_CONTACT
  ? `${BOT_TOKEN}/1.0 (+https://greenoccasion.org/contact; mailto:${PDF_FETCH_CONTACT})`
  : `${BOT_TOKEN}/1.0 (+https://greenoccasion.org/contact)`;

/** Minimum spacing between requests to the same host (2s default; their guidance: 2-5s). */
const DEFAULT_CRAWL_DELAY_MS = Number(process.env.INGEST_CRAWL_DELAY_MS || 2000);

/** Trusted OA hosts (suffix match) — APIs / OA repositories that we may fetch directly. */
const ALLOWLISTED_HOST_SUFFIXES = [
  'arxiv.org',
  'ncbi.nlm.nih.gov', // PubMed Central
  'europepmc.org',
  'ebi.ac.uk',
  'doaj.org',
  'openalex.org',
  'semanticscholar.org',
  'unpaywall.org',
  'crossref.org',
];

type RobotsRules = {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
};

const DISALLOW_ALL: RobotsRules = { disallow: ['/'], allow: [], crawlDelayMs: null };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isAllowlistedHost = (hostname: string) =>
  ALLOWLISTED_HOST_SUFFIXES.some(
    suffix => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );

/** Compile a robots path pattern (supporting `*` wildcard and trailing `$`) to a regex. */
const compileRule = (pattern: string): RegExp => {
  let body = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      body += '.*';
    } else if (char === '$' && i === pattern.length - 1) {
      body += '$';
    } else {
      body += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${body}`);
};

type RobotsGroup = { agents: string[]; disallow: string[]; allow: string[]; crawlDelay: number | null };

const parseRobots = (text: string): RobotsRules => {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group (per the robots spec).
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (!current) continue;

    if (field === 'disallow') current.disallow.push(value);
    else if (field === 'allow') current.allow.push(value);
    else if (field === 'crawl-delay') {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds)) current.crawlDelay = seconds * 1000;
    }
  }

  // Prefer a group naming our bot; else fall back to the wildcard group.
  const token = BOT_TOKEN.toLowerCase();
  const specific = groups.find(group => group.agents.includes(token));
  const wildcard = groups.find(group => group.agents.includes('*'));
  const selected = specific ?? wildcard;

  if (!selected) return { disallow: [], allow: [], crawlDelayMs: null };

  return {
    disallow: selected.disallow,
    allow: selected.allow,
    crawlDelayMs: selected.crawlDelay,
  };
};

const isPathAllowed = (rules: RobotsRules, path: string): boolean => {
  let longestDisallow = -1;
  let longestAllow = -1;

  for (const rule of rules.disallow) {
    if (rule === '') continue; // empty Disallow means "allow everything"
    if (compileRule(rule).test(path)) longestDisallow = Math.max(longestDisallow, rule.length);
  }
  for (const rule of rules.allow) {
    if (rule === '') continue;
    if (compileRule(rule).test(path)) longestAllow = Math.max(longestAllow, rule.length);
  }

  if (longestDisallow === -1) return true;
  // Most-specific rule wins; Allow wins ties (Google's convention).
  return longestAllow >= longestDisallow;
};

const robotsCache = new Map<string, Promise<RobotsRules | null>>();

const loadRobots = async (origin: string): Promise<RobotsRules | null> => {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': INGEST_USER_AGENT },
      redirect: 'follow',
    });
    if (response.status >= 500) return DISALLOW_ALL; // server trouble => be conservative
    if (!response.ok) return null; // 404/410 etc => no robots => allow all
    return parseRobots(await response.text());
  } catch {
    return DISALLOW_ALL; // unreachable => be conservative
  }
};

const getRobotsForOrigin = (origin: string): Promise<RobotsRules | null> => {
  let cached = robotsCache.get(origin);
  if (!cached) {
    cached = loadRobots(origin);
    robotsCache.set(origin, cached);
  }
  return cached;
};

export type RobotsDecision = { allowed: boolean; crawlDelayMs: number };

/** Decide whether we may fetch `urlStr`, and how long to space requests to its host. */
export const checkRobots = async (urlStr: string): Promise<RobotsDecision> => {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { allowed: false, crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };
  }

  if (isAllowlistedHost(url.hostname)) {
    return { allowed: true, crawlDelayMs: 0 };
  }

  const rules = await getRobotsForOrigin(url.origin);
  if (!rules) return { allowed: true, crawlDelayMs: DEFAULT_CRAWL_DELAY_MS };

  const allowed = isPathAllowed(rules, `${url.pathname}${url.search}`);
  const crawlDelayMs =
    rules.crawlDelayMs != null
      ? Math.max(rules.crawlDelayMs, DEFAULT_CRAWL_DELAY_MS)
      : DEFAULT_CRAWL_DELAY_MS;

  return { allowed, crawlDelayMs };
};

const hostNextAvailableAt = new Map<string, number>();

/** Block until enough time has passed since the last request to this host. */
export const waitForHostSlot = async (urlStr: string, crawlDelayMs: number): Promise<void> => {
  if (crawlDelayMs <= 0) return;

  let host: string;
  try {
    host = new URL(urlStr).host;
  } catch {
    return;
  }

  const now = Date.now();
  const earliest = hostNextAvailableAt.get(host) ?? 0;
  const waitMs = Math.max(0, earliest - now);
  // Reserve this host's next slot before yielding so concurrent callers serialize.
  hostNextAvailableAt.set(host, Math.max(now, earliest) + crawlDelayMs);

  if (waitMs > 0) await sleep(waitMs);
};
