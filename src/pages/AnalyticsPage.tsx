import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { BarChart3, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AnalyticsDateRange, AnalyticsReport } from '../types/cms';

const PRESETS: { id: AnalyticsDateRange['preset']; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom' },
];

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<AnalyticsDateRange['preset']>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (p = preset, s = startDate, e = endDate) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset: p });
      if (p === 'custom' && s && e) {
        params.set('startDate', s);
        params.set('endDate', e);
      }
      const data = await apiRequest<AnalyticsReport>(`/api/analytics?${params.toString()}`);
      setReport(data);
    } catch {
      // handled cleanly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('30d');
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">Google Analytics 4 Telemetry</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Server-side GA4 Data API integration. Displays verified live data only.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-[#DDE5F0] bg-white p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPreset(p.id);
                  if (p.id !== 'custom') load(p.id);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  preset === p.id ? 'bg-[#1438B8] text-white' : 'text-[#475569] hover:text-[#0D1F4E]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-[#DDE5F0] bg-white px-2.5 py-1.5 text-xs"
              />
              <span className="text-xs text-[#64748B]">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-[#DDE5F0] bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => load('custom', startDate, endDate)}
                className="rounded-lg bg-[#1438B8] px-3 py-1.5 text-xs font-medium text-white"
              >
                Apply
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#DDE5F0] bg-white py-16 text-center text-sm text-[#64748B]">
          Querying Google Analytics 4 Data API...
        </div>
      ) : !report?.configured || report.error ? (
        <div className="rounded-xl border border-[#DDE5F0] bg-white p-8 max-w-3xl space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF3FC] text-[#1438B8]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0D1F4E]">
                {report?.error ? 'Google Analytics 4 API Error' : 'Google Analytics 4 Not Connected'}
              </h3>
              <p className="mt-1 text-sm text-[#475569] leading-relaxed">
                {report?.error
                  ? report.error
                  : 'To keep reporting strictly accurate, RYZITE Control Centre never generates synthetic or placeholder analytics numbers. Supply your GA4 service account credentials on the server to activate live reporting.'}
              </p>
            </div>
          </div>

          {report?.missingVars && report.missingVars.length > 0 && (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-4 space-y-2">
              <div className="text-xs font-semibold text-[#0D1F4E]">
                Required Server-Side Environment Variables (missing):
              </div>
              <ul className="space-y-1 font-mono text-xs text-[#334155]">
                {report.missingVars.map((v) => (
                  <li key={v}>· {v}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 text-xs text-[#475569] leading-relaxed">
            <p className="font-semibold text-[#0D1F4E]">How to connect GA4 securely:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Enable the Google Analytics Data API in your Google Cloud project.</li>
              <li>Create a Service Account and download its JSON key.</li>
              <li>Add the service account email as a Viewer in GA4 Admin → Property Access Management.</li>
              <li>
                Add <span className="font-mono">GA4_PROPERTY_ID</span>,{' '}
                <span className="font-mono">GA4_CLIENT_EMAIL</span>, and{' '}
                <span className="font-mono">GA4_PRIVATE_KEY</span> to your server environment variables (never expose in frontend <span className="font-mono">VITE_</span> vars).
              </li>
            </ol>
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center gap-2 text-xs text-[#64748B]">
            <ShieldCheck className="h-4 w-4 text-[#1438B8]" />
            All GA4 requests are signed server-side via RS256 JWT and proxied through authenticated endpoints.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Summary Grid */}
          {report.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: report.summary.totalUsers.toLocaleString() },
                { label: 'Active Users', value: report.summary.activeUsers.toLocaleString() },
                { label: 'New Users', value: report.summary.newUsers.toLocaleString() },
                { label: 'Returning Users', value: report.summary.returningUsers.toLocaleString() },
                { label: 'Sessions', value: report.summary.sessions.toLocaleString() },
                { label: 'Page Views', value: report.summary.pageViews.toLocaleString() },
                { label: 'Engagement Rate', value: `${report.summary.engagementRate}%` },
                { label: 'Avg Engagement Time', value: formatDuration(report.summary.avgEngagementDurationSec) },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-[#DDE5F0] bg-white p-4">
                  <div className="text-xs font-medium text-[#64748B]">{kpi.label}</div>
                  <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-[#0D1F4E]">
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Trend Chart */}
          {report.dailyTrend && report.dailyTrend.length > 0 && (
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6">
              <h3 className="text-sm font-semibold text-[#0D1F4E] mb-4">
                Visitor & Page View Trend ({report.dateRange.label})
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="pageViews" name="Page Views" stroke="#2563EB" fill="#DBEAFE" />
                    <Area type="monotone" dataKey="users" name="Users" stroke="#0D1F4E" fill="#BFDBFE" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Top Performing Pages</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                    <th className="px-6 py-2.5">Path</th>
                    <th className="px-4 py-2.5 text-right">Views</th>
                    <th className="px-6 py-2.5 text-right">Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(report.topPages || []).map((p) => (
                    <tr key={p.path}>
                      <td className="px-6 py-2.5 font-mono text-[#0F172A] truncate max-w-[220px]">{p.path}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.views.toLocaleString()}</td>
                      <td className="px-6 py-2.5 text-right font-mono tabular-nums">{p.users.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Traffic Channels & Sources</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                    <th className="px-6 py-2.5">Channel</th>
                    <th className="px-4 py-2.5 text-right">Sessions</th>
                    <th className="px-6 py-2.5 text-right">Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(report.channels || []).map((c) => (
                    <tr key={c.channel}>
                      <td className="px-6 py-2.5 font-medium text-[#0F172A]">{c.channel}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.sessions.toLocaleString()}</td>
                      <td className="px-6 py-2.5 text-right font-mono tabular-nums">{c.users.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Countries & Cities</h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B]">
                    <th className="px-6 py-2.5">Country</th>
                    <th className="px-4 py-2.5 text-right">Users</th>
                    <th className="px-6 py-2.5 text-right">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(report.countries || []).map((c) => (
                    <tr key={c.country}>
                      <td className="px-6 py-2.5 text-[#0F172A]">{c.country}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.users.toLocaleString()}</td>
                      <td className="px-6 py-2.5 text-right font-mono tabular-nums">{c.sessions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Devices & Browsers</h3>
              </div>
              <div className="p-6 grid grid-cols-2 gap-6 text-xs">
                <div className="space-y-2">
                  <div className="font-semibold text-[#475569]">Device Category</div>
                  {(report.devices || []).map((d) => (
                    <div key={d.device} className="flex justify-between">
                      <span className="capitalize text-[#0F172A]">{d.device}</span>
                      <span className="font-mono tabular-nums text-[#475569]">{d.sharePct}%</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="font-semibold text-[#475569]">Top Browsers</div>
                  {(report.browsers || []).map((b) => (
                    <div key={b.browser} className="flex justify-between">
                      <span className="text-[#0F172A]">{b.browser}</span>
                      <span className="font-mono tabular-nums text-[#475569]">{b.sharePct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
