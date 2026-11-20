import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  FileEdit,
} from 'lucide-react';
import type { WebsitePage } from '../../types/cms';
import { PublicSiteShell, type PublicSitePayload } from '../public/PublicSiteShell';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type PreviewSource = 'draft' | 'published';

interface VisualPagePreviewProps {
  /** Current working draft page from the editor or pages table */
  page: WebsitePage;
  /** Default mode ('draft' in editor, 'published' or 'draft' from list) */
  initialMode?: PreviewSource;
  /** Optional height class for the preview viewport area */
  heightClassName?: string;
}

export function VisualPagePreview({
  page,
  initialMode = 'draft',
  heightClassName = 'h-[72vh] min-h-[540px]',
}: VisualPagePreviewProps) {
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [mode, setMode] = useState<PreviewSource>(initialMode);
  const [site, setSite] = useState<PublicSitePayload | null>(null);
  const [publishedPage, setPublishedPage] = useState<WebsitePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string>(page.slug || '/');
  const [navNotice, setNavNotice] = useState<string | null>(null);

  const normalizedPageSlug = ((page.slug || '/').startsWith('/') ? page.slug : `/${page.slug}`).replace(/\/$/, '') || '/';

  useEffect(() => {
    setPreviewPath(page.slug || '/');
  }, [page.id, page.slug]);

  const loadPreviewData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [siteRes, pageRes] = await Promise.all([
        fetch('/api/public/site', { cache: 'no-store' }),
        fetch(`/api/public/page?slug=${encodeURIComponent(normalizedPageSlug)}`, {
          cache: 'no-store',
        }),
      ]);

      if (!siteRes.ok) {
        throw new Error(`Failed to load public site shell (HTTP ${siteRes.status}).`);
      }
      const siteData: PublicSitePayload = await siteRes.json();
      setSite(siteData);

      if (pageRes.ok) {
        const pageData = await pageRes.json();
        setPublishedPage(pageData.page || null);
      } else if (pageRes.status === 404) {
        setPublishedPage(null);
      } else {
        throw new Error(`Failed to load published page (HTTP ${pageRes.status}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load visual page preview.');
    } finally {
      setLoading(false);
    }
  }, [normalizedPageSlug]);

  useEffect(() => {
    loadPreviewData();
  }, [loadPreviewData]);

  const normalizedPreviewPath = (previewPath || '/').replace(/\/$/, '') || '/';
  const isViewingEditedSlug = normalizedPreviewPath.toLowerCase() === normalizedPageSlug.toLowerCase();

  const resolvedActivePage: WebsitePage | null = isViewingEditedSlug
    ? mode === 'draft'
      ? page
      : publishedPage
    : site?.pages.find((p) => {
        const s = ((p.slug || '/').startsWith('/') ? p.slug : `/${p.slug}`).replace(/\/$/, '') || '/';
        return s.toLowerCase() === normalizedPreviewPath.toLowerCase();
      }) || null;

  const liveHref = page.slug?.startsWith('/') ? page.slug : `/${page.slug || ''}`;

  const frameWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full rounded-[28px] border-[6px] border-[#0F172A] shadow-2xl'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full rounded-2xl border-4 border-[#1E293B] shadow-xl'
        : 'w-full rounded-xl border border-[#CBD5E1] shadow-sm';

  const handlePreviewNavigate = (target: string) => {
    if (target.startsWith('/admin')) {
      setNavNotice('Admin links are disabled inside preview mode.');
      setTimeout(() => setNavNotice(null), 2600);
      return;
    }
    setPreviewPath(target || '/');
    if ((target || '/').replace(/\/$/, '') !== normalizedPageSlug) {
      setNavNotice(`Navigated inside preview to ${target}`);
      setTimeout(() => setNavNotice(null), 2600);
    }
  };

  return (
    <div className="space-y-3">
      {/* Preview Control Bar */}
      <div className="rounded-xl border border-[#DDE5F0] bg-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Status & Draft/Published Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#D4DFEE] bg-[#F8FAFC] p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode('draft');
                setPreviewPath(page.slug || '/');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mode === 'draft'
                  ? 'bg-[#1438B8] text-white shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <FileEdit className="w-3.5 h-3.5" /> Draft Preview
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('published');
                setPreviewPath(page.slug || '/');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mode === 'published'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Published Live
            </button>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
              mode === 'draft'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : publishedPage
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <Eye className="w-3 h-3" />
            {mode === 'draft'
              ? 'Viewing Working Draft (live site unchanged)'
              : publishedPage
                ? 'Viewing Live Published Version'
                : 'Not Yet Published'}
          </span>
        </div>

        {/* Center: Viewport Switcher */}
        <div className="inline-flex items-center rounded-lg border border-[#D4DFEE] bg-[#F8FAFC] p-0.5">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            title="Desktop Viewport (100%)"
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewport === 'desktop'
                ? 'bg-white text-[#1438B8] shadow-xs font-semibold'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            title="Tablet Viewport (768px)"
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewport === 'tablet'
                ? 'bg-white text-[#1438B8] shadow-xs font-semibold'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            title="Mobile Viewport (390px)"
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewport === 'mobile'
                ? 'bg-white text-[#1438B8] shadow-xs font-semibold'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
        </div>

        {/* Right: Refresh + Open Live */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadPreviewData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] bg-white hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D1F4E] hover:bg-[#1438B8] text-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Open Live <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Simulated Browser URL Bar + Navigation Notice */}
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[11px] text-[#475569] truncate">
            https://ryzite.lk{normalizedPreviewPath === '/' ? '/' : normalizedPreviewPath}
          </span>
          {!isViewingEditedSlug && (
            <button
              type="button"
              onClick={() => setPreviewPath(page.slug || '/')}
              className="text-[11px] font-semibold text-[#1438B8] hover:underline shrink-0"
            >
              Return to {page.title}
            </button>
          )}
        </div>
        <span className="text-[11px] text-[#64748B] shrink-0">
          {viewport === 'desktop' ? 'Desktop · 100%' : viewport === 'tablet' ? 'Tablet · 768px' : 'Mobile · 390px'}
        </span>
      </div>

      {navNotice && (
        <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-xs text-[#1E40AF]">
          {navNotice}
        </div>
      )}

      {/* Visual Viewport Container */}
      <div className="rounded-2xl border border-[#DDE5F0] bg-[#E2E8F0]/70 p-3 sm:p-5 flex justify-center overflow-x-auto">
        <div className={`${frameWidthClass} ${heightClassName} bg-[#F4F7FC] overflow-y-auto transition-all duration-200 relative`}>
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-[#64748B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#1438B8]" />
              <p className="text-xs font-medium">Rendering live RYZITE preview…</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#0F172A]">Preview failed to load</p>
                <p className="text-xs text-[#64748B] max-w-md">{error}</p>
              </div>
              <button
                type="button"
                onClick={loadPreviewData}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-3.5 py-2 text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Preview
              </button>
            </div>
          ) : mode === 'published' && isViewingEditedSlug && !publishedPage ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-white">
              <Globe className="w-9 h-9 text-[#94A3B8]" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#0D1F4E]">
                  No Published Version Yet
                </h3>
                <p className="text-xs text-[#64748B] max-w-md">
                  <strong>{page.title}</strong> ({normalizedPageSlug}) is currently saved only as a draft. Switch to <strong>Draft Preview</strong> to inspect your work, or click <strong>Publish Live</strong> when ready.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode('draft')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-3.5 py-2 text-xs font-semibold"
              >
                <FileEdit className="w-3.5 h-3.5" /> Switch to Draft Preview
              </button>
            </div>
          ) : (
            <PublicSiteShell
              site={site}
              activePage={resolvedActivePage}
              currentPath={previewPath}
              loading={false}
              isPreview
              forceMobileNav={viewport === 'mobile'}
              onNavigate={handlePreviewNavigate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
