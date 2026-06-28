import { type FormEvent, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  DownloadCloud,
  Eye,
  FileWarning,
  FolderOpen,
  ListChecks,
  Loader2,
  ScrollText,
  Search,
  X,
} from 'lucide-react';
import { JobStatusPanel, type JobStatusResponse } from '../components/JobStatusPanel';

const MIN_TOPIC_LENGTH = 2;
const MAX_SELECTED_SUBTOPICS = 6;

type Subtopic = {
  id: string;
  name: string;
  normalizedName: string;
  provider: string;
  providerTopicId: string | null;
  paperCount: number;
  sourceCount: number;
  confidence: number | string;
  evidence: Record<string, unknown> | null;
};

type LicensePolicy = 'auto_allowed' | 'conditional_review' | 'unknown_review' | 'blocked';

type LicensePreviewRow = {
  licenseName: string;
  paperCount: number;
  policy: LicensePolicy;
  requiresManualReview: boolean;
  reason: string;
};

type LicensePreviewResponse = {
  discoveryJobId: string;
  selectedSubtopicCount: number;
  estimatedPaperCount: number;
  licenses: LicensePreviewRow[];
};

type SkippedRecord = {
  id: string;
  provider: string;
  title: string | null;
  doi: string | null;
  sourceUrl: string | null;
  reason: string;
  rawError: string | null;
};

const policyLabels: Record<LicensePolicy, string> = {
  auto_allowed: 'Auto allowed',
  conditional_review: 'Manual review',
  unknown_review: 'Unknown review',
  blocked: 'Blocked',
};

const policyBadgeClasses: Record<LicensePolicy, string> = {
  auto_allowed: 'bg-green-50 text-green-700 border-green-200',
  conditional_review: 'bg-amber-50 text-amber-700 border-amber-200',
  unknown_review: 'bg-orange-50 text-orange-700 border-orange-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
};

const policyBuckets: LicensePolicy[] = [
  'auto_allowed',
  'conditional_review',
  'unknown_review',
  'blocked',
];

const STEPS = [
  { id: 1, label: 'Discover', icon: Search, hint: 'Search a topic' },
  { id: 2, label: 'Subtopics', icon: ListChecks, hint: 'Pick areas' },
  { id: 3, label: 'Licenses', icon: ScrollText, hint: 'Review policy' },
  { id: 4, label: 'Ingest', icon: DownloadCloud, hint: 'Collect papers' },
  { id: 5, label: 'Results', icon: CheckCircle, hint: 'Review outcome' },
] as const;

const REASON_LABELS: Record<string, string> = {
  provider_topic_missing: 'Provider topic ID missing',
  provider_fetch_failed: 'Provider fetch failed',
  license_blocked: 'License blocked',
  license_conditional_review: 'License needs manual review',
  license_unknown_review: 'License unknown',
  paper_ingest_failed: 'Paper ingest failed',
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const formatConfidence = (value: number | string) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0%';
  return `${Math.round(numericValue * 100)}%`;
};

const toCount = (result: Record<string, unknown> | null | undefined, key: string) => {
  const value = result?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
};

const getFullySelectedPolicyBuckets = (
  licenses: LicensePreviewRow[],
  selectedLicenseNames: string[]
) => {
  return policyBuckets.filter(policy => {
    const matchingLicenses = licenses
      .filter(license => license.policy === policy)
      .map(license => license.licenseName);

    return matchingLicenses.length > 0 &&
      matchingLicenses.every(licenseName => selectedLicenseNames.includes(licenseName));
  });
};

