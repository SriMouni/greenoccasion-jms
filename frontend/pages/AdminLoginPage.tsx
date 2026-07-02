import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { homeForRole } from '../lib/portal';

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event: React.FormEvent) => {
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

  return (
    <div className="py-16 container-custom min-h-screen flex items-center justify-center">
      <div className="glass-card w-full max-w-md p-8 md:p-10 space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-14 h-14 rounded-full bg-primary text-neutral mx-auto flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-serif italic">Sign In</h1>
          <p className="text-sm text-muted">Authors, reviewers &amp; editors</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="label-caps block">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-primary/20 bg-white/70 rounded-xl px-3 py-3 outline-none focus:border-primary"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="label-caps block">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-primary/20 bg-white/70 rounded-xl px-3 py-3 outline-none focus:border-primary"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-[#8f2d1f] bg-[#fcece8] border border-[#f6d0c9] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-60">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          New author?{' '}
          <Link to="/admin/register" className="font-semibold text-primary hover:underline">
            Create an account
          </Link>
        </p>

        <div className="text-center">
          <a href={import.meta.env.VITE_PUBLIC_SITE_URL || '/'} className="text-xs uppercase tracking-[0.14em] font-semibold text-muted hover:text-primary">
            Back to Public Site
          </a>
        </div>
      </div>
    </div>
  );
};
