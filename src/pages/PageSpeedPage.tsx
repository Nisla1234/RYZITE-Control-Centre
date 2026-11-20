import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { WebsitePage } from '../types/cms';

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

export function PageSpeedPage() {
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [reports, setReports] = useState<PageSpeedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pagesRes, reportsRes] = await Promise.all([
        apiFetch<{ items: WebsitePage[] }>('/api/content/page'),
        apiFetch<{ reports: PageSpeedReport[] }>('/api/pagespeed/reports'),
      ]);
      setPages(pagesRes.items.filter((p) => p.status === 'published'));
      setReports(reportsRes.reports || []);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to load PageSpeed reports.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const runTest = async (pageId: string) => {
    setTestingId(pageId);
    setNotice(null);
    try {
      const res = await apiFetch<{ results: PageSpeedReport[] }>('/api/pagespeed/run', {
        method: 'POST',
        body: JSON.stringify({ pageId, strategy: 'both' }),
      });
      if (res.results) {
        setReports((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]));
          res.results.forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
        setNotice({ type: 'success', text: 'PageSpeed test completed successfully.' });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'PageSpeed test failed.' });
    } finally {
      setTestingId(null);
    }
  };

  const runAllTests = async () => {
    setTestingAll(true);
    setNotice(null);
    let successCount = 0;
    try {
      for (const p of pages) {
        try {
          const res = await apiFetch<{ results: PageSpeedReport[] }>('/api/pagespeed/run', {
            method: 'POST',
            body: JSON.stringify({ pageId: p.id, strategy: 'both' }),
          });
          if (res.results) {
            setReports((prev) => {
              const map = new Map(prev.map((r) => [r.id, r]));
              res.results.forEach((r) => map.set(r.id, r));
              return Array.from(map.values());
            });
            successCount++;
          }
        } catch {
          // continue with others
        }
      }
      setNotice({ type: 'success', text: `Completed PageSpeed tests for ${successCount} published page(s).` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Batch test failed.' });
    } finally {
      setTestingAll(false);
    }
  };

  const getScoreBadge = (score: number | null) => {
    if (score == null) return <span className="text-slate-400">Not tested</span>;
    const cls =
      score >= 90
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : score >= 50
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-rose-50 text-rose-700 border-rose-200';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${cls}`}>
        {score}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Gauge className="w-5 h-5 text-[#1438B8]" /> PageSpeed Insights Hub
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Monitor Core Web Vitals, desktop and mobile performance scores across all published RYZITE website pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runAllTests}
            disabled={testingAll || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${testingAll ? 'animate-spin' : ''}`} />
            {testingAll ? 'Running All Tests...' : 'Run Tests for All Pages'}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#DDE5F0] overflow-hidden">
        <div className="p-4 border-b border-[#E5ECF6] bg-[#F8FAFD]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
            Published Pages ({pages.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-[#64748B]">Loading PageSpeed analytics...</div>
        ) : pages.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#64748B]">No published pages found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFD] border-b border-[#E5ECF6] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Page Title & Slug</th>
                  <th className="py-3 px-4">Desktop Score</th>
                  <th className="py-3 px-4">Mobile Score</th>
                  <th className="py-3 px-4">Core Web Vitals</th>
                  <th className="py-3 px-4">Last Tested</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2FA] text-sm">
                {pages.map((p) => {
                  const desktopRep = reports.find((r) => r.page_id === p.id && r.strategy === 'desktop');
                  const mobileRep = reports.find((r) => r.page_id === p.id && r.strategy === 'mobile');
                  const isTesting = testingId === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-[#F8FAFD] transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#0F172A]">{p.title}</p>
                        <a
                          href={`https://ryzite.lk${p.slug === '/' ? '/' : p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono text-[#1438B8] hover:underline inline-flex items-center gap-1"
                        >
                          {p.slug} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-[#64748B]" />
                          {getScoreBadge(desktopRep?.performance_score ?? null)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-[#64748B]" />
                          {getScoreBadge(mobileRep?.performance_score ?? null)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {desktopRep?.core_web_vitals_status ? (
                          <span
                            className={`font-semibold ${
                              desktopRep.core_web_vitals_status === 'Passed'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {desktopRep.core_web_vitals_status}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not evaluated</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#64748B]">
                        {desktopRep?.tested_at
                          ? new Date(desktopRep.tested_at).toLocaleString()
                          : 'Not tested yet'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => runTest(p.id)}
                          disabled={isTesting || testingAll}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                          {isTesting ? 'Testing...' : 'Run Test'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
