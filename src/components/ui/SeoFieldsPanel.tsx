import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, Image as ImageIcon } from 'lucide-react';
import type { SeoFields } from '../../types/cms';
import { MediaPickerModal } from '../media/MediaPickerModal';

interface SeoFieldsPanelProps {
  seo: SeoFields;
  onChange: (next: SeoFields) => void;
  slug?: string;
  highlightField?: string | null;
  activeIssueMessage?: string | null;
}

export function SeoFieldsPanel({
  seo,
  onChange,
  slug = '/',
  highlightField,
  activeIssueMessage,
}: SeoFieldsPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const descRef = useRef<HTMLDivElement | null>(null);
  const canonicalRef = useRef<HTMLDivElement | null>(null);
  const ogImageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {
      metaTitle: titleRef,
      metaDescription: descRef,
      canonicalUrl: canonicalRef,
      ogImage: ogImageRef,
    };
    if (highlightField && map[highlightField]?.current) {
      map[highlightField].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightField]);

  const titleLen = (seo.metaTitle || '').trim().length;
  const descLen = (seo.metaDescription || '').trim().length;
  const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`;
  const previewUrl =
    seo.canonicalUrl || `https://ryzite.lk${normalizedSlug === '/' ? '/' : normalizedSlug}`;

  const titleHealthy = titleLen >= 25 && titleLen <= 65;
  const descHealthy = descLen >= 110 && descLen <= 165;

  const ringClass = (field: string) =>
    highlightField === field
      ? 'rounded-xl border-2 border-amber-400 bg-amber-50/50 p-3.5 transition-all'
      : '';

  return (
    <div className="space-y-4">
      {highlightField && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">SEO Attention Required: {highlightField}</p>
            <p className="text-amber-800 mt-0.5">
              {activeIssueMessage ||
                'Update the highlighted field below and save/publish to resolve this SEO warning.'}
            </p>
          </div>
        </div>
      )}

      {/* Search Snippet Preview */}
      <div className="rounded-xl border border-[#DDE5F0] bg-[#F8FAFD] p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-[#475569]">
          <Globe className="w-3.5 h-3.5 text-[#1438B8]" />
          <span className="truncate">{previewUrl}</span>
        </div>
        <p className="text-base font-semibold text-[#1A0DAB] leading-snug line-clamp-1">
          {seo.metaTitle || 'RYZITE — Digital Engineering & Technology Solutions'}
        </p>
        <p className="text-xs text-[#4D5156] leading-relaxed line-clamp-2">
          {seo.metaDescription ||
            'Add a compelling 120–160 character meta description to improve search click-through rates.'}
        </p>
      </div>

      {/* Meta Title */}
      <div ref={titleRef} className={ringClass('metaTitle')}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-[#334155]">Meta Title</label>
          <span
            className={`text-[11px] font-semibold inline-flex items-center gap-1 ${
              titleHealthy ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {titleHealthy ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            {titleLen} / 60 chars
          </span>
        </div>
        <input
          type="text"
          value={seo.metaTitle || ''}
          onChange={(e) => onChange({ ...seo, metaTitle: e.target.value })}
          placeholder="Concise page title (30–60 characters)"
          className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
        />
      </div>

      {/* Meta Description */}
      <div ref={descRef} className={ringClass('metaDescription')}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-[#334155]">Meta Description</label>
          <span
            className={`text-[11px] font-semibold inline-flex items-center gap-1 ${
              descHealthy ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {descHealthy ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            {descLen} / 160 chars (recommended 120–160)
          </span>
        </div>
        <textarea
          rows={3}
          value={seo.metaDescription || ''}
          onChange={(e) => onChange({ ...seo, metaDescription: e.target.value })}
          placeholder="Summarize this page in 120–160 characters for search engines"
          className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
        />
      </div>

      {/* Canonical URL */}
      <div ref={canonicalRef} className={ringClass('canonicalUrl')}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-[#334155]">Canonical URL</label>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...seo,
                canonicalUrl: `https://ryzite.lk${normalizedSlug === '/' ? '/' : normalizedSlug}`,
              })
            }
            className="text-[11px] font-medium text-[#1438B8] hover:underline"
          >
            Use https://ryzite.lk{normalizedSlug}
          </button>
        </div>
        <input
          type="url"
          value={seo.canonicalUrl || ''}
          onChange={(e) => onChange({ ...seo, canonicalUrl: e.target.value })}
          placeholder={`https://ryzite.lk${normalizedSlug}`}
          className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
        />
      </div>

      {/* OpenGraph */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className="block text-xs font-semibold text-[#334155] mb-1">
            OpenGraph Title
          </label>
          <input
            type="text"
            value={seo.ogTitle || ''}
            onChange={(e) => onChange({ ...seo, ogTitle: e.target.value })}
            placeholder="Defaults to Meta Title"
            className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#334155] mb-1">
            OpenGraph Description
          </label>
          <input
            type="text"
            value={seo.ogDescription || ''}
            onChange={(e) => onChange({ ...seo, ogDescription: e.target.value })}
            placeholder="Defaults to Meta Description"
            className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
          />
        </div>
      </div>

      {/* OG Image with Media Picker */}
      <div ref={ogImageRef} className={ringClass('ogImage')}>
        <label className="block text-xs font-semibold text-[#334155] mb-1">
          OpenGraph Social Image
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={seo.ogImage || ''}
            onChange={(e) => onChange({ ...seo, ogImage: e.target.value })}
            placeholder="/assets/branding/ryzite-logo.png or choose from Media Library"
            className="flex-1 min-w-[200px] rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-3 py-2 text-xs font-semibold transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Media Library
          </button>
        </div>
        {seo.ogImage && (
          <div className="mt-2 flex items-center gap-3">
            <img
              src={seo.ogImage}
              alt="OG Preview"
              className="h-14 w-24 object-cover rounded-lg border border-[#DDE5F0] bg-[#F4F7FC]"
            />
            <button
              type="button"
              onClick={() => onChange({ ...seo, ogImage: '' })}
              className="text-xs text-red-600 hover:underline"
            >
              Remove OG Image
            </button>
          </div>
        )}
      </div>

      {/* NoIndex */}
      <label className="inline-flex items-center gap-2 text-xs font-medium text-[#334155] cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(seo.noIndex)}
          onChange={(e) => onChange({ ...seo, noIndex: e.target.checked })}
          className="rounded border-[#CBD5E1] text-[#1438B8] focus:ring-[#1438B8]"
        />
        Hide from search engines (<code className="text-[11px]">noindex, nofollow</code>)
      </label>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select OpenGraph Image"
        onSelect={(sel) => onChange({ ...seo, ogImage: sel.url })}
      />
    </div>
  );
}
