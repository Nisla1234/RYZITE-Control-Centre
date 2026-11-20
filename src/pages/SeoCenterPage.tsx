import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Globe,
  Image as ImageIcon,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { GlobalSeoSettings, SeoAuditResult } from '../types/cms';
import { MediaPickerModal } from '../components/media/MediaPickerModal';

export function SeoCenterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<GlobalSeoSettings | null>(null);
  const [audit, setAudit] = useState<SeoAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const highlightField = searchParams.get('field');
  const globalSectionRef = useRef<HTMLFormElement | null>(null);

  const loadAll = async (isRecheck = false) => {
    if (isRecheck) setRechecking(true);
    else setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        apiFetch<{ settings: GlobalSeoSettings | null }>('/api/seo/global'),
        apiFetch<SeoAuditResult>('/api/seo/audit'),
      ]);
      setSettings(
        sRes.settings || {
          siteTitle: 'RYZITE — Digital Engineering & Technology Solutions',
          siteDescription:
            'RYZITE designs and builds high-reliability web platforms, cloud architectures, and custom software solutions for ambitious organisations.',
          siteUrl: 'https://ryzite.lk',
          defaultOgImage: '/assets/branding/ryzite-logo.png',
          robotsDirectives: 'index, follow',
          sitemapEnabled: true,
          sessionTimeoutHours: 24,
          updatedAt: new Date().toISOString(),
          updatedBy: '',
        }
      );
      setAudit(aRes);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to load SEO diagnostics.' });
    } finally {
      setLoading(false);
      setRechecking(false);
    }
  };

  useEffect(() => {
    loadAll(false);
  }, []);

  useEffect(() => {
    if (highlightField && globalSectionRef.current) {
      globalSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightField, loading]);

  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ settings: GlobalSeoSettings }>('/api/seo/global', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      await loadAll(true);
      setNotice({
        type: 'success',
        text: 'Global SEO settings saved and SEO audit refreshed.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to save global SEO settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="bg-white rounded-xl border border-[#DDE5F0] p-10 text-center text-sm text-[#64748B]">
        Running live SEO audit across RYZITE content...
      </div>
    );
  }

  const issues = audit?.issues || [];
  const filteredIssues = issues.filter((issue) => {
    if (filter === 'all') return true;
    if (filter === 'error' || filter === 'warning') return issue.severity === filter;
    return issue.module === filter;
  });

  const titleLen = (settings.siteTitle || '').trim().length;
  const descLen = (settings.siteDescription || '').trim().length;

  const fieldHighlight = (name: string) =>
    highlightField === name
      ? 'rounded-xl border-2 border-amber-400 bg-amber-50/50 p-3'
      : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">SEO Centre</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Actionable SEO health checks across pages, services, solutions, articles, media, and global metadata.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAll(true)}
          disabled={rechecking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] bg-white hover:bg-[#F4F7FC] px-3.5 py-2 text-xs font-semibold text-[#334155] disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
          {rechecking ? 'Rechecking...' : 'Recheck SEO Now'}
        </button>
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
          <button type="button" onClick={() => setNotice(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">Critical SEO Errors</p>
            <p className="text-2xl font-bold text-[#0F172A]">{audit?.errorCount ?? 0}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">SEO Warnings</p>
            <p className="text-2xl font-bold text-[#0F172A]">{audit?.warningCount ?? 0}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#64748B]">Canonical Domain</p>
            <p className="text-sm font-bold text-[#0F172A] truncate">
              {settings.siteUrl || 'https://ryzite.lk'}
            </p>
          </div>
        </div>
      </div>

      {/* Actionable Issues List */}
      <div className="bg-white rounded-xl border border-[#DDE5F0] overflow-hidden">
        <div className="p-4 border-b border-[#E5ECF6] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              Actionable SEO Audit ({filteredIssues.length})
            </h2>
            <p className="text-xs text-[#64748B]">
              Click any issue to jump straight to the exact page, record, and field to fix it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F4F7FC] p-1 text-xs">
            {(
              [
                ['all', `All (${issues.length})`],
                ['error', `Errors (${audit?.errorCount ?? 0})`],
                ['warning', `Warnings (${audit?.warningCount ?? 0})`],
                ['page', `Pages (${audit?.moduleCounts?.page ?? 0})`],
                ['service', `Services (${audit?.moduleCounts?.service ?? 0})`],
                ['solution', `Solutions (${audit?.moduleCounts?.solution ?? 0})`],
                ['article', `Articles (${audit?.moduleCounts?.article ?? 0})`],
                ['media', `Media (${audit?.moduleCounts?.media ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  filter === key
                    ? 'bg-white text-[#1438B8] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-[#0F172A]">No SEO issues in this category</p>
            <p className="text-xs text-[#64748B] mt-1">
              Your metadata, headings, canonical URLs, and image alt text look healthy.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF2FA]">
            {filteredIssues.map((issue) => (
              <div
                key={issue.id}
                onClick={() => navigate(issue.deepLink)}
                className="p-4 hover:bg-[#F8FAFD] cursor-pointer transition-colors flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {issue.severity === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#0F172A]">
                        {issue.entityTitle}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1438B8]">
                        {issue.entityType}
                      </span>
                      {issue.slug && (
                        <span className="text-[11px] font-mono text-[#64748B]">
                          {issue.slug}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-[#475569] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                        {issue.field}
                      </span>
                    </div>
                    <p className="text-xs text-[#334155] mt-1">{issue.message}</p>
                    {(issue.currentValue || issue.recommended) && (
                      <p className="text-[11px] text-[#64748B] mt-1">
                        {issue.currentValue ? (
                          <span>
                            Current: <strong className="text-[#334155]">{issue.currentValue}</strong>
                          </span>
                        ) : null}
                        {issue.currentValue && issue.recommended ? ' · ' : ''}
                        {issue.recommended ? (
                          <span>
                            Recommended:{' '}
                            <strong className="text-emerald-700">{issue.recommended}</strong>
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(issue.deepLink);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-3 py-1.5 text-xs font-semibold transition-colors shrink-0"
                >
                  Edit & Fix <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global SEO Configuration */}
      <form
        ref={globalSectionRef}
        onSubmit={handleSaveGlobal}
        className="bg-white rounded-xl border border-[#DDE5F0] p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E5ECF6] pb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#1438B8]" />
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Global Website SEO Defaults
              </h2>
              <p className="text-xs text-[#64748B]">
                Fallback metadata used when an individual page does not specify custom SEO overrides.
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Global SEO'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={fieldHighlight('siteTitle')}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#334155]">Global Site Title</label>
              <span
                className={`text-[11px] font-semibold ${
                  titleLen <= 60 && titleLen >= 25 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {titleLen} / 60 chars
              </span>
            </div>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A]"
            />
          </div>

          <div className={fieldHighlight('siteUrl')}>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Canonical Base URL
            </label>
            <input
              type="url"
              value={settings.siteUrl}
              onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
              placeholder="https://ryzite.lk"
              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm font-mono text-[#0F172A]"
            />
          </div>
        </div>

        <div className={fieldHighlight('siteDescription')}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-[#334155]">
              Default Meta Description
            </label>
            <span
              className={`text-[11px] font-semibold ${
                descLen >= 110 && descLen <= 165 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {descLen} / 160 chars
            </span>
          </div>
          <textarea
            rows={3}
            value={settings.siteDescription}
            onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
            className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={fieldHighlight('defaultOgImage')}>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Default Social Share (OG) Image
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.defaultOgImage}
                onChange={(e) => setSettings({ ...settings, defaultOgImage: e.target.value })}
                className="flex-1 rounded-lg border border-[#D4DFEE] px-3 py-2 text-xs text-[#0F172A]"
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-3 py-2 text-xs font-semibold"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Media Library
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              Robots Meta Directives
            </label>
            <select
              value={settings.robotsDirectives}
              onChange={(e) => setSettings({ ...settings, robotsDirectives: e.target.value })}
              className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A]"
            >
              <option value="index, follow">index, follow (Recommended for Production)</option>
              <option value="noindex, follow">noindex, follow</option>
              <option value="noindex, nofollow">noindex, nofollow (Staging Only)</option>
            </select>
          </div>
        </div>
      </form>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select Default OpenGraph Image"
        onSelect={(sel) =>
          setSettings((prev) =>
            prev
              ? { ...prev, defaultOgImage: sel.url, defaultOgMediaId: sel.mediaId }
              : prev
          )
        }
      />
    </div>
  );
}
