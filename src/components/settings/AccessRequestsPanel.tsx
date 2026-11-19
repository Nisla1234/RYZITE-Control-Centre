import React, { useEffect, useState } from 'react';
import { UserPlus, Check, X, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiRequest, ApiError, formatDateTime } from '../../lib/api';
import type { AdminAccessRequest } from '../../types/cms';

export function AccessRequestsPanel() {
  const [items, setItems] = useState<AdminAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'editor'>('admin');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: AdminAccessRequest[] }>('/api/admin/access-requests');
      setItems(res.items || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load access requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const startReview = (req: AdminAccessRequest, action: 'approve' | 'reject') => {
    setReviewingId(req.id);
    setReviewAction(action);
    const suggested = req.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .slice(0, 32);
    setUsername(suggested.length >= 3 ? suggested : `${suggested}_admin`);
    setRole('admin');
    setReviewNotes('');
    setError(null);
    setFeedback(null);
  };

  const cancelReview = () => {
    setReviewingId(null);
    setReviewAction(null);
    setReviewNotes('');
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingId || !reviewAction) return;

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      if (reviewAction === 'approve') {
        const res = await apiRequest<{ ok: boolean; emailSent?: boolean; emailError?: string }>(
          `/api/admin/access-requests/${encodeURIComponent(reviewingId)}/approve`,
          {
            method: 'POST',
            body: JSON.stringify({
              username: username.trim(),
              role,
              reviewNotes: reviewNotes.trim(),
            }),
          }
        );
        setFeedback(
          res.emailSent
            ? `Request approved. Account "${username.trim()}" created and a 15-minute password setup link was emailed.`
            : `Request approved and account "${username.trim()}" created, but the setup email could not be sent (${res.emailError || 'configure RESEND_API_KEY'}).`
        );
      } else {
        await apiRequest(`/api/admin/access-requests/${encodeURIComponent(reviewingId)}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reviewNotes: reviewNotes.trim() }),
        });
        setFeedback('Access request rejected and recorded in the security audit log.');
      }
      cancelReview();
      await loadRequests();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to process review.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
        <div>
          <h3 className="text-sm font-semibold text-[#0D1F4E] flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#1438B8]" />
            Administrator Access Requests
          </h3>
          <p className="text-xs text-[#64748B] mt-0.5">
            Only super_admin accounts can approve or reject incoming admin signup requests.
          </p>
        </div>
        <span className="text-xs font-mono font-semibold text-[#1438B8]">
          {pendingCount} pending
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 text-xs text-[#166534]">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#15803D]" />
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[#64748B] py-4">Loading access requests...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[#64748B] py-4">
          No administrator access requests have been submitted yet.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#0F172A]">{item.fullName}</div>
                  <div className="text-xs font-mono text-[#475569]">{item.email}</div>
                </div>
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    item.status === 'pending'
                      ? 'text-[#B45309]'
                      : item.status === 'approved'
                      ? 'text-[#15803D]'
                      : 'text-[#B91C1C]'
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <p className="text-xs text-[#334155] leading-relaxed bg-white rounded border border-[#E2E8F0] px-3 py-2">
                {item.reason}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Submitted {formatDateTime(item.createdAt)} · IP {item.requestedIp}
                </span>
                {item.reviewedBy && (
                  <span>
                    Reviewed by <strong className="text-[#1E293B]">{item.reviewedBy}</strong> on{' '}
                    {formatDateTime(item.reviewedAt)}
                  </span>
                )}
              </div>

              {item.reviewNotes && (
                <div className="text-xs text-[#475569]">
                  <span className="font-semibold">Notes:</span> {item.reviewNotes}
                </div>
              )}

              {item.status === 'pending' && reviewingId !== item.id && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => startReview(item, 'approve')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#102D96]"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => startReview(item, 'reject')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-white px-3 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              )}

              {reviewingId === item.id && reviewAction && (
                <form
                  onSubmit={submitReview}
                  className="mt-2 rounded-lg border border-[#CBD5E1] bg-white p-4 space-y-3"
                >
                  <div className="text-xs font-semibold text-[#0D1F4E]">
                    {reviewAction === 'approve'
                      ? 'Approve & Provision Administrator Account'
                      : 'Reject Administrator Access Request'}
                  </div>

                  {reviewAction === 'approve' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#1E293B] mb-1">
                          Assigned Username
                        </label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                          className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-xs font-mono focus:border-[#1438B8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#1E293B] mb-1">
                          Assigned Role
                        </label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value as 'admin' | 'editor')}
                          className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-xs bg-white focus:border-[#1438B8] focus:outline-none"
                        >
                          <option value="admin">admin</option>
                          <option value="editor">editor</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-[#1E293B] mb-1">
                      Review Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder={
                        reviewAction === 'approve'
                          ? 'e.g. Verified RYZITE engineering team member'
                          : 'e.g. Unverified external request'
                      }
                      className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-xs focus:border-[#1438B8] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelReview}
                      disabled={submitting}
                      className="rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFD]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white ${
                        reviewAction === 'approve'
                          ? 'bg-[#1438B8] hover:bg-[#102D96]'
                          : 'bg-[#DC2626] hover:bg-[#B91C1C]'
                      }`}
                    >
                      {submitting
                        ? 'Saving...'
                        : reviewAction === 'approve'
                        ? 'Confirm Approval & Send Setup Link'
                        : 'Confirm Rejection'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
