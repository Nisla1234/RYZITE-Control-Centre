import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gauge,
  Loader2,
  RefreshCw,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface PageSpeedReport {
  id: string;
  page_id: string;
  page_slug: string;
  page_title: string;
  strategy: 'desktop' | 'mobile';
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  fcp: string | null;
  lcp: string | null;
  tbt: string | null;
  cls: string | null;
  speed_index: string | null;
  core_web_vitals_status: string | null;
  opportunities_json: string | null;
  diagnostics_json: string | null;
  recommendations_json: string | null;
  status: 'not_tested' | 'testing' | 'completed' | 'failed';
  tested_at: string | null;
  error_message: string | null;
}

interface PageSpeedSummaryWidgetProps {
  pageId: string;
  pageSlug: string;
  pageTitle: string;
}

function getScoreColor(score: number | null): string {
  if (score == null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (score >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-300';
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-300';
  return 'bg-rose-50 text-rose-700 border-rose-300';
}

function getScoreRing(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 90) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-rose-600';
}

export function PageSpeedSummaryWidget({
  pageId,
  pageSlug,
  pageTitle,
}: PageSpeedSummaryWidgetProps) {
  const [reports, setReports] = useState<PageSpeedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [activeModalReport, setActiveModalReport] = useState<PageSpeedReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const res = await apiFetch<{ reports: PageSpeedReport[] }>(`/api/pagespeed/page/${pageId}`);
      setReports(res.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const runTest = async (strategy: 'desktop' | 'mobile' | 'both') => {
    setTesting(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ results: PageSpeedReport[] }>('/api/pagespeed/run', {
        method: 'POST',
        body: JSON.stringify({ pageId, strategy }),
      });
      if (res.results) {
        setReports((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]));
          res.results.forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
        setNotice('PageSpeed Insights analysis completed successfully.');
      }
    } catch (err: any) {
      setNotice(err.message || 'PageSpeed test failed.');
    } finally {
      setTesting(false);
    }
  };

  const desktopReport = reports.find((r) => r.strategy === 'desktop');
  const mobileReport = reports.find((r) => r.strategy === 'mobile');

  const renderCard = (strategy: 'desktop' | 'mobile', report?: PageSpeedReport) => {
    const isDesktop = strategy === 'desktop';
    const Icon = isDesktop ? Monitor : Smartphone;
    const title = isDesktop ? 'Desktop Performance' : 'Mobile Performance';

    const isTested = report && report.status === 'completed';
    const isFailed = report && report.status === 'failed';
    const isTesting = report && report.status === 'testing';

    return (
      <div className="rounded-xl border border-[#DDE5F0] bg-white p-4 shadow-xs flex flex-col justify-between gap-4">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#E5ECF6] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#0F172A]">{title}</h4>
              <p className="text-[10px] text-[#64748B]">
                {report?.tested_at
                  ? `Tested: ${new Date(report.tested_at).toLocaleString()}`
                  : 'Not tested yet'}
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
              isTested
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isTesting || testing
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                  : isFailed
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isTesting || testing ? 'Testing...' : report?.status || 'Not tested yet'}
          </span>
        </div>

        {/* Scores Grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {(
            [
              ['Performance', report?.performance_score],
              ['Accessibility', report?.accessibility_score],
              ['Best Practices', report?.best_practices_score],
              ['SEO', report?.seo_score],
            ] as const
          ).map(([lbl, val]) => (
            <div key={lbl} className="rounded-lg border border-[#E5ECF6] bg-[#F8FAFD] p-2">
              <p
                className={`text-base sm:text-lg font-extrabold ${getScoreRing(
                  val ?? null
                )}`}
              >
                {val != null ? val : '—'}
              </p>
              <p className="text-[10px] font-medium text-[#64748B] mt-0.5 truncate" title={lbl}>
                {lbl}
              </p>
            </div>
          ))}
        </div>

        {/* Core Web Vitals & Metrics */}
        {isTested ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between bg-[#F8FAFD] rounded-lg px-3 py-1.5 border border-[#E5ECF6]">
              <span className="text-[#475569] font-medium">Core Web Vitals</span>
              <span
                className={`font-semibold ${
                  report.core_web_vitals_status === 'Passed'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {report.core_web_vitals_status || 'Evaluated'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[#475569]">
              <div>
                FCP: <strong className="text-[#0F172A]">{report.fcp || 'N/A'}</strong>
              </div>
              <div>
                LCP: <strong className="text-[#0F172A]">{report.lcp || 'N/A'}</strong>
              </div>
              <div>
                TBT: <strong className="text-[#0F172A]">{report.tbt || 'N/A'}</strong>
              </div>
              <div>
                CLS: <strong className="text-[#0F172A]">{report.cls || 'N/A'}</strong>
              </div>
            </div>
          </div>
        ) : isFailed ? (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-800 space-y-1">
            <p className="font-semibold">Test could not be completed</p>
            <p className="opacity-90">{report.error_message || 'API error or missing API key.'}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#CBD8EC] bg-[#F8FAFD] p-5 text-center text-xs text-[#64748B]">
            <Gauge className="w-6 h-6 text-[#94A3B8] mx-auto mb-1.5" />
            <p className="font-medium">No PageSpeed report recorded yet.</p>
            <p className="text-[10px] text-[#94A3B8] mt-0.5">Click run test below to analyze live.</p>
          </div>
        )}

        {/* Card Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-[#E5ECF6]">
          <button
            type="button"
            onClick={() => runTest(strategy)}
            disabled={testing || isTesting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isTesting || testing ? 'animate-spin' : ''}`} />
            Run {isDesktop ? 'Desktop' : 'Mobile'} Test
          </button>
          {isTested && (
            <button
              type="button"
              onClick={() => setActiveModalReport(report)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-3 py-1.5 text-xs font-semibold text-[#334155]"
            >
              Full Report
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[#DDE5F0] bg-[#F8FAFD] p-4 sm:p-5 space-y-3 mb-6 shadow-xs">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1438B8] text-white flex items-center justify-center shrink-0">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              Google PageSpeed Insights — Live Performance & SEO Audit
            </h3>
            <p className="text-xs text-[#64748B]">
              Public URL: <code className="font-mono text-[11px]">https://ryzite.lk{pageSlug}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runTest('desktop')}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Run Desktop
          </button>
          <button
            type="button"
            onClick={() => runTest('mobile')}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Run Mobile
          </button>
          <button
            type="button"
            onClick={() => runTest('both')}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            Run Both Tests
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-900 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Two Report Cards (Desktop & Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderCard('desktop', desktopReport)}
        {renderCard('mobile', mobileReport)}
      </div>

      {/* Full Report Modal */}
      {activeModalReport && (
        <div className="fixed inset-0 z-50 bg-[#0D1F4E]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl border border-[#DDE5F0] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0F172A] capitalize">
                  {activeModalReport.strategy} PageSpeed Report — {pageTitle}
                </h3>
                <p className="text-xs text-[#64748B]">
                  Tested at: {new Date(activeModalReport.tested_at || '').toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalReport(null)}
                className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F4F7FC]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-[#334155]">
              {/* Scores summary */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl border border-[#DDE5F0] bg-[#F8FAFD]">
                  <p className="text-2xl font-extrabold text-[#1438B8]">
                    {activeModalReport.performance_score ?? '—'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 font-semibold">Performance</p>
                </div>
                <div className="p-3 rounded-xl border border-[#DDE5F0] bg-[#F8FAFD]">
                  <p className="text-2xl font-extrabold text-emerald-600">
                    {activeModalReport.accessibility_score ?? '—'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 font-semibold">Accessibility</p>
                </div>
                <div className="p-3 rounded-xl border border-[#DDE5F0] bg-[#F8FAFD]">
                  <p className="text-2xl font-extrabold text-[#1438B8]">
                    {activeModalReport.best_practices_score ?? '—'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 font-semibold">Best Practices</p>
                </div>
                <div className="p-3 rounded-xl border border-[#DDE5F0] bg-[#F8FAFD]">
                  <p className="text-2xl font-extrabold text-emerald-600">
                    {activeModalReport.seo_score ?? '—'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 font-semibold">SEO Score</p>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-2">
                <h4 className="font-bold text-[#0F172A] uppercase tracking-wide text-[11px]">
                  Core Web Vitals & Metrics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-[#E5ECF6] bg-white">
                    <p className="text-[#64748B]">First Contentful Paint</p>
                    <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                      {activeModalReport.fcp || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-[#E5ECF6] bg-white">
                    <p className="text-[#64748B]">Largest Contentful Paint</p>
                    <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                      {activeModalReport.lcp || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-[#E5ECF6] bg-white">
                    <p className="text-[#64748B]">Total Blocking Time</p>
                    <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                      {activeModalReport.tbt || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-[#E5ECF6] bg-white">
                    <p className="text-[#64748B]">Cumulative Layout Shift</p>
                    <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                      {activeModalReport.cls || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border border-[#E5ECF6] bg-white">
                    <p className="text-[#64748B]">Speed Index</p>
                    <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                      {activeModalReport.speed_index || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Opportunities & Recommendations */}
              {activeModalReport.recommendations_json && (
                <div className="space-y-2">
                  <h4 className="font-bold text-[#0F172A] uppercase tracking-wide text-[11px]">
                    Key Opportunities & Recommendations
                  </h4>
                  <ul className="space-y-1.5 bg-[#F8FAFD] rounded-xl border border-[#DDE5F0] p-4">
                    {JSON.parse(activeModalReport.recommendations_json).map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1438B8] mt-2 shrink-0" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-6 py-3.5 bg-[#F8FAFD] border-t border-[#E5ECF6] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModalReport(null)}
                className="rounded-lg bg-[#1438B8] text-white px-4 py-2 text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
