import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Search,
  Copy,
  Trash2,
  RefreshCw,
  FileText,
  Check,
  Edit3,
  X,
} from 'lucide-react';
import { apiRequest, formatDateTime, formatFileSize } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { MediaAsset } from '../types/cms';

export function MediaLibraryPage() {
  const { notify } = useAuth();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'document'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingAlt, setEditingAlt] = useState<MediaAsset | null>(null);
  const [altDraft, setAltDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: MediaAsset[] }>('/api/media');
      setAssets(data.items);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load media library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (typeFilter === 'image' && !a.mimeType.startsWith('image/')) return false;
      if (typeFilter === 'document' && a.mimeType.startsWith('image/')) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.originalName.toLowerCase().includes(q) ||
          (a.altText || '').toLowerCase().includes(q) ||
          a.mimeType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assets, search, typeFilter]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      notify('error', 'File exceeds the 10 MB upload limit.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('altText', file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      await apiRequest('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      notify('success', `Uploaded "${file.name}".`);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTargetId) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiRequest(`/api/media/${replaceTargetId}/replace`, {
        method: 'POST',
        body: formData,
      });
      notify('success', `Replaced asset with "${file.name}".`);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to replace asset.');
    } finally {
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleSaveAlt = async () => {
    if (!editingAlt) return;
    try {
      await apiRequest(`/api/media/${editingAlt.id}`, {
        method: 'PUT',
        body: JSON.stringify({ altText: altDraft }),
      });
      notify('success', 'Alt text updated.');
      setEditingAlt(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update alt text.');
    }
  };

  const handleCopyUrl = async (asset: MediaAsset) => {
    const fullUrl = asset.url.startsWith('http')
      ? asset.url
      : `${window.location.origin}${asset.url}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedId(asset.id);
    notify('info', 'Media URL copied to clipboard.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/media/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted "${deleteTarget.originalName}".`);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to delete asset.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">Media Library</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Upload validated images and PDFs (max 10 MB), manage alt text, replace files, and copy URLs.
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={handleUpload}
            className="hidden"
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={handleReplace}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] disabled:opacity-60 whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Media'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename or alt text..."
            className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
          />
        </div>
        <div className="inline-flex items-center rounded-lg border border-[#DDE5F0] bg-white p-1">
          {(['all', 'image', 'document'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                typeFilter === t ? 'bg-[#1438B8] text-white' : 'text-[#475569] hover:text-[#0D1F4E]'
              }`}
            >
              {t === 'all' ? 'All Files' : `${t}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="rounded-xl border border-[#DDE5F0] bg-white py-16 text-center text-sm text-[#64748B]">
          Loading media assets...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white py-16 px-6 text-center">
          <p className="text-sm font-semibold text-[#0D1F4E]">No media assets uploaded yet</p>
          <p className="mt-1 text-xs text-[#64748B]">
            Upload JPEG, PNG, WebP, SVG, or PDF files to manage them in RYZITE Control Centre.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload First Asset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="h-44 bg-[#F4F7FC] flex items-center justify-center overflow-hidden border-b border-[#E2E8F0]">
                  {asset.mimeType.startsWith('image/') ? (
                    <img
                      src={asset.url}
                      alt={asset.altText || asset.originalName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[#475569]">
                      <FileText className="h-10 w-10 text-[#1438B8]" />
                      <span className="font-mono text-xs">{asset.mimeType}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-1.5">
                  <div className="text-sm font-semibold text-[#0D1F4E] truncate" title={asset.originalName}>
                    {asset.originalName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#64748B]">
                    <span>{formatFileSize(asset.sizeBytes)}</span>
                    <span>·</span>
                    <span>{asset.source}</span>
                    <span>·</span>
                    <span>{formatDateTime(asset.uploadedAt)}</span>
                  </div>
                  <div className="text-xs text-[#475569] truncate">
                    Alt: {asset.altText ? asset.altText : <span className="text-[#B45309]">Missing alt text</span>}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#F1F5F9] px-3 py-2.5 flex items-center justify-between gap-1 bg-[#F8FAFD]">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(asset)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#334155] hover:bg-white hover:text-[#1438B8]"
                >
                  {copiedId === asset.id ? <Check className="h-3.5 w-3.5 text-[#16A34A]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === asset.id ? 'Copied' : 'Copy URL'}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAlt(asset);
                      setAltDraft(asset.altText || '');
                    }}
                    title="Edit alt text"
                    className="rounded p-1.5 text-[#334155] hover:bg-white hover:text-[#1438B8]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceTargetId(asset.id);
                      replaceInputRef.current?.click();
                    }}
                    title="Replace file"
                    className="rounded p-1.5 text-[#334155] hover:bg-white hover:text-[#1438B8]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(asset)}
                    title="Delete asset"
                    className="rounded p-1.5 text-[#DC2626] hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Alt Text Modal */}
      {editingAlt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1F4E]/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#DDE5F0] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0D1F4E]">Edit Alt Text</h3>
              <button type="button" onClick={() => setEditingAlt(null)} className="text-[#64748B]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#64748B] mb-3 truncate">{editingAlt.originalName}</p>
            <input
              type="text"
              value={altDraft}
              onChange={(e) => setAltDraft(e.target.value)}
              placeholder="Describe the image for accessibility and search engines..."
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAlt(null)}
                className="rounded-lg border border-[#DDE5F0] px-3.5 py-2 text-xs font-medium text-[#334155]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAlt}
                className="rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
              >
                Save Alt Text
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Media Asset"
        description={`Permanently delete "${deleteTarget?.originalName}"? Any pages referencing this URL will lose the image.`}
        confirmLabel="Delete Asset"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
