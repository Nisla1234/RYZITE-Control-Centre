import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiRequest, formatDateTime } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { GlobalSeoSettings, SeoIssue } from '../types/cms';

interface AuditResult {
  issues: SeoIssue[];
  errorCount: number;
  warningCount: number;
  checkedAt: string;
}

export function SeoCenterPage() {
  const { notify } = useAuth();
  const [settings, setSettings] = useState<GlobalSeoSettings | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [seoRes, auditRes] = await Promise.all([
        apiRequest<{ settings: GlobalSeoSettings }>('/api/seo/global'),
        apiRequest<AuditResult>('/api/seo/audit'),
      ]);
      setSettings(seoRes.settings);
      setAudit(auditRes);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load SEO configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ settings: GlobalSeoSettings }>('/api/seo/global', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      notify('success', 'Global SEO configuration saved.');
      const auditRes = await apiRequest<AuditResult>('/api/seo/audit');
      setAudit(auditRes);
    } catch (err: any) {
      notify('error', err.message || 'Failed to save SEO settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-[#64748B]">Loading SEO Centre...</div>;
  }

  if (!settings) {
    return (
      <div className="rounded-xl border border-[#FECACA] bg-white p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-[#991B1B]">Unable to load SEO configuration.</p>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">SEO Management Centre</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Configure global metadata, robots directives, search previews, and technical metadata checks.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC] whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-run SEO Audit
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Global SEO Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-5">
          <h3 className="text-sm font-semibold text-[#0D1F4E] pb-3 border-b border-[#E2E8F0]">
            Global Website Metadata
          </h3>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#1E293B]">Global Website Title</label>
              <span className="font-mono text-[11px] text-[#64748B]">{settings.siteTitle.length}/60</span>
            </div>
            <input
              type="text"
              value={settings.siteTitle}
              onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#1E293B]">Global Meta Description</label>
              <span className="font-mono text-[11px] text-[#64748B]">{settings.siteDescription.length}/160</span>
            </div>
            <textarea
              rows={3}
              value={settings.siteDescription}
              onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1">Canonical Base URL</label>
              <input
                type="url"
                value={settings.siteUrl}
                onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1">Robots Directives</label>
              <select
                value={settings.robotsDirectives}
                onChange={(e) => setSettings({ ...settings, robotsDirectives: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
              >
                <option value="index, follow">index, follow</option>
                <option value="noindex, follow">noindex, follow</option>
                <option value="index, nofollow">index, nofollow</option>
                <option value="noindex, nofollow">noindex, nofollow</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1">
              Default Social Sharing (Open Graph) Image URL
            </label>
            <input
              type="text"
              value={settings.defaultOgImage}
              onChange={(e) => setSettings({ ...settings, defaultOgImage: e.target.value })}
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-[#0F172A] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.sitemapEnabled}
              onChange={(e) => setSettings({ ...settings, sitemapEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-[#CBD5E1] text-[#1438B8]"
            />
            Include published pages and articles in XML sitemap generation
          </label>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
            <span className="text-xs text-[#64748B]">
              Last updated {formatDateTime(settings.updatedAt)} by {settings.updatedBy}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96] disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save SEO Settings'}
            </button>
          </div>
        </form>

        {/* Right: SERP Preview & Technical Note */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-3">
            <h3 className="text-sm font-semibold text-[#0D1F4E]">Search Engine Listing Preview</h3>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-4 space-y-1">
              <div className="text-xs font-mono text-[#475569] truncate">{settings.siteUrl}</div>
              <div className="text-base font-medium text-[#1438B8] leading-snug">
                {settings.siteTitle || 'RYZITE'}
              </div>
              <p className="text-xs leading-relaxed text-[#475569]">
                {settings.siteDescription || 'No global meta description configured.'}
              </p>
            </div>
            <p className="text-[11px] text-[#64748B] leading-relaxed">
              This preview illustrates typical search snippet formatting. Search engines may rewrite
              snippets based on query context; metadata configuration improves clarity and indexing
              hygiene rather than guaranteeing specific rankings.
            </p>
          </div>

          <div className="rounded-xl border border-[#DDE5F0] bg-white p-6">
            <h3 className="text-sm font-semibold text-[#0D1F4E] mb-3">Automated Validation Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-3.5">
                <div className="text-xs text-[#64748B]">Errors</div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#B91C1C]">
                  {audit?.errorCount ?? 0}
                </div>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-3.5">
                <div className="text-xs text-[#64748B]">Warnings</div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#B45309]">
                  {audit?.warningCount ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEO Audit Issues Table */}
      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0D1F4E]">
            Site-Wide Metadata & Structure Validation
          </h3>
          {audit && (
            <span className="font-mono text-xs text-[#64748B]">
              Checked {formatDateTime(audit.checkedAt)}
            </span>
          )}
        </div>
        <div className="divide-y divide-[#F1F5F9]">
          {audit && audit.issues.length === 0 ? (
            <div className="px-6 py-10 flex items-center justify-center gap-2 text-sm text-[#15803D]">
              <CheckCircle2 className="h-4 w-4" />
              All checked pages, projects, services, articles, and media passed validation.
            </div>
          ) : (
            (audit?.issues || []).map((issue) => (
              <div key={issue.id} className="px-6 py-3.5 flex items-start justify-between gap-4 hover:bg-[#F8FAFD]">
                <div className="flex items-start gap-2.5">
                  {issue.severity === 'error' ? (
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[#D97706]" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-[#0F172A]">
                      {issue.entityTitle}{' '}
                      <span className="text-xs font-normal text-[#64748B]">
                        · {issue.entityType} · {issue.field}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] mt-0.5">{issue.message}</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium capitalize shrink-0 ${
                    issue.severity === 'error' ? 'text-[#B91C1C]' : 'text-[#B45309]'
                  }`}
                >
                  {issue.severity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
