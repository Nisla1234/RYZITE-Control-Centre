import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  FileText,
  ImageOff,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiUpload } from '../../lib/api';
import type { MediaAsset } from '../../types/cms';

interface MediaEditorModalProps {
  asset: MediaAsset | null;
  highlightField?: string | null;
  onClose: () => void;
  onUpdated: (asset: MediaAsset) => void;
  onDeleted: (id: string) => void;
}

export function MediaEditorModal({
  asset,
  highlightField,
  onClose,
  onUpdated,
  onDeleted,
}: MediaEditorModalProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'details' | 'usage'>('details');
  const [previewMode, setPreviewMode] = useState<'optimized' | 'original'>('optimized');
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [category, setCategory] = useState('general');
  const [focalPoint, setFocalPoint] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broken, setBroken] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const altRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!asset) return;
    setTitle(asset.title || '');
    setAltText(asset.altText || '');
    setCaption(asset.caption || '');
    setDescription(asset.description || '');
    setOriginalName(asset.originalName || '');
    setCategory(asset.category || 'general');
    setFocalPoint(asset.focalPoint || { x: 50, y: 50 });
    setConfirmDelete(false);
    setBroken(false);
    setNotice(null);
    setTab('details');

    if (highlightField === 'altText') {
      setTimeout(() => altRef.current?.focus(), 120);
    }
  }, [asset, highlightField]);

  if (!asset) return null;

  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';
  const absoluteUrl = asset.url.startsWith('http')
    ? asset.url
    : `${window.location.origin}${asset.url}`;

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: MediaAsset }>(`/api/media/${asset.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          altText,
          caption,
          description,
          originalName,
          category,
          focalPoint,
        }),
      });
      onUpdated(res.item);
      setNotice({ type: 'success', text: 'Media metadata saved.' });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to save media metadata.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReplace = async (file: File | undefined) => {
    if (!file) return;
    setReplacing(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ item: MediaAsset; updatedRefs?: number }>(
        `/api/media/${asset.id}/replace`,
        fd
      );
      setBroken(false);
      onUpdated(res.item);
      setNotice({
        type: 'success',
        text: `File replaced (v${res.item.version || 2})${
          res.updatedRefs ? ` and updated across ${res.updatedRefs} CMS record(s).` : '.'
        }`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Replacement failed.' });
    } finally {
      setReplacing(false);
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/api/media/${asset.id}`, { method: 'DELETE' });
      onDeleted(asset.id);
      onClose();
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Delete failed.' });
      setDeleting(false);
    }
  };

  const handleFocalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isImage || broken) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setFocalPoint({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  const copyUrl = () => {
    navigator.clipboard?.writeText(absoluteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0D1F4E]/55 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white rounded-xl border border-[#DDE5F0] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#0F172A] truncate">
                {title || asset.originalName}
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#EEF3FC] text-[#1438B8]">
                v{asset.version || 1}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] uppercase">
                {asset.source}
              </span>
            </div>
            <p className="text-xs text-[#64748B] truncate mt-0.5">
              ID: <span className="font-mono">{asset.id}</span> · {asset.mimeType} ·{' '}
              {(asset.sizeBytes / 1024).toFixed(1)} KB
              {asset.width && asset.height ? ` · ${asset.width} × ${asset.height}px` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy URL'}
            </button>
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155]"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <a
              href={asset.url}
              download={asset.originalName}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-2.5 py-1.5 text-xs font-medium text-[#334155]"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F4F7FC] hover:text-[#0F172A]"
              aria-label="Close media editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Left Preview Pane */}
          <div className="lg:col-span-5 bg-[#F8FAFD] border-b lg:border-b-0 lg:border-r border-[#E5ECF6] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#334155]">
                {isImage ? 'Interactive Preview & Focal Point' : 'Document Preview'}
              </span>
              {isImage && (
                <div className="inline-flex rounded-lg border border-[#D4DFEE] bg-white p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('optimized')}
                    className={`px-2 py-0.5 rounded-md font-medium ${
                      previewMode === 'optimized'
                        ? 'bg-[#1438B8] text-white'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    Cropped (Focal)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('original')}
                    className={`px-2 py-0.5 rounded-md font-medium ${
                      previewMode === 'original'
                        ? 'bg-[#1438B8] text-white'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    Original
                  </button>
                </div>
              )}
            </div>

            <div
              onClick={handleFocalClick}
              className={`relative w-full h-64 rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex items-center justify-center ${
                isImage && !broken ? 'cursor-crosshair' : ''
              }`}
              title={isImage ? 'Click anywhere on the image to set the focal point' : undefined}
            >
              {isImage && !broken ? (
                <>
                  <img
                    src={asset.url}
                    alt={altText || asset.originalName}
                    className={
                      previewMode === 'optimized'
                        ? 'w-full h-full object-cover'
                        : 'max-w-full max-h-full object-contain p-2'
                    }
                    style={
                      previewMode === 'optimized'
                        ? { objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }
                        : undefined
                    }
                    onError={() => setBroken(true)}
                  />
                  <div
                    className="pointer-events-none absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white bg-[#1438B8]/80 shadow flex items-center justify-center"
                    style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                  >
                    <Crosshair className="w-3 h-3 text-white" />
                  </div>
                </>
              ) : isImage && broken ? (
                <div className="p-4 text-center">
                  <ImageOff className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-red-700">Image failed to load</p>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    Use <strong>Replace File</strong> below to upload a fresh copy without breaking page references.
                  </p>
                </div>
              ) : isPdf ? (
                <iframe
                  src={asset.url}
                  title={asset.originalName}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#1438B8]">
                  <FileText className="w-10 h-10" />
                  <span className="text-xs font-medium">{asset.mimeType}</span>
                </div>
              )}
            </div>

            {isImage && (
              <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                <span>
                  Focal point: <strong>{focalPoint.x}% X</strong>, <strong>{focalPoint.y}% Y</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setFocalPoint({ x: 50, y: 50 })}
                  className="text-[#1438B8] hover:underline font-medium"
                >
                  Reset center
                </button>
              </div>
            )}

            {/* Replace File Box */}
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#0F172A]">Replace File Safely</p>
                  <p className="text-[11px] text-[#64748B]">
                    Keeps asset ID & updates all linked pages automatically.
                  </p>
                </div>
                <input
                  ref={replaceRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,application/pdf"
                  className="hidden"
                  onChange={(e) => handleReplace(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => replaceRef.current?.click()}
                  disabled={replacing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${replacing ? 'animate-spin' : ''}`} />
                  {replacing ? 'Replacing...' : 'Replace File'}
                </button>
              </div>
            </div>

            {/* Technical Metadata */}
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-3.5 text-[11px] space-y-1.5 text-[#475569]">
              <div className="flex justify-between">
                <span>Storage Location</span>
                <span className="font-semibold text-[#0F172A] uppercase">{asset.source}</span>
              </div>
              <div className="flex justify-between">
                <span>Uploaded By</span>
                <span className="font-medium text-[#0F172A]">{asset.uploadedBy}</span>
              </div>
              <div className="flex justify-between">
                <span>Uploaded At</span>
                <span>{new Date(asset.uploadedAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Used Across Site</span>
                <span className="font-semibold text-[#0F172A]">
                  {asset.usageCount ?? 0} reference(s)
                </span>
              </div>
            </div>
          </div>

          {/* Right Form & Usage Tabs */}
          <div className="lg:col-span-7 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-[#E5ECF6] pb-3">
              <button
                type="button"
                onClick={() => setTab('details')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === 'details'
                    ? 'bg-[#EEF3FC] text-[#1438B8]'
                    : 'text-[#64748B] hover:bg-[#F4F7FC]'
                }`}
              >
                Metadata & SEO
              </button>
              <button
                type="button"
                onClick={() => setTab('usage')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === 'usage'
                    ? 'bg-[#EEF3FC] text-[#1438B8]'
                    : 'text-[#64748B] hover:bg-[#F4F7FC]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Where Used ({asset.usageCount ?? 0})
              </button>
            </div>

            {notice && (
              <div
                className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  notice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {notice.text}
              </div>
            )}

            {tab === 'details' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Asset Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Descriptive media title"
                      className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Category / Folder
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                    >
                      <option value="general">General</option>
                      <option value="hero">Hero & Banners</option>
                      <option value="branding">Branding</option>
                      <option value="services">Services & Solutions</option>
                      <option value="portfolio">Portfolio</option>
                      <option value="articles">Articles</option>
                      <option value="documents">Documents</option>
                    </select>
                  </div>
                </div>

                <div
                  className={
                    highlightField === 'altText'
                      ? 'rounded-xl border-2 border-amber-400 bg-amber-50/50 p-3'
                      : ''
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#334155]">
                      Alt Text (Accessibility & SEO)
                    </label>
                    {isImage && !altText.trim() && (
                      <span className="text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Missing alt text
                      </span>
                    )}
                  </div>
                  <input
                    ref={altRef}
                    type="text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Describe what appears in this image for screen readers and search engines"
                    className="w-full rounded-lg border border-[#D4DFEE] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Caption
                  </label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Optional visible caption shown under images"
                    className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Description / Internal Notes
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Usage notes, copyright attribution, or campaign details"
                    className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Display Filename
                  </label>
                  <input
                    type="text"
                    value={originalName}
                    onChange={(e) => setOriginalName(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-xs font-mono text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
                  />
                </div>

                <div className="pt-3 border-t border-[#E5ECF6] flex flex-wrap items-center justify-between gap-3">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 px-3 py-2 text-xs font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Asset
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-red-800 font-medium">
                        {(asset.usageCount ?? 0) > 0
                          ? `Used in ${asset.usageCount} place(s). Delete anyway?`
                          : 'Confirm permanent delete?'}
                      </span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-xs font-semibold"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-[#475569] hover:text-[#0F172A] px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-4 py-2 text-xs font-semibold text-[#334155]"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving...' : 'Save Metadata'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#64748B]">
                  Pages, services, articles, and SEO settings currently referencing this asset:
                </p>
                {!asset.usedIn || asset.usedIn.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D4DFEE] p-8 text-center">
                    <p className="text-sm font-semibold text-[#0F172A]">Not currently referenced</p>
                    <p className="text-xs text-[#64748B] mt-1">
                      Select this asset from any Page, Service, Solution, Article, or SEO editor to link it.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5ECF6] rounded-xl border border-[#DDE5F0]">
                    {asset.usedIn.map((ref, idx) => (
                      <div
                        key={`${ref.entityType}-${ref.entityId}-${idx}`}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#0F172A]">{ref.entityTitle}</p>
                          <p className="text-xs text-[#64748B]">
                            <span className="uppercase font-semibold">{ref.entityType}</span> ·{' '}
                            {ref.field}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate(ref.deepLink);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#D4DFEE] hover:border-[#1438B8] hover:text-[#1438B8] px-3 py-1.5 text-xs font-semibold text-[#334155]"
                        >
                          Open Editor <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
