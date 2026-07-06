import { type FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { PortalShell } from '../components/PortalShell';
import { ARTICLE_TYPES } from '../lib/portal';

type Author = {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  orcid: string;
  isCorresponding: boolean;
};

const STEPS = ['Metadata', 'Authors', 'Uploads', 'Declarations', 'Review'];
const emptyAuthor = (): Author => ({ firstName: '', lastName: '', email: '', affiliation: '', orcid: '', isCorresponding: false });

const field = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none';
const label = 'text-xs font-semibold uppercase tracking-wide text-on-surface-variant';

export const AuthorSubmit = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Step 1 — metadata
  const [title, setTitle] = useState('');
  const [articleType, setArticleType] = useState(ARTICLE_TYPES[0].value);
  const [keywords, setKeywords] = useState('');
  const [abstract, setAbstract] = useState('');

  // Step 2 — authors
  const [authors, setAuthors] = useState<Author[]>([{ ...emptyAuthor(), isCorresponding: true }]);

  // Step 3 — uploads
  const [manuscript, setManuscript] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [supplementary, setSupplementary] = useState<File[]>([]);

  // Step 4 — declarations
  const [funding, setFunding] = useState('');
  const [conflicts, setConflicts] = useState('');
  const [copyrightAgreed, setCopyrightAgreed] = useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const keywordList = useMemo(
    () => keywords.split(',').map((k) => k.trim()).filter(Boolean),
    [keywords],
  );
  const abstractWords = useMemo(() => (abstract.trim() ? abstract.trim().split(/\s+/).length : 0), [abstract]);

  const setAuthor = (i: number, patch: Partial<Author>) =>
    setAuthors((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const setCorresponding = (i: number) =>
    setAuthors((a) => a.map((x, idx) => ({ ...x, isCorresponding: idx === i })));

  // Validate the current step; return an error string or '' if OK.
  const validateStep = (s: number): string => {
    if (s === 0) {
      if (!title.trim()) return 'A manuscript title is required.';
      if (abstractWords === 0) return 'An abstract is required.';
      if (abstractWords > 500) return 'The abstract must be 500 words or fewer.';
      if (keywordList.length < 3) return 'Please provide at least 3 keywords.';
      if (keywordList.length > 10) return 'Please provide no more than 10 keywords.';
    }
    if (s === 1) {
      const valid = authors.filter((a) => a.firstName.trim() && a.lastName.trim());
      if (valid.length === 0) return 'At least one author with a first and last name is required.';
      if (!authors.some((a) => a.isCorresponding)) return 'Please mark one author as the corresponding author.';
      const corr = authors.find((a) => a.isCorresponding);
      if (corr && !corr.email.trim()) return 'The corresponding author needs an email address.';
    }
    if (s === 2) {
      if (!manuscript) return 'Please upload your main manuscript (PDF or Word).';
    }
    if (s === 3) {
      if (!copyrightAgreed) return 'You must accept the copyright / licensing agreement to submit.';
    }
    return '';
  };

  const next = () => {
    const msg = validateStep(step);
    if (msg) return setError(msg);
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Guard: validate every step before the final POST.
    for (let s = 0; s < STEPS.length - 1; s++) {
      const msg = validateStep(s);
      if (msg) {
        setStep(s);
        return setError(msg);
      }
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('abstract', abstract);
      fd.append('keywords', keywordList.join(', '));
      fd.append('articleType', articleType);
      fd.append('coverLetter', coverLetter);
      fd.append(
        'declarations',
        JSON.stringify({ funding, conflicts, copyrightAgreed, license: 'CC-BY-4.0' }),
      );
      fd.append('authors', JSON.stringify(authors.filter((a) => a.firstName.trim() || a.lastName.trim())));
      if (manuscript) fd.append('manuscript', manuscript);
      supplementary.forEach((f) => fd.append('supplementary', f));

      const res = await fetch('/api/submissions', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Submission failed');
      navigate('/admin/author', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell role="author" title="New Manuscript Submission">
      <form onSubmit={submit} className="max-w-3xl">
        <p className="mb-6 text-sm text-on-surface-variant">
          Complete the following steps to submit your research to Green Occasion. Ensure all metadata matches
          the final version of your manuscript.
        </p>

        {/* Stepper */}
        <ol className="mb-8 flex items-center">
          {STEPS.map((name, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={name} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      active
                        ? 'bg-primary text-on-primary'
                        : done
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      active ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {name}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className={`mx-2 h-px flex-1 ${done ? 'bg-secondary' : 'bg-outline-variant'}`} />
                )}
              </li>
            );
          })}
        </ol>

        <div className="space-y-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
          {/* STEP 1 — METADATA */}
          {step === 0 && (
            <>
              <div>
                <label className={label}>Full Article Title *</label>
                <input value={title} maxLength={250} onChange={(e) => setTitle(e.target.value)} className={field} />
                <p className="mt-1 text-right text-xs text-on-surface-variant">{title.length} / 250 characters</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={label}>Article Type</label>
                  <select value={articleType} onChange={(e) => setArticleType(e.target.value)} className={field}>
                    {ARTICLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Keywords (3–10, comma-separated)</label>
                  <input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    className={field}
                    placeholder="composting, urban, waste"
                  />
                  <p
                    className={`mt-1 text-xs ${
                      keywordList.length < 3 || keywordList.length > 10 ? 'text-error' : 'text-on-surface-variant'
                    }`}
                  >
                    {keywordList.length} keyword(s)
                  </p>
                </div>
              </div>
              <div>
                <label className={label}>Abstract *</label>
                <textarea
                  rows={8}
                  value={abstract}
                  onChange={(e) => setAbstract(e.target.value)}
                  className={field}
                  placeholder="Enter a comprehensive abstract (max 500 words)…"
                />
                <p className={`mt-1 text-right text-xs ${abstractWords > 500 ? 'text-error' : 'text-on-surface-variant'}`}>
                  Word count: {abstractWords} / 500
                </p>
              </div>
            </>
          )}

          {/* STEP 2 — AUTHORS */}
          {step === 1 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-on-surface">Authorship</p>
                <button
                  type="button"
                  onClick={() => setAuthors((a) => [...a, emptyAuthor()])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add author
                </button>
              </div>
              <div className="space-y-4">
                {authors.map((a, i) => (
                  <div key={i} className="rounded-md border border-outline-variant p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold text-on-surface-variant">Author {i + 1}</p>
                      {authors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setAuthors((x) => x.filter((_, idx) => idx !== i))}
                          className="rounded p-1 text-error hover:bg-error-container/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input placeholder="First name *" value={a.firstName} onChange={(e) => setAuthor(i, { firstName: e.target.value })} className={field.replace('mt-1 ', '')} />
                      <input placeholder="Last name *" value={a.lastName} onChange={(e) => setAuthor(i, { lastName: e.target.value })} className={field.replace('mt-1 ', '')} />
                      <input placeholder="Email" value={a.email} onChange={(e) => setAuthor(i, { email: e.target.value })} className={field.replace('mt-1 ', '')} />
                      <input placeholder="Affiliation / Institution" value={a.affiliation} onChange={(e) => setAuthor(i, { affiliation: e.target.value })} className={field.replace('mt-1 ', '')} />
                      <input placeholder="ORCID iD (0000-0000-0000-0000)" value={a.orcid} onChange={(e) => setAuthor(i, { orcid: e.target.value })} className={`${field.replace('mt-1 ', '')} sm:col-span-2`} />
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-on-surface">
                      <input type="radio" name="corresponding" checked={a.isCorresponding} onChange={() => setCorresponding(i)} />
                      Corresponding author
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* STEP 3 — UPLOADS */}
          {step === 2 && (
            <>
              <div>
                <label className={label}>Main Manuscript (PDF or Word) *</label>
                <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface px-4 py-4 text-sm hover:border-primary">
                  <FileUp className="h-5 w-5 text-primary" />
                  <span className={manuscript ? 'text-on-surface' : 'text-on-surface-variant'}>
                    {manuscript ? manuscript.name : 'Choose a .pdf, .doc or .docx file'}
                  </span>
                  <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setManuscript(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className={label}>Cover Letter</label>
                <textarea
                  rows={5}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className={field}
                  placeholder="A short note to the editor (optional)…"
                />
              </div>
              <div>
                <label className={label}>Supplementary Materials (datasets, figures)</label>
                <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-outline-variant bg-surface px-4 py-3 text-sm hover:border-primary">
                  <Upload className="h-4 w-4 text-primary" />
                  <span className="text-on-surface-variant">Add files (optional)</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => setSupplementary((prev) => [...prev, ...Array.from(e.target.files || [])])}
                  />
                </label>
                {supplementary.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {supplementary.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded bg-surface-container px-3 py-1.5 text-xs">
                        <span className="truncate">{f.name}</span>
                        <button type="button" onClick={() => setSupplementary((x) => x.filter((_, idx) => idx !== i))} className="text-error">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* STEP 4 — DECLARATIONS */}
          {step === 3 && (
            <>
              <div>
                <label className={label}>Funding Sources</label>
                <textarea rows={3} value={funding} onChange={(e) => setFunding(e.target.value)} className={field} placeholder="Grant numbers / funders, or 'None'." />
              </div>
              <div>
                <label className={label}>Conflicts of Interest</label>
                <textarea rows={3} value={conflicts} onChange={(e) => setConflicts(e.target.value)} className={field} placeholder="Declare any competing interests, or 'None'." />
              </div>
              <label className="flex items-start gap-3 rounded-md border border-outline-variant bg-surface p-4 text-sm">
                <input type="checkbox" checked={copyrightAgreed} onChange={(e) => setCopyrightAgreed(e.target.checked)} className="mt-0.5" />
                <span>
                  I confirm this is original work and, if accepted, agree to publish it under the{' '}
                  <span className="font-semibold">Creative Commons Attribution (CC-BY 4.0)</span> license. *
                </span>
              </label>
            </>
          )}

          {/* STEP 5 — REVIEW */}
          {step === 4 && (
            <div className="space-y-4 text-sm">
              <p className="text-sm font-semibold text-on-surface">Review &amp; Submit</p>
              <Summary k="Title" v={title} />
              <Summary k="Article type" v={ARTICLE_TYPES.find((t) => t.value === articleType)?.label || articleType} />
              <Summary k="Keywords" v={keywordList.join(', ')} />
              <Summary k="Abstract" v={`${abstractWords} words`} />
              <Summary
                k="Authors"
                v={authors
                  .filter((a) => a.firstName || a.lastName)
                  .map((a) => `${a.firstName} ${a.lastName}${a.isCorresponding ? ' (corresponding)' : ''}`)
                  .join('; ')}
              />
              <Summary k="Manuscript" v={manuscript?.name || '—'} />
              <Summary k="Supplementary" v={supplementary.length ? `${supplementary.length} file(s)` : 'None'} />
              <Summary k="License" v="CC-BY 4.0" />
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/admin/author')}
            className="text-sm font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <button type="button" onClick={back} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark">
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Submitting…' : 'Submit manuscript'}
              </button>
            )}
          </div>
        </div>
      </form>
    </PortalShell>
  );
};

const Summary = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3 border-b border-outline-variant/60 pb-2">
    <span className="w-32 shrink-0 text-xs font-bold uppercase tracking-wide text-on-surface-variant">{k}</span>
    <span className="min-w-0 flex-1 break-words text-on-surface">{v || '—'}</span>
  </div>
);
