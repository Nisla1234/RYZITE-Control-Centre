import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, FileText, ArrowLeft, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';

export function RequestAccessPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid work email address.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Please briefly explain your role and reason for requesting admin access (at least 10 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/signup-request', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          reason: reason.trim(),
        }),
      });
      setSuccessMessage(
        res.message ||
          'Your administrator access request has been submitted for review. No account is created until approved by a super administrator.'
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to submit your request right now. Please try again.');
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
              RYZITE Access Governance
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Request Control Centre Administrator Access
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#CBD9F2]">
              Accounts are never provisioned automatically. Every request is routed to RYZITE super
              administrators for identity verification and role approval.
            </p>
          </div>
        </div>
        <div className="relative z-10 mt-12 pt-6 border-t border-white/10 text-xs text-[#94AEDB] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#60A5FA]" />
          Approval notifications sent to authorised RYZITE security contacts
        </div>
      </div>

      {/* Right Request Form */}
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
              <h2 className="text-2xl font-bold text-[#0D1F4E]">Request Admin Access</h2>
              <p className="mt-1.5 text-sm text-[#475569]">
                Submit your details for review by an authorised RYZITE super administrator.
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

            {successMessage ? (
              <div className="space-y-5">
                <div className="flex items-start gap-2.5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3.5 text-sm text-[#166534]">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#15803D]" />
                  <span>{successMessage}</span>
                </div>
                <Link
                  to="/admin/"
                  className="block w-full text-center rounded-lg bg-[#0D1F4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1438B8] transition-colors"
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="req-name"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      id="req-name"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1438B8] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/15"
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="req-email"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      id="req-email"
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

                <div>
                  <label
                    htmlFor="req-reason"
                    className="block text-sm font-medium text-[#1E293B] mb-1.5"
                  >
                    Reason for Access
                  </label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-[#64748B]" />
                    <textarea
                      id="req-reason"
                      rows={4}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Describe your team role and what content or operations you need to manage..."
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1438B8] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/15 resize-none"
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
                  {submitting ? 'Submitting request...' : 'Submit Access Request'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
