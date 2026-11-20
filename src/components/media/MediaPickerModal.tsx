import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, apiUpload } from '../../lib/api';
import type { MediaAsset } from '../../types/cms';
import { MediaThumbnail } from './MediaThumbnail';

export interface MediaPickerSelection {
  mediaId: string;
  url: string;
  altText: string;
  title?: string;
}

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: MediaPickerSelection) => void;
  acceptImagesOnly?: boolean;
  title?: string;
}

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  acceptImagesOnly = true,
  title = 'Select Media from Library',
}: MediaPickerModalProps) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: MediaAsset[] }>('/api/media');
      setItems(res.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load media library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!open) return null;

  const filtered = items.filter((item) => {
    if (acceptImagesOnly && !item.mimeType.startsWith('image/')) return false;
    if (category !== 'all' && (item.category || 'general') !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.originalName.toLowerCase().includes(q) ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.altText || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleQuickUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await apiUpload<{ item: MediaAsset }>('/api/media/upload', fd);
      await load();
      onSelect({
        mediaId: res.item.id,
        url: res.item.url,
        altText: res.item.altText || res.item.title || res.item.originalName,
        title: res.item.title,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0D1F4E]/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[88vh] bg-white rounded-xl border border-[#DDE5F0] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5ECF6] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
            <p className="text-xs text-[#64748B]">
              Choose an existing asset or upload a new file to link directly to this content.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={acceptImagesOnly ? 'image/jpeg,image/png,image/webp,image/svg+xml,image/gif' : 'image/*,application/pdf'}
              className="hidden"
              onChange={(e) => handleQuickUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload New'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#F4F7FC] hover:text-[#0F172A]"
              aria-label="Close media picker"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#E5ECF6] bg-[#F8FAFD] flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, filename, or alt text..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#D4DFEE] bg-white text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
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
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-[#64748B] text-center py-12">Loading Media Library...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-semibold text-[#0F172A]">No matching media files found</p>
              <p className="text-xs text-[#64748B] mt-1">
                Upload a new image using the button above or clear your search filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {filtered.map((item) => {
                const isImg = item.mimeType.startsWith('image/');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect({
                        mediaId: item.id,
                        url: item.url,
                        altText: item.altText || item.title || item.originalName,
                        title: item.title,
                      });
                      onClose();
                    }}
                    className="group text-left rounded-xl border border-[#DDE5F0] hover:border-[#1438B8] hover:shadow-md bg-white overflow-hidden transition-all flex flex-col"
                  >
                    <div className="h-32 w-full bg-[#F4F7FC] overflow-hidden relative">
                      <MediaThumbnail
                        src={item.url}
                        alt={item.altText || item.originalName}
                        isPdf={!isImg}
                        compact
                        className="w-full h-full"
                        objectPosition={`${item.focalPoint?.x ?? 50}% ${item.focalPoint?.y ?? 50}%`}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-[#1438B8]/0 group-hover:bg-[#1438B8]/15 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded-md bg-[#1438B8] text-white px-2.5 py-1 text-[11px] font-semibold shadow">
                          <Check className="w-3 h-3" /> Select
                        </span>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-[#0F172A] truncate">
                        {item.title || item.originalName}
                      </p>
                      <p className="text-[10px] text-[#64748B] truncate mt-0.5">
                        {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
                        {(item.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
