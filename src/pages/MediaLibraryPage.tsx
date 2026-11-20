import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  FolderOpen,
  Link2,
  Search,
  Upload,
} from 'lucide-react';
import { apiFetch, apiUpload } from '../lib/api';
import type { MediaAsset } from '../types/cms';
import { MediaEditorModal } from '../components/media/MediaEditorModal';
import { MediaThumbnail } from '../components/media/MediaThumbnail';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MediaLibraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filterMode, setFilterMode] = useState<'all' | 'missing-alt' | 'used' | 'unused'>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [highlightField, setHighlightField] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: MediaAsset[] }>('/api/media');
      setItems(res.items);
      return res.items;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to load media library.' });
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia().then((loaded) => {
      // Support deep links like /admin/media/<id>?field=altText
      const parts = location.pathname.replace(/^\/admin\/media\/?/, '').split('/').filter(Boolean);
      const targetId = parts[0];
      if (targetId && loaded.length > 0) {
        const found = loaded.find((m) => m.id === targetId);
        if (found) {
          setSelectedAsset(found);
          setHighlightField(searchParams.get('field'));
        }
      }
    });
  }, [location.pathname, searchParams]);

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setNotice(null);

    let successCount = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      const fd = new FormData();
      fd.append('file', files[i]);
      if (category !== 'all') fd.append('category', category);
      try {
        const res = await apiUpload<{ item: MediaAsset; duplicateWarning?: string | null }>(
          '/api/media/upload',
          fd
        );
        successCount++;
        if (res.duplicateWarning) warnings.push(res.duplicateWarning);
      } catch (err: any) {
        errors.push(`${files[i].name}: ${err.message || 'Upload failed'}`);
      }
    }

    await loadMedia();
    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (errors.length > 0) {
      setNotice({
        type: 'error',
        text: `${successCount} uploaded. Errors: ${errors.join(' | ')}`,
      });
    } else if (warnings.length > 0) {
      setNotice({
        type: 'warning',
        text: `Uploaded ${successCount} file(s). Note: ${warnings[0]}`,
      });
    } else {
      setNotice({
        type: 'success',
        text: `Successfully uploaded ${successCount} media file(s).`,
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const totalBytes = items.reduce((acc, m) => acc + (m.sizeBytes || 0), 0);
  const missingAltCount = items.filter(
    (m) => m.mimeType.startsWith('image/') && !m.altText.trim()
  ).length;

  const filtered = items.filter((item) => {
    if (category !== 'all' && (item.category || 'general') !== category) return false;
    if (filterMode === 'missing-alt' && (!item.mimeType.startsWith('image/') || item.altText.trim())) {
      return false;
    }
    if (filterMode === 'used' && (item.usageCount ?? 0) === 0) return false;
    if (filterMode === 'unused' && (item.usageCount ?? 0) > 0) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.originalName.toLowerCase().includes(q) ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.altText || '').toLowerCase().includes(q) ||
        (item.caption || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopy = (item: MediaAsset) => {
    const abs = item.url.startsWith('http') ? item.url : `${window.location.origin}${item.url}`;
    navigator.clipboard?.writeText(abs);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Media Library</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {items.length} asset(s) · {formatBytes(totalBytes)} total storage
            {missingAltCount > 0 ? ` · ${missingAltCount} image(s) missing alt text` : ' · All images have alt text'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files && handleFilesUpload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {uploadProgress
              ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
              : 'Upload Files'}
          </button>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragActive
            ? 'border-[#1438B8] bg-[#EEF3FC]'
            : 'border-[#CBD8EC] bg-white hover:border-[#94B0DF]'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[#0F172A]">
              Drag and drop images or PDFs here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[#1438B8] hover:underline"
              >
                browse files
              </button>
            </p>
            <p className="text-xs text-[#64748B]">
              Supports JPEG, PNG, WebP, GIF, safe SVG, and PDF up to 10 MB. Multi-file upload & automatic duplicate detection enabled.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : notice.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-xl border border-[#DDE5F0] p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, filename, alt text, or caption..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D4DFEE] text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-[#D4DFEE] bg-white px-3 py-1.5 text-xs text-[#334155]"
        >
          <option value="all">All Categories</option>
          <option value="general">General</option>
          <option value="hero">Hero & Banners</option>
          <option value="branding">Branding</option>
          <option value="services">Services & Solutions</option>
          <option value="portfolio">Portfolio</option>
          <option value="articles">Articles</option>
          <option value="documents">Documents</option>
        </select>
        <div className="flex items-center gap-1 rounded-lg bg-[#F4F7FC] p-1 text-xs">
          {(
            [
              ['all', 'All'],
              ['missing-alt', `Missing Alt (${missingAltCount})`],
              ['used', 'In Use'],
              ['unused', 'Unused'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterMode(key)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMode === key
                  ? 'bg-white text-[#1438B8] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-12 text-center text-sm text-[#64748B]">
          Loading Media Library...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-12 text-center">
          <FolderOpen className="w-10 h-10 text-[#94A3B8] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#0F172A]">No media files found</p>
          <p className="text-xs text-[#64748B] mt-1">
            Upload images or PDF documents above, or clear your active filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const isImg = item.mimeType.startsWith('image/');
            const missingAlt = isImg && !item.altText.trim();

            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-[#DDE5F0] hover:border-[#94B0DF] hover:shadow-sm transition-all overflow-hidden flex flex-col"
              >
                {/* Thumbnail */}
                <div
                  onClick={() => {
                    setSelectedAsset(item);
                    setHighlightField(null);
                  }}
                  className="h-44 bg-[#F4F7FC] relative overflow-hidden cursor-pointer group"
                >
                  <MediaThumbnail
                    src={item.url}
                    alt={item.altText || item.originalName}
                    isPdf={!isImg}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    objectPosition={`${item.focalPoint?.x ?? 50}% ${item.focalPoint?.y ?? 50}%`}
                    showErrorHint
                  />

                  {/* Top badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#0D1F4E]/80 text-white">
                      {item.category || 'general'}
                    </span>
                    {(item.usageCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                        <Link2 className="w-2.5 h-2.5" /> {item.usageCount}
                      </span>
                    )}
                  </div>
                  {missingAlt && (
                    <span
                      title="Missing SEO alt text"
                      className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500 text-white"
                    >
                      <AlertTriangle className="w-2.5 h-2.5" /> No Alt
                    </span>
                  )}
                </div>

                {/* Metadata summary */}
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <p
                      className="text-xs font-bold text-[#0F172A] truncate"
                      title={item.title || item.originalName}
                    >
                      {item.title || item.originalName}
                    </p>
                    <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                      {item.originalName}
                    </p>
                    <p className="text-[10px] text-[#94A3B8] mt-1">
                      {formatBytes(item.sizeBytes)}
                      {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                      {' · '}
                      <span className="uppercase">{item.source}</span>
                      {' · '}v{item.version || 1}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-[#EDF2FA]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAsset(item);
                        setHighlightField(null);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Details
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(item)}
                      title="Copy URL"
                      className="p-1.5 rounded-lg border border-[#DDE5F0] hover:bg-[#F4F7FC] text-[#475569]"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open original"
                      className="p-1.5 rounded-lg border border-[#DDE5F0] hover:bg-[#F4F7FC] text-[#475569]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Media Editor Modal */}
      <MediaEditorModal
        asset={selectedAsset}
        highlightField={highlightField}
        onClose={() => {
          setSelectedAsset(null);
          setHighlightField(null);
          if (location.pathname !== '/admin/media' && location.pathname !== '/admin/media/') {
            navigate('/admin/media', { replace: true });
          }
        }}
        onUpdated={(updated) => {
          setSelectedAsset(updated);
          setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }}
        onDeleted={(id) => {
          setItems((prev) => prev.filter((m) => m.id !== id));
          setNotice({ type: 'success', text: 'Media asset deleted.' });
        }}
      />
    </div>
  );
}
