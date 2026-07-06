import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Landmark, Lock, Mail } from 'lucide-react';
import { homeForRole } from '../lib/portal';
import { Logo } from '../components/Logo';

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Login failed');
      }
      const data = await response.json().catch(() => ({}));
      navigate(homeForRole(data?.user?.role), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fieldWrap = 'relative';
  const fieldInput =
    'w-full rounded-lg border border-outline-variant bg-surface-bright py-3 pl-11 pr-11 text-sm text-on-surface outline-none transition focus:border-secondary focus:ring-2 focus:ring-secondary/40';

  return (
    <main className="flex min-h-screen w-full bg-background">
      {/* Left brand panel */}
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
              “Ecology is the study of how organisms interact with one another and with their physical environment.”
            </p>
            <footer className="mt-4 font-mono-label text-xs uppercase tracking-widest opacity-80">
              — Journal of Micro-Sustainability
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

      {/* Right login panel */}
      <section className="relative flex w-full items-center justify-center p-6 lg:w-[58%]">
        <Logo size={28} className="lg:hidden absolute left-6 top-6" />

        <div className="w-full max-w-[440px]">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
            <header className="mb-8">
              <h1 className="font-serif text-3xl text-primary">Editorial Login</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                Welcome back. Sign in to access your dashboard.
              </p>
            </header>

            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Email or Username
                </label>
                <div className={fieldWrap}>
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
                  <input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={fieldInput}
                    placeholder="editor@university.edu"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Password
                </label>
                <div className={fieldWrap}>
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldInput}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary"
                    title={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-on-primary shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign In to Portal'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-8 border-t border-outline-variant pt-6">
              <div className="mb-4 flex items-center justify-center gap-2">
                <span className="h-px w-8 bg-outline-variant" />
                <span className="text-xs uppercase tracking-wide text-outline">Institution auth</span>
                <span className="h-px w-8 bg-outline-variant" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled title="Coming soon" className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-outline-variant py-3 text-sm font-medium text-on-surface-variant opacity-60">
                  <span className="font-bold text-secondary">iD</span> ORCID
                </button>
                <button type="button" disabled title="Coming soon" className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-outline-variant py-3 text-sm font-medium text-on-surface-variant opacity-60">
                  <Landmark className="h-5 w-5 text-primary" /> SSO
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-1">
            <p className="text-sm text-on-surface-variant">Don't have an account yet?</p>
            <Link to="/admin/register" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              Register as an Author or Reviewer <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 text-center">
            <a href={import.meta.env.VITE_PUBLIC_SITE_URL || '/'} className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant hover:text-primary">
              Back to Public Site
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};
