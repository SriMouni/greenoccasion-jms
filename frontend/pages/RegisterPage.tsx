import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { jsonPost } from '../lib/portal';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await jsonPost('/api/auth/register', { fullName, email, password });
      navigate('/admin/author', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bright px-4">
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm">
        <h1 className="font-serif text-2xl font-bold text-on-surface">Create an author account</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Register to submit manuscripts and track their review.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm"
              placeholder="Jane Researcher"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm"
              placeholder="At least 6 characters"
            />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary hover:bg-primary-dark disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Creating…' : 'Create account'}
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
