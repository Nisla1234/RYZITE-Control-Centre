import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Navigate to="/admin/dashboard/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Please enter both your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/admin/dashboard/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to reach the authentication server. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] flex flex-col lg:flex-row">
      {/* Left Brand Panel — Deep RYZITE Navy */}
      <div className="lg:w-[46%] bg-[#0D1F4E] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #2563EB 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -left-24 -bottom-24 h-80 w-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #1438B8 0%, transparent 70%)' }}
        />

        <div className="relative z-10">
          <div className="inline-flex items-center rounded-lg bg-white px-4 py-2 shadow-sm">
            <img
              src="/assets/branding/ryzite-logo.png"
              alt="RYZITE Official Logo"
              className="h-14 w-auto object-contain"
            />
          </div>

          <div className="mt-12 max-w-md">
            <p className="text-xs font-medium tracking-wide text-[#94AEDB]">
              RYZITE Control Centre
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Enterprise Website Content & Operations Console
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#CBD9F2]">
              Manage structured website pages, portfolio case studies, services, media assets,
              SEO governance, and Google Analytics 4 telemetry from a single authenticated workspace.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#94AEDB]">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#60A5FA]" />
            Protected by server-side HttpOnly sessions & audit logging
          </span>
          <span className="font-mono">Sanity Project · hnm8jy5w</span>
        </div>
      </div>

      {/* Right Sign-In Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-[#DDE5F0] bg-white p-8 shadow-sm">
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-[#0D1F4E]">Administrator Sign In</h2>
              <p className="mt-1.5 text-sm text-[#475569]">
                Authenticate with your RYZITE Control Centre credentials.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-sm text-[#991B1B]"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-medium text-[#1E293B] mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your admin username"
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1438B8] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/15"
                    disabled={submitting}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-[#1E293B]"
                  >
                    Password
                  </label>
                  <Link
                    to="/admin/forgot-password"
                    className="text-xs font-semibold text-[#1438B8] hover:text-[#0D1F4E]"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-10 pr-10 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1438B8] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/15"
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-[#1438B8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#102D96] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/40 disabled:opacity-60"
              >
                {submitting ? 'Verifying credentials...' : 'Sign In to Control Centre'}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-[#64748B]">Need administrator access?</span>
              <Link
                to="/admin/request-access"
                className="font-semibold text-[#1438B8] hover:text-[#0D1F4E]"
              >
                Request Admin Access
              </Link>
            </div>

            <div className="mt-5 pt-5 border-t border-[#E2E8F0] text-xs text-[#64748B] leading-relaxed">
              Access is restricted to authorised RYZITE administrators. Failed login attempts are
              rate-limited and recorded in the server-side security audit log.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
