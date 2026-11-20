import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ArrowRight,
  Calendar,
  Database,
  BarChart3,
  RefreshCw,
  FileText,
  Briefcase,
  Wrench,
  BookOpen,
  Image as ImageIcon,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest, formatDateTime } from '../lib/api';
import { StatusText } from '../components/ui/StatusText';
import type { ActivityLogEntry, AnalyticsDateRange, AnalyticsReport, IntegrationStatus } from '../types/cms';

interface DashboardOverview {
  counts: Record<string, { total: number; published: number; draft: number }>;
  mediaCount: number;
  mediaStorageBytes?: number;
  missingAltCount?: number;
  seoSummary?: {
    errorCount: number;
    warningCount: number;
    moduleCounts: Record<string, number>;
  };
  recentUpdates: {
    id: string;
    docType: string;
    title: string;
    slug?: string;
    status: 'draft' | 'published';
    updatedAt: string;
    updatedBy: string;
  }[];
  recentPages?: {
    id: string;
    title: string;
    slug: string;
    status: 'draft' | 'published';
    updatedAt: string;
    updatedBy: string;
  }[];
  recentMedia?: {
    id: string;
    title?: string;
    originalName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  }[];
  recentActivity: ActivityLogEntry[];
  sanity: IntegrationStatus['sanity'];
  ga4: IntegrationStatus['ga4'];
}

const PRESETS: { id: AnalyticsDateRange['preset']; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
  { id: '90d', label: 'Last 90d' },
  { id: 'custom', label: 'Custom' },
];

