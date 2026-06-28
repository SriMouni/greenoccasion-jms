import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_manual_review';

type StatusResponse = {
  id: string;
  status: JobStatus;
  progress: number | null;
  message: string | null;
  result: Record<string, unknown> | null;
  errorText: string | null;
};

type JobEvent = {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  created_at: string;
};

const TERMINAL = new Set<JobStatus>(['completed', 'failed', 'cancelled', 'waiting_manual_review']);
const POLL_MS = 2000;

const levelColor = (level: string) =>
  level === 'error' ? 'text-error' : level === 'warn' ? 'text-amber-600' : 'text-on-surface-variant';

const dot = (level: string) =>
  level === 'error' ? 'bg-error' : level === 'warn' ? 'bg-amber-500' : 'bg-secondary';

export const JobEventsPanel = ({ jobId, title, onDone }: { jobId: string; title: string; onDone?: () => void }) => {
  const [job, setJob] = useState<StatusResponse | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const doneRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    doneRef.current = false;

    const poll = async () => {
      try {
        const [statusRes, eventsRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}/status`).then((r) => r.json()),
          fetch(`/api/jobs/${jobId}/events`).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (!mounted) return;
        setJob(statusRes);
        setEvents(Array.isArray(eventsRes) ? eventsRes : []);

        if (!TERMINAL.has(statusRes.status)) {
          timer = window.setTimeout(poll, POLL_MS);
        } else if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      } catch {
        if (mounted) timer = window.setTimeout(poll, POLL_MS);
      }
    };

    setJob(null);
    setEvents([]);
    poll();
    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, onDone]);

  const progress = Math.min(100, Math.max(0, job?.progress ?? 0));
  const status = job?.status;
  const result = (job?.result || {}) as Record<string, any>;

  const icon =
    status === 'completed' ? <CheckCircle className="h-4 w-4 text-secondary" />
    : status === 'failed' ? <XCircle className="h-4 w-4 text-error" />
    : <Loader2 className="h-4 w-4 animate-spin text-primary" />;

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(45,45,45,0.05)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-on-surface">{title}</h3>
        </div>
        <span className="text-xs font-semibold text-on-surface-variant capitalize">{status?.replace(/_/g, ' ') || 'starting'}</span>
      </div>

      <div className="h-2 rounded-full bg-surface-container overflow-hidden mb-2">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-on-surface-variant mb-4">{job?.message || 'Queued…'} · {progress}%</p>

      {status === 'completed' && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {Object.entries(result)
            .filter(([k]) => /count|downloaded|processed|failed|attempted|remaining|reached/i.test(k))
            .map(([k, v]) => (
              <span key={k} className="rounded-full bg-surface-container px-2.5 py-1 font-semibold text-on-surface-variant">
                {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()}: {String(v)}
              </span>
            ))}
        </div>
      )}

      {job?.errorText && (
        <p className="mb-3 flex items-center gap-2 text-sm text-error"><AlertCircle className="h-4 w-4" /> {job.errorText}</p>
      )}

      {events.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-outline-variant/60 divide-y divide-outline-variant/40">
          {events.map((e) => (
            <div key={e.id} className="flex items-start gap-2 px-3 py-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot(e.level)}`} />
              <p className={`text-xs leading-relaxed ${levelColor(e.level)}`}>{e.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
