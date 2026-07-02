import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { JobEventsPanel } from '../components/JobEventsPanel';
import {
  Activity,
  BadgeCheck,
  Briefcase,
  Download,
  FileCheck,
  Inbox,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';

type Job = {
  id: string;
  type: string;
  status: string;
  progress: number | null;
  result_json: unknown;
  error_text: string | null;
  created_at: string;
  updated_at: string;
};

type Paper = {
  id: string;
  title: string;
  field_label?: string | null;
  ai_field?: string | null;
  ai_processed_at?: string | null;
};

type StatCard = {
  label: string;
  value: number | string;
  icon: typeof Briefcase;
  hint?: string;
  onClick?: () => void;
};

const JOB_TYPE_LABELS: Record<string, string> = {
  discover_subtopics: 'Discovery',
  ingest_papers: 'Ingestion',
};

const humanizeJobType = (type: string) =>
  JOB_TYPE_LABELS[type] ||
  type
    .split(/[_\s]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');

const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-secondary-container text-on-secondary-container',
  queued: 'bg-secondary-container text-on-secondary-container',
  completed: 'bg-surface-container-high text-on-surface-variant',
  failed: 'bg-error-container text-on-error-container',
};

const STATUS_DOT: Record<string, string> = {
  running: 'bg-primary',
  queued: 'bg-primary',
  completed: 'bg-outline',
  failed: 'bg-error',
};

const formatRelative = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

const fetchJson = async <T,>(url: string): Promise<T[]> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
};

const SYSTEM_SERVICES = [
  { name: 'OpenAlex API', status: 'Operational' },
  { name: 'Semantic Scholar', status: 'Operational' },
  { name: 'Local File Storage', status: 'Operational' },
];

// Public site origin (for linking to a paper). Set VITE_PUBLIC_SITE_URL in the build.
const PUBLIC_SITE = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '');

// Slide-over drawer listing papers by AI status (completed / pending).
type PaperFilter = 'review' | 'all' | 'completed' | 'pending';