const DOC_ROUTE_MAP: Record<string, string> = {
  page: '/admin/pages/',
  project: '/admin/portfolio/',
  service: '/admin/services/',
  solution: '/admin/solutions/',
  team: '/admin/team/',
  article: '/admin/articles/',
  testimonial: '/admin/testimonials/',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [preset, setPreset] = useState<AnalyticsDateRange['preset']>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<DashboardOverview>('/api/dashboard/overview');
      setOverview(data);
    } catch {
      // 401 is handled globally by AuthContext; keep UI clean
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async (
    nextPreset: AnalyticsDateRange['preset'] = preset,
    start = customStart,
    end = customEnd
  ) => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ preset: nextPreset });
      if (nextPreset === 'custom' && start && end) {
        params.set('startDate', start);
        params.set('endDate', end);
      }
      const data = await apiRequest<AnalyticsReport>(`/api/analytics?${params.toString()}`);
      setAnalytics(data);
    } catch {
      // handled cleanly without unhandled rejection
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadAnalytics('30d');
  }, []);

  const handlePresetClick = (p: AnalyticsDateRange['preset']) => {
    setPreset(p);
    if (p !== 'custom') {
      loadAnalytics(p);
    }
  };

  const totalPublished = overview
    ? Object.values(overview.counts).reduce((sum, c) => sum + c.published, 0)
    : 0;
  const totalDrafts = overview
    ? Object.values(overview.counts).reduce((sum, c) => sum + c.draft, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Greeting & Date Range Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">Executive Overview</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Live content operations, integration health, and Google Analytics 4 performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-[#DDE5F0] bg-white p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetClick(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === p.id
                    ? 'bg-[#1438B8] text-white'
                    : 'text-[#475569] hover:text-[#0D1F4E]'
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
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-[#DDE5F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A]"
              />
              <span className="text-xs text-[#64748B]">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-[#DDE5F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A]"
              />
              <button
                type="button"
                onClick={() => loadAnalytics('custom', customStart, customEnd)}
                className="rounded-lg bg-[#1438B8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#102D96]"
              >
                Apply
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              loadOverview();
              loadAnalytics();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* CMS & SEO Health Strip (Real Database Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/admin/pages/"
          className="rounded-xl border border-[#DDE5F0] bg-white p-4 hover:border-[#1438B8] transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-xs font-medium text-[#64748B]">Website Pages</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-0.5 font-mono tabular-nums">
              {overview?.counts.page?.published ?? 0}
              <span className="text-xs font-normal text-[#64748B] ml-1.5">
                live / {overview?.counts.page?.draft ?? 0} draft
              </span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </Link>

        <Link
          to="/admin/seo/"
          className="rounded-xl border border-[#DDE5F0] bg-white p-4 hover:border-[#1438B8] transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-xs font-medium text-[#64748B]">SEO Health Issues</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-0.5 font-mono tabular-nums">
              {overview?.seoSummary?.errorCount ?? 0}
              <span className="text-xs font-normal text-red-600 ml-1">err</span>
              <span className="text-xs font-normal text-[#64748B] mx-1">·</span>
              <span className="text-lg font-bold text-amber-600">
                {overview?.seoSummary?.warningCount ?? 0}
              </span>
              <span className="text-xs font-normal text-amber-700 ml-1">warn</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </Link>

        <Link
          to="/admin/media/"
          className="rounded-xl border border-[#DDE5F0] bg-white p-4 hover:border-[#1438B8] transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-xs font-medium text-[#64748B]">Media Storage</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-0.5 font-mono tabular-nums">
              {((overview?.mediaStorageBytes ?? 0) / (1024 * 1024)).toFixed(2)}
              <span className="text-xs font-normal text-[#64748B] ml-1">MB</span>
            </p>
            <p className="text-[11px] text-[#64748B]">
              {overview?.mediaCount ?? 0} total asset(s)
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
        </Link>

        <Link
          to="/admin/media/"
          className="rounded-xl border border-[#DDE5F0] bg-white p-4 hover:border-[#1438B8] transition-colors flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-xs font-medium text-[#64748B]">Missing Alt Text</p>
            <p className="text-2xl font-bold text-[#0F172A] mt-0.5 font-mono tabular-nums">
              {overview?.missingAltCount ?? 0}
              <span className="text-xs font-normal text-[#64748B] ml-1.5">images</span>
            </p>
            <p className="text-[11px] text-[#64748B]">
              {(overview?.missingAltCount ?? 0) === 0 ? 'All media accessible' : 'Click to fix in Media'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
        </Link>
      </div>

      {/* Top Hero Split — Inspired by Reference Image 2 (Deep RYZITE Navy Summary + Chart / Status Area) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Featured Navy Summary + Analytics Chart (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-[#DDE5F0] bg-white overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Deep RYZITE Navy Highlight Column */}
          <div className="md:col-span-4 bg-[#13254D] text-white p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-[#94AEDB]">CMS Content Inventory</p>
              <div className="mt-2 text-3xl font-bold font-mono tabular-nums">
                {loading ? '—' : totalPublished + totalDrafts}
              </div>
              <p className="mt-1 text-xs text-[#CBD9F2]">
                {totalPublished} published · {totalDrafts} drafts · {overview?.mediaCount ?? 0} media files
              </p>
            </div>

            <div className="mt-6 space-y-2.5 border-t border-white/10 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#CBD9F2]">Website Pages</span>
                <span className="font-mono tabular-nums font-semibold">
                  {overview?.counts.page?.total ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#CBD9F2]">Portfolio Projects</span>
                <span className="font-mono tabular-nums font-semibold">
                  {overview?.counts.project?.total ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#CBD9F2]">Services & Solutions</span>
                <span className="font-mono tabular-nums font-semibold">
                  {(overview?.counts.service?.total ?? 0) + (overview?.counts.solution?.total ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#CBD9F2]">Articles & Team</span>
                <span className="font-mono tabular-nums font-semibold">
                  {(overview?.counts.article?.total ?? 0) + (overview?.counts.team?.total ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Right Chart / Real GA4 Traffic Area */}
          <div className="md:col-span-8 p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#0D1F4E]">
                  Website Traffic Trend (Google Analytics 4)
                </h3>
                <p className="text-xs text-[#64748B]">
                  {analytics?.dateRange?.label || 'Last 30 days'}
                </p>
              </div>
              <Link
                to="/admin/analytics/"
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1438B8] hover:underline whitespace-nowrap"
              >
                Full report
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {analyticsLoading ? (
              <div className="h-52 flex items-center justify-center text-sm text-[#64748B]">
                Querying Google Analytics 4...
              </div>
            ) : analytics?.configured && analytics.dailyTrend && analytics.dailyTrend.length > 0 ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip />
                    <Bar dataKey="users" name="Users" fill="#1438B8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="sessions" name="Sessions" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52 flex flex-col items-start justify-center rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFD] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0D1F4E]">
                  <BarChart3 className="h-4 w-4 text-[#1438B8]" />
                  Google Analytics 4 Not Connected
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                  {analytics?.error
                    ? analytics.error
                    : 'No analytics figures are fabricated. Supply GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, and GA4_PRIVATE_KEY in server environment variables to display live visitor, session, and engagement metrics.'}
                </p>
                <Link
                  to="/admin/analytics/"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#102D96]"
                >
                  View GA4 Setup Instructions
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Integration & Environment Status Card (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-[#DDE5F0] bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-semibold text-[#0D1F4E]">Connected Services</h3>
              <Link to="/admin/settings/" className="text-xs font-medium text-[#1438B8] hover:underline">
                Configure
              </Link>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0F172A]">
                    <Database className="h-4 w-4 text-[#1438B8]" />
                    Sanity CMS
                  </span>
                  <StatusText
                    status={overview?.sanity.mode === 'sanity_live' ? 'connected' : 'warning'}
                    label={overview?.sanity.mode === 'sanity_live' ? 'Live Write' : 'Staging Mode'}
                  />
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Project <span className="font-mono text-[#0D1F4E]">{overview?.sanity.projectId || 'hnm8jy5w'}</span> · Dataset{' '}
                  <span className="font-mono text-[#0D1F4E]">{overview?.sanity.dataset || 'staging'}</span>
                </p>
                {overview?.sanity.mode !== 'sanity_live' && (
                  <p className="text-xs text-[#64748B]">
                    Production dataset is protected. Set <span className="font-mono">SANITY_API_TOKEN</span> for live Sanity writes.
                  </p>
                )}
              </div>

              <div className="border-t border-[#E2E8F0] pt-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0F172A]">
                    <BarChart3 className="h-4 w-4 text-[#1438B8]" />
                    Google Analytics 4
                  </span>
                  <StatusText
                    status={overview?.ga4.configured ? 'connected' : 'disconnected'}
                    label={overview?.ga4.configured ? 'Connected' : 'Not Configured'}
                  />
                </div>
                <p className="text-xs text-[#64748B]">
                  {overview?.ga4.configured
                    ? `Property ID: ${overview.ga4.propertyId}`
                    : 'Awaiting GA4 Data API service account variables.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#475569]">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#1438B8]" />
              {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date())}
            </span>
            <Link to="/admin/seo/" className="font-medium text-[#1438B8] hover:underline">
              Run SEO Audit
            </Link>
          </div>
        </div>
      </div>

      {/* GA4 KPI Strip — Rendered strictly when real GA4 data is available */}
      {analytics?.configured && analytics.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Visitors', value: analytics.summary.totalUsers.toLocaleString() },
            { label: 'Active Users', value: analytics.summary.activeUsers.toLocaleString() },
            { label: 'Sessions', value: analytics.summary.sessions.toLocaleString() },
            { label: 'Page Views', value: analytics.summary.pageViews.toLocaleString() },
            { label: 'New Users', value: analytics.summary.newUsers.toLocaleString() },
            { label: 'Returning Users', value: analytics.summary.returningUsers.toLocaleString() },
            { label: 'Engagement Rate', value: `${analytics.summary.engagementRate}%` },
            { label: 'Avg Engagement', value: formatDuration(analytics.summary.avgEngagementDurationSec) },
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

      {/* Quick Access Module Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Pages', count: overview?.counts.page?.total ?? 0, to: '/admin/pages/', icon: FileText },
          { label: 'Portfolio', count: overview?.counts.project?.total ?? 0, to: '/admin/portfolio/', icon: Briefcase },
          { label: 'Services', count: overview?.counts.service?.total ?? 0, to: '/admin/services/', icon: Wrench },
          { label: 'Articles', count: overview?.counts.article?.total ?? 0, to: '/admin/articles/', icon: BookOpen },
          { label: 'Media', count: overview?.mediaCount ?? 0, to: '/admin/media/', icon: ImageIcon },
          { label: 'SEO Audit', count: null, to: '/admin/seo/', icon: ShieldAlert },
        ].map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className="flex items-center justify-between rounded-xl border border-[#DDE5F0] bg-white px-4 py-3.5 transition-colors hover:border-[#1438B8]/40 hover:bg-[#F8FAFD]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <m.icon className="h-4 w-4 shrink-0 text-[#1438B8]" />
              <span className="text-sm font-medium text-[#0F172A] truncate">{m.label}</span>
            </div>
            {m.count !== null ? (
              <span className="font-mono text-sm font-semibold tabular-nums text-[#0D1F4E]">
                {m.count}
              </span>
            ) : (
              <ArrowRight className="h-3.5 w-3.5 text-[#64748B]" />
            )}
          </Link>
        ))}
      </div>

      {/* Bottom Two-Column Tables: Recent Content Updates & Recent Admin Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Content Updates */}
        <div className="lg:col-span-7 rounded-xl border border-[#DDE5F0] bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#0D1F4E]">Recent Content Updates</h3>
            <Link to="/admin/pages/" className="text-xs font-medium text-[#1438B8] hover:underline">
              Manage pages
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-xs font-medium text-[#64748B]">
                  <th className="px-6 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-xs text-[#64748B]">
                      Loading content updates...
                    </td>
                  </tr>
                ) : overview && overview.recentUpdates.length > 0 ? (
                  overview.recentUpdates.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8FAFD]">
                      <td className="px-6 py-3 font-medium text-[#0F172A]">
                        <Link
                          to={DOC_ROUTE_MAP[item.docType] || '/admin/pages/'}
                          className="hover:text-[#1438B8] hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-[#475569]">{item.docType}</td>
                      <td className="px-4 py-3">
                        <StatusText status={item.status} />
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-[#64748B]">
                        {formatDateTime(item.updatedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-xs text-[#64748B]">
                      No content updates recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Admin Activity */}
        <div className="lg:col-span-5 rounded-xl border border-[#DDE5F0] bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#0D1F4E]">Recent Admin Activity</h3>
            <Link to="/admin/activity/" className="text-xs font-medium text-[#1438B8] hover:underline">
              Full audit log
            </Link>
          </div>
          <div className="divide-y divide-[#F1F5F9]">
            {loading ? (
              <div className="px-6 py-8 text-center text-xs text-[#64748B]">Loading activity...</div>
            ) : overview && overview.recentActivity.length > 0 ? (
              overview.recentActivity.map((entry) => (
                <div key={entry.id} className="px-6 py-3.5 hover:bg-[#F8FAFD]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0F172A] truncate">
                      {entry.adminName} · <span className="capitalize text-[#1438B8]">{entry.action.replace('_', ' ')}</span>
                    </span>
                    <StatusText status={entry.result} />
                  </div>
                  <p className="mt-1 text-xs text-[#475569] truncate">{entry.details}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] font-mono tabular-nums text-[#94A3B8]">
                    <span>{entry.contentType}</span>
                    <span>·</span>
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-xs text-[#64748B]">
                No admin activity recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
