import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileText, Loader2, Stamp } from 'lucide-react';
import { jsonPost, type Role } from '../lib/portal';
import { Logo } from '../components/Logo';

const ROLES: { value: Extract<Role, 'author' | 'reviewer'>; label: string; blurb: string; icon: typeof FileText }[] = [
  { value: 'author', label: 'Author', blurb: 'Submit manuscripts & track review', icon: FileText },
  { value: 'reviewer', label: 'Reviewer', blurb: 'Peer-review assigned manuscripts', icon: Stamp },
];

const field = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface-bright px-3 py-2.5 text-sm text-on-surface outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/40';
const label = 'block text-xs font-semibold uppercase tracking-wide text-on-surface-variant';

/** Left forest-green brand panel — shared with the login screen. */
const BrandPanel = () => (
  <section className="relative hidden flex-col justify-between overflow-hidden bg-primary-container p-10 text-on-primary lg:flex lg:w-[42%]">
    <div
      className="pointer-events-none absolute inset-0 opacity-30"
      style={{ background: 'radial-gradient(120% 80% at 20% 10%, rgba(178,205,183,0.35), transparent 60%)' }}
    />
    <div className="relative z-10 flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-lowest p-1.5">
        <img src="/logo.png" alt="Green Occasion" className="h-full w-full object-contain" />
      </span>
      <span className="font-serif text-2xl tracking-tight">Green Occasion JMS</span>
    </div>
    <div className="relative z-10 max-w-sm">
      <blockquote>
        <p className="font-serif text-3xl italic leading-snug">
          “Rigorous peer review is how research earns trust.”
        </p>
        <footer className="mt-4 font-mono-label text-xs uppercase tracking-widest opacity-80">
          — Editorial Office
        </footer>
      </blockquote>
      <div className="mt-6 h-1 w-12 bg-secondary-fixed" />
    </div>
    <div className="relative z-10 flex flex-col gap-1 text-xs text-on-primary-container">
      <p>© 2026 Green Occasion Editorial Portal</p>
      <div className="flex gap-4">
        <span className="opacity-70">Privacy Policy</span>
        <span className="opacity-70">Terms of Use</span>
      </div>
    </div>
  </section>
);

export const RegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'author' | 'reviewer'>('author');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await jsonPost('/api/auth/register', { fullName, email, password, role });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full bg-background">
      <BrandPanel />

      <section className="relative flex w-full items-center justify-center p-6 lg:w-[58%]">
        <Logo size={28} className="lg:hidden absolute left-6 top-6" />

        <div className="w-full max-w-[440px]">
          {submitted ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h1 className="mt-4 font-serif text-2xl font-bold text-on-surface">Account request received</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Thanks for registering as {role === 'reviewer' ? 'a reviewer' : 'an author'}. Your account is
                <span className="font-semibold text-on-surface"> awaiting admin approval</span> — you’ll be able to sign
                in once the editorial office approves it.
              </p>
              <Link to="/admin/login" className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                Back to sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
              <header className="mb-6">
                <h1 className="font-serif text-3xl text-primary">Create your account</h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Register to submit or review research. New accounts are approved by the editorial office.
                </p>
              </header>

              <form onSubmit={submit} className="space-y-5">
                <div>
                  <span className={label}>I am registering as</span>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {ROLES.map((r) => {
                      const Icon = r.icon;
                      const active = role === r.value;
                      return (
                        <button
                          type="button"
                          key={r.value}
                          onClick={() => setRole(r.value)}
                          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                            active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-outline-variant hover:border-primary/50'
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-on-surface-variant'}`} />
                          <span className="text-sm font-bold text-on-surface">{r.label}</span>
                          <span className="text-[11px] leading-tight text-on-surface-variant">{r.blurb}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={label}>Full name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} placeholder="Jane Researcher" />
                </div>
                <div>
                  <label className={label}>Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@example.com" />
                </div>
                <div>
                  <label className={label}>Password</label>
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder="At least 6 characters" />
                </div>

                {error && (
                  <p className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-on-primary shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? 'Creating…' : `Create ${role} account`}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-on-surface-variant">
                Already have an account?{' '}
                <Link to="/admin/login" className="font-semibold text-primary hover:underline">Sign in</Link>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};
