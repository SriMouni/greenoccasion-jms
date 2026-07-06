import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Loader2, Stamp } from 'lucide-react';
import { homeForRole, jsonPost, type Role } from '../lib/portal';
import { Logo } from '../components/Logo';

const ROLES: { value: Extract<Role, 'author' | 'reviewer'>; label: string; blurb: string; icon: typeof FileText }[] = [
  { value: 'author', label: 'Author', blurb: 'Submit manuscripts & track review', icon: FileText },
  { value: 'reviewer', label: 'Reviewer', blurb: 'Peer-review assigned manuscripts', icon: Stamp },
];

export const RegisterPage = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'author' | 'reviewer'>('author');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await jsonPost('/api/auth/register', { fullName, email, password, role });
      navigate(homeForRole(data?.user?.role), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/40';

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bright px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
        <Logo size={30} className="mb-6" />
        <h1 className="font-serif text-2xl font-bold text-on-surface">Create your account</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Join Green Occasion to submit or review research.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">I am registering as</span>
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
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} placeholder="Jane Researcher" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="At least 6 characters" />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Creating…' : `Create ${role} account`}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/admin/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
