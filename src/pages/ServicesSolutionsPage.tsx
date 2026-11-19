import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit3, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { apiRequest, formatDateTime, slugify } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import type { ServiceOrSolution } from '../types/cms';

interface Props {
  kind: 'service' | 'solution';
}

function createEmpty(kind: 'service' | 'solution'): ServiceOrSolution {
  return {
    id: '',
    type: kind,
    title: '',
    slug: '',
    category: kind === 'service' ? 'Engineering' : 'Digital Transformation',
    summary: '',
    description: '',
    iconName: 'Layers',
    imageUrl: '',
    imageAlt: '',
    features: [],
    benefits: [],
    ctaText: 'Schedule a Consultation',
    ctaUrl: '/contact',
    displayOrder: 1,
    status: 'draft',
    seo: { metaTitle: '', metaDescription: '' },
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export function ServicesSolutionsPage({ kind }: Props) {
  const { notify } = useAuth();
  const label = kind === 'service' ? 'Service' : 'Solution';
  const plural = kind === 'service' ? 'Services' : 'Solutions';

  const [items, setItems] = useState<ServiceOrSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ServiceOrSolution | null>(null);
  const [featuresText, setFeaturesText] = useState('');
  const [benefitsText, setBenefitsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrSolution | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: ServiceOrSolution[] }>(`/api/content/${kind}`);
      setItems(data.items.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99)));
    } catch (err: any) {
      notify('error', err.message || `Failed to load ${plural.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setEditing(null);
    load();
  }, [kind]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q)
    );
  }, [items, search]);

  const openEditor = (item: ServiceOrSolution) => {
    setEditing(item);
    setFeaturesText((item.features || []).join('\n'));
    setBenefitsText((item.benefits || []).join('\n'));
  };

  const handleSave = async (targetStatus?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.title.trim()) {
      notify('error', `${label} title is required.`);
      return;
    }

    setSaving(true);
    try {
      const payload: ServiceOrSolution = {
        ...editing,
        type: kind,
        slug: editing.slug.trim() || slugify(editing.title),
        features: featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        benefits: benefitsText.split('\n').map((s) => s.trim()).filter(Boolean),
        status: targetStatus || editing.status,
      };
      if (editing.id) {
        await apiRequest(`/api/content/${kind}/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated ${label.toLowerCase()} "${payload.title}".`);
      } else {
        await apiRequest(`/api/content/${kind}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Created ${label.toLowerCase()} "${payload.title}".`);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || `Failed to save ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/${kind}/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted "${deleteTarget.title}".`);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Delete failed.');
    }
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE5F0]">
          <div>
            <h2 className="text-xl font-bold text-[#0D1F4E]">
              {editing.id ? `Edit ${label}: ${editing.title}` : `New ${label}`}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Define structured capabilities, benefits, CTA destination, and SEO metadata.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1438B8] hover:bg-[#EEF3FC]"
            >
              <Clock className="h-3.5 w-3.5" />
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : `Publish ${label}`}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Title *</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      title: e.target.value,
                      slug: !editing.id ? slugify(e.target.value) : editing.slug,
                    })
                  }
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Slug</label>
                <input
                  type="text"
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Category</label>
                <input
                  type="text"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Icon Name</label>
                <input
                  type="text"
                  value={editing.iconName}
                  onChange={(e) => setEditing({ ...editing, iconName: e.target.value })}
                  placeholder="Code2, Shield, Layers"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Display Order</label>
                <input
                  type="number"
                  min={1}
                  value={editing.displayOrder}
                  onChange={(e) => setEditing({ ...editing, displayOrder: Number(e.target.value) || 1 })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Short Summary</label>
              <input
                type="text"
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Full Description</label>
              <textarea
                rows={4}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                  Features (one per line)
                </label>
                <textarea
                  rows={4}
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                  Benefits (one per line)
                </label>
                <textarea
                  rows={4}
                  value={benefitsText}
                  onChange={(e) => setBenefitsText(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F0]">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">CTA Button Label</label>
                <input
                  type="text"
                  value={editing.ctaText}
                  onChange={(e) => setEditing({ ...editing, ctaText: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">CTA Target URL</label>
                <input
                  type="text"
                  value={editing.ctaUrl}
                  onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4 h-fit">
            <h3 className="text-sm font-semibold text-[#0D1F4E]">{label} SEO & Media</h3>
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">Image URL</label>
              <input
                type="text"
                value={editing.imageUrl}
                onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">Image Alt Text</label>
              <input
                type="text"
                value={editing.imageAlt}
                onChange={(e) => setEditing({ ...editing, imageAlt: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div className="pt-2 border-t border-[#E2E8F0]">
              <label className="block text-xs font-medium text-[#334155] mb-1">Meta Title</label>
              <input
                type="text"
                value={editing.seo?.metaTitle || ''}
                onChange={(e) =>
                  setEditing({ ...editing, seo: { ...editing.seo, metaTitle: e.target.value } })
                }
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#334155] mb-1">Meta Description</label>
              <textarea
                rows={3}
                value={editing.seo?.metaDescription || ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    seo: { ...editing.seo, metaDescription: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">{plural} Management</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Manage RYZITE {plural.toLowerCase()}, feature lists, calls-to-action, and ordering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(createEmpty(kind))}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add {label}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${plural.toLowerCase()}...`}
          className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFD] text-xs font-semibold text-[#475569]">
                <th className="px-6 py-3.5">Order</th>
                <th className="px-4 py-3.5">{label}</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Updated</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    Loading {plural.toLowerCase()}...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    No {plural.toLowerCase()} found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-6 py-3.5 font-mono text-xs tabular-nums text-[#64748B]">
                      #{item.displayOrder}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-[#0F172A]">{item.title}</div>
                      <div className="text-xs text-[#64748B] truncate max-w-md">{item.summary}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#475569]">{item.category}</td>
                    <td className="px-4 py-3.5">
                      <StatusText status={item.status} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-[#64748B]">
                      {formatDateTime(item.updatedAt)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                          aria-label={`Edit ${item.title}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${label}`}
        description={`Permanently delete "${deleteTarget?.title}"?`}
        confirmLabel={`Delete ${label}`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
