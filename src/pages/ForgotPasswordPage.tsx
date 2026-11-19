import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid registered administrator email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed }),
      });
      setSubmittedMessage(
        res.message ||
          'If an administrator account is registered with that email address, a password reset link has been sent. The link expires in 15 minutes.'
      );
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
              RYZITE Account Recovery
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Secure Administrator Password Recovery
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#CBD9F2]">
              Recovery links are single-use, cryptographically hashed in PostgreSQL, and expire
              automatically after 15 minutes.
            </p>
          </div>
        </div>
        <div className="relative z-10 mt-12 pt-6 border-t border-white/10 text-xs text-[#94AEDB] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#60A5FA]" />
          All recovery attempts are logged and reported to RYZITE security administrators
        </div>
      </div>

      {/* Right Recovery Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-[#DDE5F0] bg-white p-8 shadow-sm">
            <Link
              to="/admin/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1438B8] hover:text-[#0D1F4E] mb-6"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Administrator Sign In
            </Link>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-[#0D1F4E]">Forgot Password</h2>
              <p className="mt-1.5 text-sm text-[#475569]">
                Enter the email address registered to your RYZITE administrator account.
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

            {submittedMessage ? (
              <div className="space-y-5">
                <div className="flex items-start gap-2.5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3.5 text-sm text-[#166534]">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#15803D]" />
                  <span>{submittedMessage}</span>
                </div>
                <Link
                  to="/admin/"
                  className="block w-full text-center rounded-lg bg-[#0D1F4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1438B8] transition-colors"
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@ryzite.lk"
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
                  {submitting ? 'Sending recovery link...' : 'Send Password Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
