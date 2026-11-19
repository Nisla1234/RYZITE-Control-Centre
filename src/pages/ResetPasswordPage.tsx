import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      setTokenError('Missing password reset token. Please request a new reset link.');
      return;
    }

    let active = true;
    apiRequest<{ valid: boolean }>(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!active) return;
        setTokenValid(Boolean(res.valid));
      })
      .catch((err) => {
        if (!active) return;
        setTokenValid(false);
        setTokenError(
          err instanceof ApiError
            ? err.message
            : 'This password reset link is invalid or has expired.'
        );
      })
      .finally(() => {
        if (active) setValidating(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccessMessage(
        res.message || 'Your password has been updated. You can now sign in with your new password.'
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to reset password. Please request a new link.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="lg:w-[46%] bg-[#0D1F4E] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #2563EB 0%, transparent 70%)' }}
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
              RYZITE Security Credentials
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Create a New Administrator Password
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#CBD9F2]">
              Your new password is protected with a unique cryptographic salt and Node.js scrypt
              hashing. All previous sessions will be revoked automatically.
            </p>
          </div>
        </div>
        <div className="relative z-10 mt-12 pt-6 border-t border-white/10 text-xs text-[#94AEDB] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#60A5FA]" />
          Single-use token invalidated immediately upon completion
        </div>
      </div>

      {/* Right Reset Card */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-[#DDE5F0] bg-white p-8 shadow-sm">
            <Link
              to="/admin/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1438B8] hover:text-[#0D1F4E] mb-6"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#0D1F4E]">Set New Password</h2>
              <p className="mt-1.5 text-sm text-[#475569]">
                Choose a strong password of at least 10 characters with upper/lowercase letters and a
                number or symbol.
              </p>
            </div>

            {validating ? (
              <div className="py-8 text-center text-sm text-[#475569]">
                Validating your single-use recovery link...
              </div>
            ) : successMessage ? (
              <div className="space-y-5">
                <div className="flex items-start gap-2.5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3.5 text-sm text-[#166534]">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#15803D]" />
                  <span>{successMessage}</span>
                </div>
                <Link
                  to="/admin/"
                  className="block w-full text-center rounded-lg bg-[#1438B8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#102D96] transition-colors"
                >
                  Sign In to Control Centre
                </Link>
              </div>
            ) : !tokenValid ? (
              <div className="space-y-5">
                <div className="flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3.5 text-sm text-[#991B1B]">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
                  <span>{tokenError || 'This password reset link is invalid or has expired.'}</span>
                </div>
                <Link
                  to="/admin/forgot-password"
                  className="block w-full text-center rounded-lg bg-[#1438B8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#102D96] transition-colors"
                >
                  Request a New Reset Link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-sm text-[#991B1B]"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 10 characters"
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

                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      id="reset-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1438B8] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/15"
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-[#1438B8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#102D96] disabled:opacity-60"
                >
                  {submitting ? 'Updating password...' : 'Save New Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
