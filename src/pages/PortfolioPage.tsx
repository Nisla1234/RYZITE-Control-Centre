import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  Star,
  ExternalLink,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { apiRequest, formatDateTime, slugify } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import type { PortfolioProject } from '../types/cms';

function emptyProject(): PortfolioProject {
  return {
    id: '',
    name: '',
    slug: '',
    description: '',
    category: 'Enterprise Web',
    technologies: [],
    projectUrl: '',
    thumbnailUrl: '',
    thumbnailAlt: '',
    gallery: [],
    featured: false,
    displayOrder: 1,
    status: 'draft',
    seo: { metaTitle: '', metaDescription: '' },
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export function PortfolioPage() {
  const { notify } = useAuth();
  const [items, setItems] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [editing, setEditing] = useState<PortfolioProject | null>(null);
  const [techInput, setTechInput] = useState('');
  const [previewing, setPreviewing] = useState<PortfolioProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PortfolioProject | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: PortfolioProject[] }>('/api/content/project');
      setItems(data.items.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99)));
    } catch (err: any) {
      notify('error', err.message || 'Failed to load portfolio projects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.technologies || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const openEditor = (proj: PortfolioProject) => {
    setEditing(proj);
    setTechInput((proj.technologies || []).join(', '));
  };

  const handleSave = async (targetStatus?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.name.trim()) {
      notify('error', 'Project name is required.');
      return;
    }

    setSaving(true);
    try {
      const technologies = techInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: PortfolioProject = {
        ...editing,
        slug: editing.slug.trim() || slugify(editing.name),
        technologies,
        status: targetStatus || editing.status,
      };
      if (editing.id) {
        await apiRequest(`/api/content/project/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated project "${payload.name}".`);
      } else {
        await apiRequest('/api/content/project', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Created project "${payload.name}".`);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/project/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted project "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to delete project.');
    }
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE5F0]">
          <div>
            <h2 className="text-xl font-bold text-[#0D1F4E]">
              {editing.id ? `Edit Project: ${editing.name}` : 'Add Portfolio Project'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Configure case study details, media gallery, featured placement, and SEO metadata.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPreviewing({
                  ...editing,
                  technologies: techInput.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC]"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
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
              {saving ? 'Saving...' : 'Publish Project'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Project Name *</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      name: e.target.value,
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
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Display Order</label>
                <input
                  type="number"
                  min={1}
                  value={editing.displayOrder}
                  onChange={(e) => setEditing({ ...editing, displayOrder: Number(e.target.value) || 1 })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.featured}
                    onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                    className="h-4 w-4 rounded border-[#CBD5E1] text-[#1438B8]"
                  />
                  Featured on Homepage
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Description</label>
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
                  Technologies Used (comma-separated)
                </label>
                <input
                  type="text"
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  placeholder="TypeScript, React, Sanity CMS, Cloudflare"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Live Project URL</label>
                <input
                  type="url"
                  value={editing.projectUrl}
                  onChange={(e) => setEditing({ ...editing, projectUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F0]">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                  Thumbnail Image URL
                </label>
                <input
                  type="text"
                  value={editing.thumbnailUrl}
                  onChange={(e) => setEditing({ ...editing, thumbnailUrl: e.target.value })}
                  placeholder="/uploads/... or Sanity CDN URL"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                  Thumbnail Alt Text
                </label>
                <input
                  type="text"
                  value={editing.thumbnailAlt}
                  onChange={(e) => setEditing({ ...editing, thumbnailAlt: e.target.value })}
                  placeholder="Accessible description of thumbnail"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4 h-fit">
            <h3 className="text-sm font-semibold text-[#0D1F4E]">Project SEO Metadata</h3>
            <div>
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

        {previewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1F4E]/60 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-[#DDE5F0] bg-white overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Project Preview</h3>
                <button type="button" onClick={() => setPreviewing(null)} className="p-1 text-[#64748B]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {previewing.thumbnailUrl && (
                  <img
                    src={previewing.thumbnailUrl}
                    alt={previewing.thumbnailAlt || previewing.name}
                    className="w-full h-56 object-cover rounded-lg border border-[#E2E8F0]"
                  />
                )}
                <div className="text-xs font-medium text-[#1438B8]">
                  {previewing.category} {previewing.featured ? '· Featured Case Study' : ''}
                </div>
                <h2 className="text-2xl font-bold text-[#0D1F4E]">{previewing.name}</h2>
                <p className="text-sm leading-relaxed text-[#334155]">{previewing.description}</p>
                {previewing.technologies.length > 0 && (
                  <div className="text-xs text-[#64748B]">
                    Stack: {previewing.technologies.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">Portfolio Projects</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Manage client case studies, technology stacks, featured placement, and display ordering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(emptyProject())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Project
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, categories, or technologies..."
            className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
          />
        </div>
        <div className="inline-flex items-center rounded-lg border border-[#DDE5F0] bg-white p-1">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                statusFilter === s ? 'bg-[#1438B8] text-white' : 'text-[#475569] hover:text-[#0D1F4E]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFD] text-xs font-semibold text-[#475569]">
                <th className="px-6 py-3.5">Order</th>
                <th className="px-4 py-3.5">Project</th>
                <th className="px-4 py-3.5">Category & Stack</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Updated</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    Loading portfolio projects...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    No portfolio projects found.
                  </td>
                </tr>
              ) : (
                filtered.map((proj) => (
                  <tr key={proj.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-6 py-3.5 font-mono text-xs tabular-nums text-[#64748B]">
                      #{proj.displayOrder}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
                        <span>{proj.name}</span>
                        {proj.featured && (
                          <Star className="h-3.5 w-3.5 fill-[#D97706] text-[#D97706]" aria-label="Featured" />
                        )}
                      </div>
                      <div className="text-xs text-[#64748B] truncate max-w-xs">{proj.description}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-medium text-[#0D1F4E]">{proj.category}</div>
                      <div className="text-xs text-[#64748B] truncate max-w-xs">
                        {(proj.technologies || []).join(' · ')}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusText status={proj.status} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-[#64748B]">
                      {formatDateTime(proj.updatedAt)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {proj.projectUrl && (
                          <a
                            href={proj.projectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 text-[#475569] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                            aria-label="Open project URL"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditor(proj)}
                          className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                          aria-label={`Edit ${proj.name}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(proj)}
                          className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
                          aria-label={`Delete ${proj.name}`}
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
        title="Delete Portfolio Project"
        description={`Delete "${deleteTarget?.name}" permanently? This action cannot be undone.`}
        confirmLabel="Delete Project"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
