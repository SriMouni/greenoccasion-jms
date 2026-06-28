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

type StatCard = {
  label: string;
  value: number;
  icon: typeof Briefcase;
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

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
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
      fetchJson<unknown>('/api/admin/pending'),
      fetchJson<unknown>('/api/papers'),
    ]);
    const aiStatus = await fetch('/api/ai/status').then((r) => r.json()).catch(() => ({ enabled: false }));
    setJobs(jobsData);
    setPendingCount(pending.length);
    setApprovedCount(approved.length);
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

  const stats: StatCard[] = [
    { label: 'Active Jobs', value: activeJobs, icon: Activity },
    { label: 'Pending Approvals', value: pendingCount, icon: Inbox },
    { label: 'Approved Papers', value: approvedCount, icon: FileCheck },
    { label: 'Total Jobs', value: jobs.length, icon: Briefcase },
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest p-5 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]"
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
                      <td className="px-6 py-4 font-mono text-xs text-on-surface-variant" title={job.id}>
                        {shortId(job.id)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-on-surface">
                        {humanizeJobType(job.type)}
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-on-surface-variant">
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
              Generate summaries, highlights and field classification for un-analyzed papers.
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
    </div>
  );
};
