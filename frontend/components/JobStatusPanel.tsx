import { useEffect,useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Loader2, PauseCircle, XCircle } from 'lucide-react';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_manual_review';

export type JobStatusResponse = {
  id: string;
  type: string;
  status: JobStatus;
  progress: number | null;
  message: string | null;
  errorText: string | null;
  result?: Record<string, unknown> | null;
};

type JobStatusPanelProps = {
  jobId: string;
  title?: string;
  onCompleted?: (job: JobStatusResponse) => void;
};

const TERMINAL_STATUSES = new Set<JobStatus>([
  'completed',
  'failed',
  'cancelled',
  'waiting_manual_review',
]);

const POLL_INTERVAL_MS = 3000;

const getStatusIcon = (status?: JobStatus) => {
  if (status === 'completed') return <CheckCircle className="w-4 h-4" />;
  if (status === 'failed') return <XCircle className="w-4 h-4" />;
  if (status === 'cancelled' || status === 'waiting_manual_review') return <PauseCircle className="w-4 h-4" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin" />;
  return <Clock className="w-4 h-4" />;
};

const getStatusClassName = (status?: JobStatus) => {
  if (status === 'completed') return 'bg-green-100 text-green-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  if (status === 'cancelled' || status === 'waiting_manual_review') return 'bg-yellow-100 text-yellow-800';
  return 'bg-blue-100 text-blue-800';
};

const formatStatus = (status?: JobStatus) => {
  if (!status) return 'Loading';
  return status.replace(/_/g, ' ');
};

export const JobStatusPanel = ({ jobId, title = 'Job Status', onCompleted }: JobStatusPanelProps) => {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState('');
  const completedJobIdRef = useRef('');

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | undefined;

    const pollJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);

        if (!res.ok) {
          throw new Error('Failed to load job status.');
        }

        const data = (await res.json()) as JobStatusResponse;

        if (!isMounted) return;

        setJob(data);
        setError('');
         if (data.status === 'completed' && completedJobIdRef.current !== data.id) {
          completedJobIdRef.current = data.id;
          onCompleted?.(data);
         }

        if (!TERMINAL_STATUSES.has(data.status)) {
          timeoutId = window.setTimeout(pollJob, POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error(err);

        if (!isMounted) return;

        setError('Could not load job status.');
        timeoutId = window.setTimeout(pollJob, POLL_INTERVAL_MS);
      }
    };

    setJob(null);
    setError('');
    completedJobIdRef.current = '';
    pollJob();

    return () => {
      isMounted = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [jobId, onCompleted]);

  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted">{title}</p>
          <h3 className="text-xl font-bold text-[black]">Job {jobId}</h3>
          {job?.message && <p className="text-sm text-muted">{job.message}</p>}
        </div>

        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold capitalize ${getStatusClassName(
            job?.status
          )}`}
        >
          {getStatusIcon(job?.status)}
          {formatStatus(job?.status)}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-bold text-muted uppercase tracking-wider">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-[black] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {job?.errorText && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          {job.errorText}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
};