export const AdminCollectionPage = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeJobId, setActiveJobId] = useState('');
  const [activeJobTitle, setActiveJobTitle] = useState('Discovery Job');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [selectedSubtopicIds, setSelectedSubtopicIds] = useState<string[]>([]);
  const [activeSubtopic, setActiveSubtopic] = useState<Subtopic | null>(null);
  const [isLoadingSubtopics, setIsLoadingSubtopics] = useState(false);
  const [subtopicError, setSubtopicError] = useState('');

  const [licensePreview, setLicensePreview] = useState<LicensePreviewResponse | null>(null);
  const [selectedLicenseNames, setSelectedLicenseNames] = useState<string[]>([]);
  const [selectedPolicyBuckets, setSelectedPolicyBuckets] = useState<LicensePolicy[]>([]);
  const [isLoadingLicensePreview, setIsLoadingLicensePreview] = useState(false);
  const [licenseError, setLicenseError] = useState('');

  // Ingest options + state
  const [perPage, setPerPage] = useState(10);
  const [downloadFiles, setDownloadFiles] = useState(true);
  const [isStartingIngest, setIsStartingIngest] = useState(false);
  const [ingestError, setIngestError] = useState('');
  const [ingestJobId, setIngestJobId] = useState('');
  const [ingestResult, setIngestResult] = useState<Record<string, unknown> | null>(null);
  const [skippedRecords, setSkippedRecords] = useState<SkippedRecord[]>([]);

  const validateTopic = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return 'Topic is required.';
    if (trimmedValue.length < MIN_TOPIC_LENGTH) return 'Topic must be at least 2 characters.';
    return '';
  };

  const readJobId = async (res: Response) => {
    const data = (await res.json()) as { jobId?: string; id?: string };
    return data.jobId || data.id || '';
  };

  const resetLicenseState = useCallback(() => {
    setLicensePreview(null);
    setSelectedLicenseNames([]);
    setSelectedPolicyBuckets([]);
    setIsLoadingLicensePreview(false);
    setLicenseError('');
  }, []);

  const resetDownstream = useCallback(() => {
    setSubtopics([]);
    setSelectedSubtopicIds([]);
    setActiveSubtopic(null);
    setSubtopicError('');
    setIngestJobId('');
    setIngestResult(null);
    setSkippedRecords([]);
    setIngestError('');
    resetLicenseState();
  }, [resetLicenseState]);

  const loadSubtopics = useCallback(async (jobId: string) => {
    setIsLoadingSubtopics(true);
    setSubtopicError('');
    resetLicenseState();

    try {
      const res = await fetch(`/api/subtopics?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error('Subtopics request failed.');

      const data = (await res.json()) as Subtopic[];
      setSubtopics(data);
      setSelectedSubtopicIds([]);
      setActiveSubtopic(data[0] ?? null);
      if (data.length > 0) setStep(2);
    } catch (err) {
      console.error(err);
      setSubtopicError('Could not load discovered subtopics.');
    } finally {
      setIsLoadingSubtopics(false);
    }
  }, [resetLicenseState]);

  const handleDiscoveryCompleted = useCallback((job: JobStatusResponse) => {
    loadSubtopics(job.id);
  }, [loadSubtopics]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTopic = topic.trim();
    const validationError = validateTopic(trimmedTopic);
    setMessage('');

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsSubmitting(true);
    resetDownstream();

    try {
      const res = await fetch('/api/jobs/discover-subtopics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicText: trimmedTopic }),
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/admin/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Discovery request failed.');

      const jobId = await readJobId(res);
      if (!jobId) throw new Error('Discovery endpoint did not return a job id.');

      setActiveJobId(jobId);
      setActiveJobTitle(`Discovery: ${trimmedTopic}`);
      setMessage(`Discovery started for "${trimmedTopic}".`);
    } catch (err) {
      console.error(err);
      setError('Could not start discovery. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSubtopicSelection = (subtopicId: string) => {
    setSubtopicError('');
    resetLicenseState();

    if (selectedSubtopicIds.includes(subtopicId)) {
      setSelectedSubtopicIds(selectedSubtopicIds.filter(id => id !== subtopicId));
      return;
    }

    if (selectedSubtopicIds.length >= MAX_SELECTED_SUBTOPICS) {
      setSubtopicError(`Select up to ${MAX_SELECTED_SUBTOPICS} subtopics.`);
      return;
    }

    setSelectedSubtopicIds([...selectedSubtopicIds, subtopicId]);
  };

  const handlePreviewLicenses = async () => {
    if (!activeJobId) {
      setSubtopicError('Run a discovery job before previewing licenses.');
      return;
    }

    if (selectedSubtopicIds.length === 0) {
      setSubtopicError('Select at least one subtopic before previewing licenses.');
      return;
    }

    setIsLoadingLicensePreview(true);
    setLicenseError('');

    try {
      const res = await fetch('/api/licenses/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discoveryJobId: activeJobId,
          subtopicIds: selectedSubtopicIds,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'License preview request failed.');
      }

      const preview = (await res.json()) as LicensePreviewResponse;
      setLicensePreview(preview);
      // Pre-select the auto-allowed bucket as a sensible default.
      const autoAllowed = preview.licenses
        .filter(license => license.policy === 'auto_allowed')
        .map(license => license.licenseName);
      setSelectedLicenseNames(autoAllowed);
      setSelectedPolicyBuckets(getFullySelectedPolicyBuckets(preview.licenses, autoAllowed));
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setLicenseError(err.message || 'Could not load license preview.');
    } finally {
      setIsLoadingLicensePreview(false);
    }
  };

  const toggleLicenseName = (licenseName: string) => {
    if (!licensePreview) return;
    setLicenseError('');

    const nextSelectedLicenseNames = selectedLicenseNames.includes(licenseName)
      ? selectedLicenseNames.filter(name => name !== licenseName)
      : [...selectedLicenseNames, licenseName];

    setSelectedLicenseNames(nextSelectedLicenseNames);
    setSelectedPolicyBuckets(getFullySelectedPolicyBuckets(
      licensePreview.licenses,
      nextSelectedLicenseNames
    ));
  };

  const togglePolicyBucket = (policy: LicensePolicy) => {
    if (!licensePreview) return;
    setLicenseError('');

    const matchingLicenseNames = licensePreview.licenses
      .filter(license => license.policy === policy)
      .map(license => license.licenseName);

    if (selectedPolicyBuckets.includes(policy)) {
      const nextSelectedLicenseNames = selectedLicenseNames.filter(name => !matchingLicenseNames.includes(name));
      setSelectedLicenseNames(nextSelectedLicenseNames);
      setSelectedPolicyBuckets(getFullySelectedPolicyBuckets(
        licensePreview.licenses,
        nextSelectedLicenseNames
      ));
      return;
    }

    const nextSelectedLicenseNames = Array.from(new Set([
      ...selectedLicenseNames,
      ...matchingLicenseNames,
    ]));

    setSelectedLicenseNames(nextSelectedLicenseNames);
    setSelectedPolicyBuckets(getFullySelectedPolicyBuckets(
      licensePreview.licenses,
      nextSelectedLicenseNames
    ));
  };

  const handleStartIngestion = async () => {
    if (!activeJobId || selectedSubtopicIds.length === 0) {
      setLicenseError('Select subtopics and at least one license before ingesting.');
      return;
    }

    if (selectedLicenseNames.length === 0) {
      setLicenseError('Select at least one license before ingesting.');
      return;
    }

    setIsStartingIngest(true);
    setIngestError('');
    setIngestResult(null);
    setSkippedRecords([]);

    try {
      const res = await fetch('/api/jobs/ingest-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discoveryJobId: activeJobId,
          subtopicIds: selectedSubtopicIds,
          sourceMode: 'openalex',
          perPage,
          downloadFiles,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/admin/login', { replace: true });
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Ingestion request failed.');
      }

      const jobId = await readJobId(res);
      if (!jobId) throw new Error('Ingestion endpoint did not return a job id.');

      setIngestJobId(jobId);
      setStep(4);
    } catch (err: any) {
      console.error(err);
      setIngestError(err.message || 'Could not start ingestion.');
    } finally {
      setIsStartingIngest(false);
    }
  };

  const loadSkippedRecords = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/skipped-records`);
      if (!res.ok) return;
      const data = (await res.json()) as SkippedRecord[];
      setSkippedRecords(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleIngestCompleted = useCallback((job: JobStatusResponse) => {
    setIngestResult(job.result ?? null);
    loadSkippedRecords(job.id);
    setStep(5);
  }, [loadSkippedRecords]);

  const startOver = () => {
    setStep(1);
    setTopic('');
    setActiveJobId('');
    setError('');
    setMessage('');
    resetDownstream();
  };

  const selectedLicenseRows = licensePreview?.licenses.filter(license =>
    selectedLicenseNames.includes(license.licenseName)
  ) ?? [];

  const hasManualReviewSelection = selectedLicenseRows.some(license =>
    license.requiresManualReview || license.policy !== 'auto_allowed'
  );

  const canVisitStep = (target: number) => {
    if (target >= step) return false;
    if (target === 2) return subtopics.length > 0;
    if (target === 3) return Boolean(licensePreview);
    if (target === 4) return Boolean(ingestJobId);
    return target < step;
  };

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[black] font-bold">
            <FolderOpen className="w-6 h-6" />
            <span>Admin Collection Workflow</span>
          </div>
          <h1 className="text-4xl font-bold text-[black]">Collect Papers</h1>
          <p className="text-muted max-w-2xl">
            Search a research topic, choose the subtopics you care about, review licensing, then
            ingest open-access papers into the library — one step at a time.
          </p>
        </div>

        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-semibold border border-primary/20 px-3 py-2 rounded-lg hover:bg-primary hover:text-neutral transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Review Panel
        </Link>
      </div>

      {/* Stepper */}
      <div className="glass-card p-5 md:p-6 mb-8">
        <ol className="flex items-center justify-between gap-2">
          {STEPS.map((s, index) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            const clickable = canVisitStep(s.id);

            return (
              <li key={s.id} className="flex-1 flex items-center">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setStep(s.id)}
                  className={`flex items-center gap-3 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isActive
                        ? 'border-[black] bg-[black] text-white'
                        : isDone
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-primary/20 bg-white text-muted'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </span>
                  <span className="hidden md:block">
                    <span className={`block text-sm font-bold ${isActive || isDone ? 'text-[black]' : 'text-muted'}`}>
                      {s.label}
                    </span>
                    <span className="block text-[11px] text-muted">{s.hint}</span>
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <span className={`mx-2 hidden h-0.5 flex-1 md:block ${step > s.id ? 'bg-green-500' : 'bg-primary/15'}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* STEP 1 — Discover */}
      {step === 1 && (
        <div className="glass-card p-8 md:p-12 space-y-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-muted">
              <Search className="w-4 h-4" />
              Step 1 · Topic Discovery
            </div>
            <h2 className="text-2xl font-bold text-[black]">What topic do you want to collect?</h2>
            <p className="text-muted max-w-2xl">
              Enter a research topic. We search OpenAlex for related subtopics and show how many
              papers each one has, so you can choose what to bring into the library.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
            <div className="space-y-2">
              <label htmlFor="collection-topic" className="text-sm font-bold text-[black]">
                Research topic
              </label>
              <input
                id="collection-topic"
                type="text"
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  if (error) setError('');
                  if (message) setMessage('');
                }}
                placeholder="e.g. carbon emission"
                className="w-full border border-primary/20 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary bg-white"
                aria-invalid={Boolean(error)}
              />
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
              {message && (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  {message}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 bg-[black] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {isSubmitting ? 'Starting…' : 'Discover subtopics'}
            </button>
          </form>

          {activeJobId && (
            <JobStatusPanel
              jobId={activeJobId}
              title={activeJobTitle}
              onCompleted={handleDiscoveryCompleted}
            />
          )}

          {isLoadingSubtopics && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading discovered subtopics…
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Subtopics */}
      {step === 2 && (
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted">Step 2 · Subtopic Results</p>
              <h2 className="text-2xl font-bold text-[black]">Choose subtopics to collect</h2>
              <p className="text-sm text-muted mt-1">Select up to {MAX_SELECTED_SUBTOPICS}. Use “View” to inspect the evidence behind each one.</p>
            </div>
            <div className="text-sm font-bold text-muted whitespace-nowrap">
              {selectedSubtopicIds.length}/{MAX_SELECTED_SUBTOPICS} selected
            </div>
          </div>

          {subtopicError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {subtopicError}
            </div>
          )}

          {subtopics.length > 0 ? (
            <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
              <div className="overflow-x-auto border border-primary/10 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
                    <tr>
                      <th className="px-4 py-3 w-12">Pick</th>
                      <th className="px-4 py-3">Subtopic</th>
                      <th className="px-4 py-3">Papers</th>
                      <th className="px-4 py-3">Sources</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {subtopics.map(subtopic => {
                      const isSelected = selectedSubtopicIds.includes(subtopic.id);
                      return (
                        <tr key={subtopic.id} className={isSelected ? 'bg-green-50/60' : 'bg-white'}>
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSubtopicSelection(subtopic.id)}
                              className="h-4 w-4 accent-[black]"
                              aria-label={`Select ${subtopic.name}`}
                            />
                          </td>
                          <td className="px-4 py-4 min-w-55">
                            <div className="font-bold text-[black]">{subtopic.name}</div>
                            <div className="text-xs text-muted">{subtopic.providerTopicId || subtopic.provider}</div>
                          </td>
                          <td className="px-4 py-4 font-semibold">{formatNumber(Number(subtopic.paperCount || 0))}</td>
                          <td className="px-4 py-4 font-semibold">{formatNumber(Number(subtopic.sourceCount || 0))}</td>
                          <td className="px-4 py-4 font-semibold">{formatConfidence(subtopic.confidence)}</td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => setActiveSubtopic(subtopic)}
                              className="inline-flex items-center gap-2 border border-primary/20 px-3 py-2 rounded-lg text-xs font-bold hover:bg-primary hover:text-neutral transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <aside className="border border-primary/10 rounded-lg bg-white p-5 space-y-4">
                {activeSubtopic ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted">Evidence</p>
                        <h3 className="text-xl font-bold text-[black]">{activeSubtopic.name}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSubtopic(null)}
                        className="p-2 rounded-lg border border-primary/20 hover:bg-primary hover:text-neutral transition-colors"
                        aria-label="Close details"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted">Papers</p>
                        <p className="font-bold">{formatNumber(Number(activeSubtopic.paperCount || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Sources</p>
                        <p className="font-bold">{formatNumber(Number(activeSubtopic.sourceCount || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Confidence</p>
                        <p className="font-bold">{formatConfidence(activeSubtopic.confidence)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Provider</p>
                        <p className="font-bold capitalize">{activeSubtopic.provider}</p>
                      </div>
                    </div>

                    <pre className="text-xs overflow-auto max-h-72 bg-gray-950 text-white rounded-lg p-4">
                      {JSON.stringify(activeSubtopic.evidence ?? {}, null, 2)}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-muted">Choose a subtopic to inspect its evidence.</p>
                )}
              </aside>
            </div>
          ) : (
            <p className="text-sm text-muted">No subtopics found. Go back and try a different topic.</p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 border border-primary/20 px-5 py-3 rounded-lg text-sm font-bold hover:bg-primary hover:text-neutral transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={handlePreviewLicenses}
              disabled={selectedSubtopicIds.length === 0 || isLoadingLicensePreview}
              className="inline-flex items-center gap-2 bg-[black] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingLicensePreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isLoadingLicensePreview ? 'Loading preview…' : 'Review licenses'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Licenses */}
      {step === 3 && licensePreview && (
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted">Step 3 · License Review</p>
              <h2 className="text-2xl font-bold text-[black]">Which licenses are allowed?</h2>
              <p className="text-sm text-muted mt-1">
                Estimated {formatNumber(licensePreview.estimatedPaperCount)} papers across {licensePreview.selectedSubtopicCount} subtopic{licensePreview.selectedSubtopicCount === 1 ? '' : 's'}. Only auto-allowed papers are published automatically.
              </p>
            </div>
            <div className="text-sm font-bold text-muted whitespace-nowrap">
              {selectedLicenseNames.length} selected
            </div>
          </div>

          {licenseError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {licenseError}
            </div>
          )}

          {hasManualReviewSelection && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>Some selected licenses need review (conditional, unknown, or blocked). Those papers are saved as pending instead of published.</span>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-bold text-[black]">Quick select by policy</p>
            <div className="flex flex-wrap gap-2">
              {policyBuckets.map(policy => {
                const isSelected = selectedPolicyBuckets.includes(policy);
                return (
                  <button
                    key={policy}
                    type="button"
                    onClick={() => togglePolicyBucket(policy)}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[black] text-white border-[black]'
                        : 'bg-white border-primary/20 text-[black] hover:bg-primary hover:text-neutral'
                    }`}
                  >
                    {policyLabels[policy]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto border border-primary/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3 w-12">Pick</th>
                  <th className="px-4 py-3">License</th>
                  <th className="px-4 py-3">Papers</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/10">
                {licensePreview.licenses.map(license => {
                  const isSelected = selectedLicenseNames.includes(license.licenseName);
                  return (
                    <tr key={license.licenseName} className={isSelected ? 'bg-green-50/60' : 'bg-white'}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleLicenseName(license.licenseName)}
                          className="h-4 w-4 accent-[black]"
                          aria-label={`Select ${license.licenseName}`}
                        />
                      </td>
                      <td className="px-4 py-4 font-bold text-[black]">{license.licenseName}</td>
                      <td className="px-4 py-4 font-semibold">{formatNumber(license.paperCount)}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${policyBadgeClasses[license.policy]}`}>
                          {policyLabels[license.policy]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted min-w-80">{license.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 border border-primary/20 px-5 py-3 rounded-lg text-sm font-bold hover:bg-primary hover:text-neutral transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => { setStep(4); }}
              disabled={selectedLicenseNames.length === 0}
              className="inline-flex items-center gap-2 bg-[black] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight className="w-4 h-4" />
              Continue to ingest
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Ingest */}
      {step === 4 && (
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted">Step 4 · Ingest</p>
            <h2 className="text-2xl font-bold text-[black]">Collect the papers</h2>
            <p className="text-sm text-muted mt-1">
              We fetch works for your {selectedSubtopicIds.length} subtopic{selectedSubtopicIds.length === 1 ? '' : 's'} from OpenAlex,
              apply the license rules, de-duplicate, and save them to the library.
            </p>
          </div>

          {ingestError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {ingestError}
            </div>
          )}

          {!ingestJobId && (
            <>
              <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
                <div className="space-y-2">
                  <label htmlFor="per-page" className="text-sm font-bold text-[black]">Papers per subtopic</label>
                  <input
                    id="per-page"
                    type="number"
                    min={1}
                    max={50}
                    value={perPage}
                    onChange={(e) => setPerPage(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-full border border-primary/20 rounded-lg px-4 py-3 text-sm outline-none focus:border-primary bg-white"
                  />
                  <p className="text-xs text-muted">Between 1 and 50.</p>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-bold text-[black]">Download PDFs</span>
                  <label className="flex items-center gap-3 border border-primary/20 rounded-lg px-4 py-3 bg-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadFiles}
                      onChange={(e) => setDownloadFiles(e.target.checked)}
                      className="h-4 w-4 accent-[black]"
                    />
                    <span className="text-sm">Download &amp; store open-access PDFs on the server</span>
                  </label>
                  <p className="text-xs text-muted">Only license-allowed, open-access PDFs are downloaded.</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 border border-primary/20 px-5 py-3 rounded-lg text-sm font-bold hover:bg-primary hover:text-neutral transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStartIngestion}
                  disabled={isStartingIngest}
                  className="inline-flex items-center gap-2 bg-[black] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isStartingIngest ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                  {isStartingIngest ? 'Starting…' : 'Start ingestion'}
                </button>
              </div>
            </>
          )}

          {ingestJobId && (
            <JobStatusPanel
              jobId={ingestJobId}
              title="Ingestion Job"
              onCompleted={handleIngestCompleted}
            />
          )}
        </div>
      )}

      {/* STEP 5 — Results */}
      {step === 5 && (
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
              <CheckCircle className="w-6 h-6" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted">Step 5 · Results</p>
              <h2 className="text-2xl font-bold text-[black]">Ingestion complete</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Ingested', key: 'ingestedCount', tone: 'text-green-700' },
              { label: 'New', key: 'insertedCount', tone: 'text-[black]' },
              { label: 'Updated', key: 'updatedCount', tone: 'text-[black]' },
              { label: 'Duplicates', key: 'duplicateCount', tone: 'text-muted' },
              { label: 'Skipped', key: 'skippedCount', tone: 'text-amber-700' },
              { label: 'PDFs', key: 'downloadedCount', tone: 'text-[black]' },
            ].map(card => (
              <div key={card.key} className="border border-primary/10 rounded-lg bg-white p-4">
                <p className="text-xs text-muted">{card.label}</p>
                <p className={`text-2xl font-bold ${card.tone}`}>{formatNumber(toCount(ingestResult, card.key))}</p>
              </div>
            ))}
          </div>

          {skippedRecords.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-amber-600" />
                <h3 className="text-lg font-bold text-[black]">Skipped records ({skippedRecords.length})</h3>
              </div>
              <div className="overflow-x-auto border border-primary/10 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-[0.14em] text-muted">
                    <tr>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/10">
                    {skippedRecords.map(record => (
                      <tr key={record.id} className="bg-white">
                        <td className="px-4 py-3 font-semibold text-[black] min-w-60">
                          {record.title || record.doi || record.sourceUrl || 'Untitled record'}
                        </td>
                        <td className="px-4 py-3 capitalize">{record.provider}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                            {REASON_LABELS[record.reason] || record.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted min-w-60">{record.rawError || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 bg-[black] text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary transition-colors"
            >
              Review &amp; publish in admin
            </Link>
            <a
              href={`${import.meta.env.VITE_PUBLIC_SITE_URL || ''}/topics`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-primary/20 px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary hover:text-neutral transition-colors"
            >
              View public library
            </a>
            <button
              type="button"
              onClick={startOver}
              className="inline-flex items-center gap-2 border border-primary/20 px-6 py-3 rounded-lg text-sm font-bold hover:bg-primary hover:text-neutral transition-colors"
            >
              <Search className="w-4 h-4" />
              Collect another topic
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
