import React, { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiRequest, formatDateTime } from '../lib/api';
import { StatusText } from '../components/ui/StatusText';
import type { ActivityLogEntry } from '../types/cms';

export function ActivityLogsPage() {
  const [items, setItems] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState('');
  const [contentType, setContentType] = useState('all');
  const [result, setResult] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async (targetPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(pageSize),
        contentType,
        result,
      });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest<{ items: ActivityLogEntry[]; total: number }>(
        `/api/activity?${params.toString()}`
      );
      setItems(data.items);
      setTotal(data.total);
    } catch {
      // handled cleanly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    load(1);
  }, [contentType, result]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0D1F4E]">Activity & Audit Logs</h2>
        <p className="mt-0.5 text-sm text-[#475569]">
          Server-side immutable audit trail of authentication events, content edits, media actions, and settings changes.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load(1);
          }}
          className="relative flex-1 max-w-md"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by admin, action, record, or details..."
            className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
          />
        </form>

        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="rounded-lg border border-[#DDE5F0] bg-white px-3 py-2 text-xs font-medium text-[#334155]"
        >
          <option value="all">All Content Types</option>
          <option value="auth">Authentication</option>
          <option value="page">Website Pages</option>
          <option value="project">Portfolio</option>
          <option value="service">Services</option>
          <option value="solution">Solutions</option>
          <option value="team">Team</option>
          <option value="article">Articles</option>
          <option value="testimonial">Testimonials</option>
          <option value="media">Media</option>
          <option value="seo">SEO</option>
          <option value="settings">Settings</option>
        </select>

        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="rounded-lg border border-[#DDE5F0] bg-white px-3 py-2 text-xs font-medium text-[#334155]"
        >
          <option value="all">All Results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFD] text-xs font-semibold text-[#475569]">
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Administrator</th>
                <th className="px-4 py-3.5">Action & Type</th>
                <th className="px-4 py-3.5">Record & Details</th>
                <th className="px-6 py-3.5 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    Loading audit trail...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    No audit entries match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-6 py-3 font-mono text-xs tabular-nums text-[#64748B] whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-[#0F172A]">{entry.adminName}</div>
                      <div className="font-mono text-[11px] text-[#64748B]">@{entry.adminUsername}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium capitalize text-[#1438B8]">
                        {entry.action.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] capitalize text-[#64748B]">{entry.contentType}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-[#0F172A]">{entry.recordTitle}</div>
                      <div className="text-xs text-[#475569]">{entry.details}</div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <StatusText status={entry.result} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between text-xs text-[#475569]">
          <span className="font-mono tabular-nums">
            Showing {items.length} of {total} entries · Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                load(next);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2.5 py-1 hover:bg-[#F4F7FC] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(next);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2.5 py-1 hover:bg-[#F4F7FC] disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
