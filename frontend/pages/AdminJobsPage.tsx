import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Loader2, Plus } from 'lucide-react';

type Job = {
  id: string;
  type: string;
  status: string;
  progress: number | null;
  result_json: any;
  error_text: string | null;
  created_at: string;
  updated_at: string;
};

const JOB_TYPE_LABELS: Record<string, string> = {
  discover_subtopics: 'Discovery',
  ingest_papers: 'Ingestion',
};

const humanizeType = (type: string) =>
  JOB_TYPE_LABELS[type] ||
  type.split(/[_\s]+/).map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p)).join(' ');

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

const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const resultSummary = (job: Job): string => {
  const r = job.result_json;
  if (!r || typeof r !== 'object') return job.error_text ? 'Error' : '—';
  if (job.type === 'ingest_papers') {
    return `${r.insertedCount ?? 0} new · ${r.downloadedCount ?? 0} PDFs · ${r.skippedCount ?? 0} skipped`;
  }
  if (job.type === 'discover_subtopics') {
    return `${r.savedSubtopicCount ?? r.candidateCount ?? 0} subtopics`;
  }
  return '—';
};

export const AdminJobsPage = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/jobs?limit=100')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setJobs(Array.isArray(d) ? d : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-4xl font-bold text-on-surface">Jobs</h1>
          <p className="text-on-surface-variant">All discovery and ingestion jobs, most recent first.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <History className="w-4 h-4" /> Refresh
          </button>
          <Link
            to="/admin/collection"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-on-primary px-5 py-2.5 text-sm font-bold hover:bg-primary-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> New Discovery Job
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest shadow-[0px_4px_20px_rgba(45,45,45,0.05)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-on-surface-variant border-b border-outline-variant">
              <th className="px-6 py-3 font-semibold">Job ID</th>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Result</th>
              <th className="px-6 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant">
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading jobs…</span>
              </td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant italic font-serif">No jobs yet.</td></tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-on-surface-variant" title={job.id}>{job.id.slice(0, 12)}…</td>
                  <td className="px-6 py-4 font-semibold text-on-surface">{humanizeType(job.type)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[job.status] ?? 'bg-surface-container-high text-on-surface-variant'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[job.status] ?? 'bg-outline'}`} />
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant">
                    {job.status === 'failed' && job.error_text ? (
                      <span className="text-error" title={job.error_text}>
                        {job.error_text.length > 70 ? `${job.error_text.slice(0, 70)}…` : job.error_text}
                      </span>
                    ) : (
                      resultSummary(job)
                    )}
                  </td>
                  <td className="px-6 py-4 text-on-surface-variant whitespace-nowrap">{formatDate(job.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