const PapersDrawer = ({
  approved,
  pendingApprovals,
  filter,
  setFilter,
  onClose,
}: {
  approved: Paper[];
  pendingApprovals: Paper[];
  filter: PaperFilter;
  setFilter: (f: PaperFilter) => void;
  onClose: () => void;
}) => {
  const completed = approved.filter((p) => p.ai_processed_at);
  const pendingAi = approved.filter((p) => !p.ai_processed_at);

  const tabs: { key: PaperFilter; label: string; count: number }[] = [
    { key: 'review', label: 'Awaiting Review', count: pendingApprovals.length },
    { key: 'all', label: 'Approved', count: approved.length },
    { key: 'completed', label: 'AI Done', count: completed.length },
    { key: 'pending', label: 'Pending AI', count: pendingAi.length },
  ];

  const isReview = filter === 'review';
  const list =
    filter === 'review'
      ? pendingApprovals
      : filter === 'all'
        ? approved
        : filter === 'completed'
          ? completed
          : pendingAi;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-surface-container-lowest shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6 py-4">
          <h2 className="font-serif text-xl font-bold text-on-surface">Papers</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === t.key
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {isReview && pendingApprovals.length > 0 && (
          <div className="px-6 pb-2">
            <Link
              to="/admin/review"
              onClick={onClose}
              className="text-xs font-bold text-primary hover:text-primary-dark"
            >
              Open Review Queue →
            </Link>
          </div>
        )}

        <ul className="divide-y divide-outline-variant/60">
          {list.length === 0 ? (
            <li className="px-6 py-10 text-center font-serif italic text-on-surface-variant">
              No papers in this state.
            </li>
          ) : (
            list.map((p) => (
              <li key={p.id} className="px-6 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {!isReview && PUBLIC_SITE ? (
                      <a
                        href={`${PUBLIC_SITE}/paper/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-sm font-semibold text-on-surface hover:text-primary"
                      >
                        {p.title}
                      </a>
                    ) : (
                      <span className="line-clamp-2 text-sm font-semibold text-on-surface">{p.title}</span>
                    )}
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {p.field_label || p.ai_field || '—'}
                    </p>
                  </div>
                  {isReview ? (
                    <span className="shrink-0 rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold text-on-error-container">
                      review
                    </span>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        p.ai_processed_at
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {p.ai_processed_at ? 'AI ✓' : 'pending'}
                    </span>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingPapers, setPendingPapers] = useState<Paper[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperFilter, setPaperFilter] = useState<PaperFilter | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStarting, setAiStarting] = useState(false);
  const [pdfStarting, setPdfStarting] = useState(false);
  const [enrichStarting, setEnrichStarting] = useState(false);
  const [aiJobId, setAiJobId] = useState('');
  const [pdfJobId, setPdfJobId] = useState('');
  const [enrichJobId, setEnrichJobId] = useState('');
  const [maintError, setMaintError] = useState('');

  const startJob = async (
    url: string,
    setStarting: (v: boolean) => void,
    setJobId: (v: string) => void
  ) => {
    setStarting(true);
    setMaintError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMaintError(data?.error || 'Could not start the job.');
        return;
      }
      const jobId = data.jobId || data.id;
      if (jobId) setJobId(jobId);
    } catch {
      setMaintError('Request failed.');
    } finally {
      setStarting(false);
    }
  };

  const backfillPdfs = () => startJob('/api/admin/papers/backfill-pdfs', setPdfStarting, setPdfJobId);
  const runAiAnalysis = () => startJob('/api/admin/ai/analyze-pending', setAiStarting, setAiJobId);
  const enrichAuthors = () => startJob('/api/admin/authors/enrich', setEnrichStarting, setEnrichJobId);

  const refresh = useCallback(async () => {
    const [jobsData, pending, approved] = await Promise.all([
      fetchJson<Job>('/api/jobs?limit=20'),
      fetchJson<Paper>('/api/admin/pending'),
      fetchJson<Paper>('/api/papers'),
    ]);
    const aiStatus = await fetch('/api/ai/status').then((r) => r.json()).catch(() => ({ enabled: false }));
    setJobs(jobsData);
    setPendingCount(pending.length);
    setPendingPapers(pending);
    setPapers(approved);
    setAiEnabled(Boolean(aiStatus?.enabled));
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const activeJobs = jobs.filter(
    (job) => job.status === 'running' || job.status === 'queued'
  ).length;

  const approvedCount = papers.length;
  const aiCompleted = papers.filter((p) => p.ai_processed_at).length;
  const aiPending = approvedCount - aiCompleted;

  const stats: StatCard[] = [
    { label: 'Active Jobs', value: activeJobs, icon: Activity },
    {
      label: 'Pending Approvals',
      value: pendingCount,
      icon: Inbox,
      hint: pendingCount > 0 ? 'click to view' : undefined,
      onClick: () => setPaperFilter('review'),
    },
    {
      label: 'Approved Papers',
      value: approvedCount,
      icon: FileCheck,
      hint: approvedCount > 0 ? 'click to view' : undefined,
      onClick: () => setPaperFilter('all'),
    },
    {
      label: 'AI Processed',
      value: `${aiCompleted} / ${approvedCount}`,
      icon: Sparkles,
      hint: approvedCount === 0 ? undefined : aiPending > 0 ? `${aiPending} pending — click` : 'all done — click',
      onClick: () => setPaperFilter(aiPending > 0 ? 'pending' : 'completed'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-4xl font-bold text-on-surface">System Overview</h1>
          <p className="text-on-surface-variant max-w-2xl">
            Monitoring editorial production and scholarly automated workflows.
          </p>
        </div>
        <Link
          to="/admin/collection"
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-3 text-sm font-bold hover:bg-primary-dark transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Discovery Job
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              onClick={stat.onClick}
              role={stat.onClick ? 'button' : undefined}
              tabIndex={stat.onClick ? 0 : undefined}
              className={`rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(45,45,45,0.05)] ${
                stat.onClick ? 'cursor-pointer hover:border-primary hover:shadow-md transition-all' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-on-surface-variant">
                  {stat.label}
                </p>
                <Icon className="w-4 h-4 text-on-surface-variant" />
              </div>
              <p className="mt-3 font-serif text-4xl font-bold text-primary">
                {loading ? '—' : stat.value}
              </p>
              {stat.hint && !loading && (
                <p className="mt-1 text-xs font-semibold text-on-surface-variant">{stat.hint}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Jobs */}
        <div className="lg:col-span-8 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">
                Recent Jobs
              </h2>
            </div>
            <Link to="/admin/jobs" className="text-xs font-semibold text-primary hover:text-primary-dark">
              View all
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant border-b border-outline-variant">
                  <th className="px-6 py-3 font-semibold">Job ID</th>
                  <th className="px-6 py-3 font-semibold">Type</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/60">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-on-surface-variant">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading jobs…
                      </span>
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-on-surface-variant italic font-serif">
                      No jobs yet. Start a discovery job to begin.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-on-surface-variant align-top" title={job.id}>
                        {shortId(job.id)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-on-surface align-top">
                        {humanizeJobType(job.type)}
                        {job.status === 'failed' && job.error_text && (
                          <div
                            className="mt-0.5 max-w-[240px] truncate text-xs font-normal text-error"
                            title={job.error_text}
                          >
                            {job.error_text}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                            STATUS_BADGE[job.status] ?? 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              STATUS_DOT[job.status] ?? 'bg-outline'
                            }`}
                          />
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant align-top">
                        {formatRelative(job.updated_at || job.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-6">
          {/* System Health */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">
                System Health
              </h2>
            </div>
            <ul className="space-y-3">
              {SYSTEM_SERVICES.map((service) => (
                <li key={service.name} className="flex items-center justify-between text-sm">
                  <span className="text-on-surface">{service.name}</span>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {service.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Approval Queue */}
          <div className="rounded-lg bg-primary text-on-primary p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-on-primary/70">
              Approval Queue
            </p>
            <p className="mt-2 font-serif text-5xl font-bold">{loading ? '—' : pendingCount}</p>
            <p className="text-sm text-on-primary/80 mt-1">
              {pendingCount === 1 ? 'paper' : 'papers'} awaiting review
            </p>
            <Link
              to="/admin/review"
              className="mt-5 inline-flex items-center justify-center gap-2 w-full rounded-lg bg-white text-primary px-4 py-3 text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Process Next
            </Link>
          </div>

          {/* AI Analysis */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">AI Analysis</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-4">
              {aiCompleted} of {approvedCount} papers analyzed
              {aiPending > 0 ? ` · ${aiPending} pending.` : ' · all done.'}
              {aiEnabled ? '' : ' (Set GOOGLE_GENAI_API_KEY to enable.)'}
            </p>
            <button
              type="button"
              onClick={runAiAnalysis}
              disabled={!aiEnabled || aiStarting}
              className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-on-primary px-4 py-3 text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiStarting ? 'Starting…' : 'Analyze Pending Papers'}
            </button>
          </div>

          {/* PDF Library */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">PDF Library</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-4">
              Re-try downloading full-text PDFs for existing metadata-only papers (OA locations, arXiv, PMC, Unpaywall).
            </p>
            <button
              type="button"
              onClick={backfillPdfs}
              disabled={pdfStarting}
              className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-on-primary px-4 py-3 text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfStarting ? 'Starting…' : 'Download Missing PDFs'}
            </button>
          </div>

          {/* Author Intelligence */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">Author Intelligence</h2>
            </div>
            <p className="text-sm text-on-surface-variant mb-4">
              Enrich authors with verified ORCID identities and ROR-normalized affiliations (via OpenAlex).
            </p>
            <button
              type="button"
              onClick={enrichAuthors}
              disabled={enrichStarting}
              className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-on-primary px-4 py-3 text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enrichStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
              {enrichStarting ? 'Starting…' : 'Enrich Authors'}
            </button>
          </div>
        </div>
      </div>

      {/* Live maintenance job panels (progress + per-item event log) */}
      {maintError && (
        <p className="text-sm text-error">{maintError}</p>
      )}
      {(aiJobId || pdfJobId || enrichJobId) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pdfJobId && (
            <JobEventsPanel jobId={pdfJobId} title="PDF Download Job" onDone={refresh} />
          )}
          {aiJobId && (
            <JobEventsPanel jobId={aiJobId} title="AI Analysis Job" onDone={refresh} />
          )}
          {enrichJobId && (
            <JobEventsPanel jobId={enrichJobId} title="Author Enrichment Job" onDone={refresh} />
          )}
        </div>
      )}

      {paperFilter && (
        <PapersDrawer
          approved={papers}
          pendingApprovals={pendingPapers}
          filter={paperFilter}
          setFilter={setPaperFilter}
          onClose={() => setPaperFilter(null)}
        />
      )}
    </div>
  );
};
