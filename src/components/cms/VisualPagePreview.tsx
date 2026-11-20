import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Eye,
  FileEdit,
  Globe,
  Layers,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { WebsitePage } from '../../types/cms';
import { PublicSiteShell, type PublicSitePayload } from '../public/PublicSiteShell';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type PreviewSource = 'draft' | 'published';
type RendererMode = 'astro-live' | 'cms-fallback';

interface PreviewTokenResponse {
  token: string;
  expiresAt: string;
  slug: string;
  mainSiteUrl: string;
  liveUrl: string;
  previewUrl: string;
}

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
  const [renderer, setRenderer] = useState<RendererMode>('astro-live');

  // Real Astro website iframe state
  const [previewInfo, setPreviewInfo] = useState<PreviewTokenResponse | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeNonce, setIframeNonce] = useState(0);

  // CMS fallback renderer state
  const [site, setSite] = useState<PublicSitePayload | null>(null);
  const [publishedPage, setPublishedPage] = useState<WebsitePage | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string>(page.slug || '/');

  const normalizedPageSlug =
    ((page.slug || '/').startsWith('/') ? page.slug : `/${page.slug}`).replace(/\/+$/, '') || '/';

  useEffect(() => {
    setPreviewPath(page.slug || '/');
  }, [page.id, page.slug]);

  const issuePreviewToken = useCallback(async () => {
    setIframeLoading(true);
    setIframeError(null);
    try {
      const data = await apiFetch<PreviewTokenResponse>('/api/preview/token', {
        method: 'POST',
        body: JSON.stringify({ slug: normalizedPageSlug }),
      });
      setPreviewInfo(data);
      setIframeNonce((n) => n + 1);
    } catch (err) {
      setIframeError(
        err instanceof Error
          ? err.message
          : 'Unable to generate signed preview token for the main website.'
      );
      setIframeLoading(false);
    }
  }, [normalizedPageSlug]);

  const loadFallbackData = useCallback(async () => {
    setFallbackLoading(true);
    setFallbackError(null);
    try {
      const [siteRes, pageRes] = await Promise.all([
        fetch('/api/public/site?fresh=1', { cache: 'no-store' }),
        fetch(`/api/public/page?slug=${encodeURIComponent(normalizedPageSlug)}&fresh=1`, {
          cache: 'no-store',
        }),
      ]);
      if (!siteRes.ok) {
        throw new Error(`Failed to load CMS site payload (HTTP ${siteRes.status}).`);
      }
      setSite(await siteRes.json());
      if (pageRes.ok) {
        const pd = await pageRes.json();
        setPublishedPage(pd.page || null);
      } else {
        setPublishedPage(null);
      }
    } catch (err) {
      setFallbackError(err instanceof Error ? err.message : 'Unable to load fallback preview.');
    } finally {
      setFallbackLoading(false);
    }
  }, [normalizedPageSlug]);

  useEffect(() => {
    if (renderer === 'astro-live') {
      issuePreviewToken();
    } else {
      loadFallbackData();
    }
  }, [renderer, issuePreviewToken, loadFallbackData]);

  const handleRefresh = () => {
    if (renderer === 'astro-live') {
      issuePreviewToken();
    } else {
      loadFallbackData();
    }
  };

  const mainSiteBase = (previewInfo?.mainSiteUrl || 'https://ryzite.lk').replace(/\/$/, '');
  const liveHref =
    previewInfo?.liveUrl || `${mainSiteBase}${normalizedPageSlug === '/' ? '/' : normalizedPageSlug}`;
  const iframeSrc =
    mode === 'draft'
      ? previewInfo?.previewUrl || ''
      : `${liveHref}${liveHref.includes('?') ? '&' : '?'}cmsPreviewRef=${iframeNonce}`;

  const frameWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full rounded-[28px] border-[6px] border-[#0F172A] shadow-2xl'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full rounded-2xl border-4 border-[#1E293B] shadow-xl'
        : 'w-full rounded-xl border border-[#CBD5E1] shadow-sm';

  const normalizedPreviewPath = (previewPath || '/').replace(/\/+$/, '') || '/';
  const isViewingEditedSlug =
    normalizedPreviewPath.toLowerCase() === normalizedPageSlug.toLowerCase();

  const resolvedFallbackPage: WebsitePage | null = isViewingEditedSlug
    ? mode === 'draft'
      ? page
      : publishedPage
    : site?.pages.find((p) => {
        const s = ((p.slug || '/').startsWith('/') ? p.slug : `/${p.slug}`).replace(/\/+$/, '') || '/';
        return s.toLowerCase() === normalizedPreviewPath.toLowerCase();
      }) || null;

  return (
    <div className="space-y-3">
      {/* Top Preview Control Bar */}
      <div className="rounded-xl border border-[#DDE5F0] bg-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Draft vs Published Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#D4DFEE] bg-[#F8FAFC] p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode('draft');
                if (renderer === 'astro-live') setIframeLoading(true);
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
                if (renderer === 'astro-live') setIframeLoading(true);
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
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {mode === 'draft' ? (
              <>
                <ShieldCheck className="w-3 h-3" />
                Signed 15m Draft Token
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                Live Public Website
              </>
            )}
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

        {/* Right: Renderer Mode + Refresh + Open Live */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setRenderer((r) => (r === 'astro-live' ? 'cms-fallback' : 'astro-live'))
            }
            title="Switch between the real ryzite.lk Astro website iframe and CMS structural fallback"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] bg-white hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155]"
          >
            <Layers className="w-3.5 h-3.5 text-[#1438B8]" />
            {renderer === 'astro-live' ? 'Real Site (ryzite.lk)' : 'CMS Fallback'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={renderer === 'astro-live' ? iframeLoading : fallbackLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] bg-white hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155] disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                (renderer === 'astro-live' ? iframeLoading : fallbackLoading) ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </button>
          <a
            href={mode === 'draft' && previewInfo?.previewUrl ? previewInfo.previewUrl : liveHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D1F4E] hover:bg-[#1438B8] text-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Open {mode === 'draft' ? 'Draft' : 'Live'} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Simulated Browser URL Bar */}
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[11px] text-[#475569] truncate">
            {liveHref}
            {mode === 'draft' ? '?cmsPreview=1&previewToken=***' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#64748B] shrink-0">
          {mode === 'draft' && previewInfo?.expiresAt && (
            <span>
              Token expires {new Date(previewInfo.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <span>
            {viewport === 'desktop'
              ? 'Desktop · 100%'
              : viewport === 'tablet'
                ? 'Tablet · 768px'
                : 'Mobile · 390px'}
          </span>
        </div>
      </div>

      {/* Visual Viewport Container */}
      <div className="rounded-2xl border border-[#DDE5F0] bg-[#E2E8F0]/70 p-3 sm:p-5 flex justify-center overflow-x-auto">
        <div
          className={`${frameWidthClass} ${heightClassName} bg-white overflow-hidden transition-all duration-200 relative`}
        >
          {renderer === 'astro-live' ? (
            <>
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/95 text-[#64748B]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#1438B8]" />
                  <p className="text-xs font-medium">
                    Loading {mode === 'draft' ? 'signed draft preview' : 'live website'} from{' '}
                    <span className="font-mono">{mainSiteBase}</span>…
                  </p>
                </div>
              )}

              {iframeError ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#0F172A]">
                      Unable to load real website preview
                    </p>
                    <p className="text-xs text-[#64748B] max-w-md">{iframeError}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={issuePreviewToken}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-3.5 py-2 text-xs font-semibold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderer('cms-fallback')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155]"
                    >
                      Use CMS Fallback
                    </button>
                  </div>
                </div>
              ) : iframeSrc ? (
                <iframe
                  key={`${iframeSrc}-${iframeNonce}`}
                  src={iframeSrc}
                  title={`RYZITE ${mode === 'draft' ? 'Draft' : 'Live'} Preview — ${page.title}`}
                  className="w-full h-full border-0 bg-white"
                  onLoad={() => setIframeLoading(false)}
                  onError={() => {
                    setIframeLoading(false);
                    setIframeError(
                      `The main website (${mainSiteBase}) could not be embedded. Ensure Content-Security-Policy frame-ancestors allows this Admin origin, or open the preview in a new tab.`
                    );
                  }}
                />
              ) : null}
            </>
          ) : (
            <div className="h-full overflow-y-auto bg-[#F4F7FC]">
              {fallbackLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-[#64748B]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#1438B8]" />
                  <p className="text-xs font-medium">Loading CMS fallback preview…</p>
                </div>
              ) : fallbackError ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                  <p className="text-xs text-[#64748B]">{fallbackError}</p>
                  <button
                    type="button"
                    onClick={loadFallbackData}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-3.5 py-2 text-xs font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              ) : (
                <PublicSiteShell
                  site={site}
                  activePage={resolvedFallbackPage}
                  currentPath={previewPath}
                  loading={false}
                  isPreview
                  forceMobileNav={viewport === 'mobile'}
                  onNavigate={(target) => setPreviewPath(target || '/')}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
