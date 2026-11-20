import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  X,
  CheckCircle2,
  Clock,
  Bold,
  Italic,
  Heading2,
  List,
  Image as ImageIcon,
} from 'lucide-react';
import { apiRequest, formatDateTime, slugify } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import { SeoFieldsPanel } from '../components/ui/SeoFieldsPanel';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import type { ArticleItem } from '../types/cms';

function emptyArticle(): ArticleItem {
  return {
    id: '',
    title: '',
    slug: '',
    excerpt: '',
    body: '',
    featuredImageUrl: '',
    featuredImageAlt: '',
    author: 'RYZITE Editorial',
    categories: [],
    tags: [],
    publishedAt: new Date().toISOString().slice(0, 10),
    status: 'draft',
    seo: { metaTitle: '', metaDescription: '', ogTitle: '', ogDescription: '' },
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export function ArticlesPage() {
  const { notify } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ArticleItem | null>(null);
  const [categoriesText, setCategoriesText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [previewing, setPreviewing] = useState<ArticleItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ArticleItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightField, setHighlightField] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: ArticleItem[] }>('/api/content/article');
      setItems(data.items);
      return data.items;
    } catch (err: any) {
      notify('error', err.message || 'Failed to load articles.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().then((loaded) => {
      const targetId = location.pathname
        .replace(/^\/admin\/articles\/?/, '')
        .split('/')
        .filter(Boolean)[0];
      if (targetId && loaded.length > 0) {
        const found = loaded.find((a) => a.id === targetId || a.slug === targetId);
        if (found) {
          setEditing(found);
          setCategoriesText((found.categories || []).join(', '));
          setTagsText((found.tags || []).join(', '));
          setHighlightField(searchParams.get('field'));
        }
      }
    });
  }, [location.pathname, searchParams]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        (a.categories || []).some((c) => c.toLowerCase().includes(q))
    );
  }, [items, search]);

  const openEditor = (art: ArticleItem) => {
    setEditing(art);
    setCategoriesText((art.categories || []).join(', '));
    setTagsText((art.tags || []).join(', '));
  };

  const insertBodySyntax = (snippet: string) => {
    if (!editing) return;
    setEditing({ ...editing, body: `${editing.body}${editing.body ? '\n' : ''}${snippet}` });
  };

  const handleSave = async (status?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.title.trim()) {
      notify('error', 'Article title is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: ArticleItem = {
        ...editing,
        slug: editing.slug.trim() || slugify(editing.title),
        categories: categoriesText.split(',').map((s) => s.trim()).filter(Boolean),
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
        status: status || editing.status,
      };
      if (editing.id) {
        await apiRequest(`/api/content/article/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated article "${payload.title}".`);
      } else {
        await apiRequest('/api/content/article', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Created article "${payload.title}".`);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save article.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/article/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted article "${deleteTarget.title}".`);
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
          <h2 className="text-xl font-bold text-[#0D1F4E]">
            {editing.id ? `Edit Article: ${editing.title}` : 'Write New Article'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewing(editing)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155]"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1438B8]"
            >
              <Clock className="h-3.5 w-3.5" /> Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Publish Article
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Article Title *</label>
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

            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Excerpt</label>
              <textarea
                rows={2}
                value={editing.excerpt}
                onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#1E293B]">Article Body</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertBodySyntax('## Section Heading')}
                    className="rounded border border-[#DDE5F0] p-1 text-[#475569] hover:text-[#1438B8]"
                    title="Insert H2 Heading"
                  >
                    <Heading2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertBodySyntax('**bold emphasis**')}
                    className="rounded border border-[#DDE5F0] p-1 text-[#475569] hover:text-[#1438B8]"
                    title="Insert Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertBodySyntax('*italic emphasis*')}
                    className="rounded border border-[#DDE5F0] p-1 text-[#475569] hover:text-[#1438B8]"
                    title="Insert Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertBodySyntax('- Key takeaway item')}
                    className="rounded border border-[#DDE5F0] p-1 text-[#475569] hover:text-[#1438B8]"
                    title="Insert List Item"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                rows={12}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Write your article in structured Markdown..."
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm leading-relaxed focus:border-[#1438B8] focus:outline-none"
              />
            </div>
          </div>

          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-3.5">
              <h3 className="text-sm font-semibold text-[#0D1F4E]">Publishing Metadata</h3>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Author</label>
                <input
                  type="text"
                  value={editing.author}
                  onChange={(e) => setEditing({ ...editing, author: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Publication Date</label>
                <input
                  type="date"
                  value={editing.publishedAt?.slice(0, 10) || ''}
                  onChange={(e) => setEditing({ ...editing, publishedAt: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Categories (comma-separated)</label>
                <input
                  type="text"
                  value={categoriesText}
                  onChange={(e) => setCategoriesText(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Featured Image</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editing.featuredImageUrl}
                    onChange={(e) => setEditing({ ...editing, featuredImageUrl: e.target.value })}
                    className="flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2 text-xs focus:border-[#1438B8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-2.5 py-2 text-xs font-semibold shrink-0"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Media
                  </button>
                </div>
                {editing.featuredImageUrl && (
                  <img
                    src={editing.featuredImageUrl}
                    alt={editing.featuredImageAlt || editing.title}
                    className="mt-2 h-28 w-full object-cover rounded-lg border border-[#DDE5F0]"
                  />
                )}
              </div>
              <div
                className={
                  highlightField === 'imageAlt'
                    ? 'rounded-xl border-2 border-amber-400 bg-amber-50/50 p-2.5'
                    : ''
                }
              >
                <label className="block text-xs font-medium text-[#334155] mb-1">Featured Image Alt Text</label>
                <input
                  type="text"
                  value={editing.featuredImageAlt || ''}
                  onChange={(e) => setEditing({ ...editing, featuredImageAlt: e.target.value })}
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6">
              <h3 className="text-sm font-semibold text-[#0D1F4E] mb-4">SEO & Social Metadata</h3>
              <SeoFieldsPanel
                seo={editing.seo || { metaTitle: '', metaDescription: '' }}
                slug={`/articles/${editing.slug || slugify(editing.title || 'article')}`}
                highlightField={highlightField}
                onChange={(nextSeo) => setEditing({ ...editing, seo: nextSeo })}
              />
            </div>
          </div>
        </div>

        <MediaPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title="Select Article Featured Image"
          onSelect={(sel) =>
            setEditing((prev) =>
              prev
                ? {
                    ...prev,
                    featuredImageUrl: sel.url,
                    featuredImageMediaId: sel.mediaId,
                    featuredImageAlt: prev.featuredImageAlt || sel.altText,
                  }
                : prev
            )
          }
        />

        {previewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1F4E]/60 p-4">
            <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">Article Preview</h3>
                <button type="button" onClick={() => setPreviewing(null)} className="p-1 text-[#64748B]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <article className="p-8 space-y-4">
                <div className="text-xs text-[#64748B]">
                  {previewing.author} · {previewing.publishedAt}
                </div>
                <h1 className="text-3xl font-bold text-[#0D1F4E]">{previewing.title}</h1>
                <p className="text-base text-[#475569]">{previewing.excerpt}</p>
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3 text-sm leading-relaxed text-[#1E293B] whitespace-pre-wrap">
                  {previewing.body}
                </div>
              </article>
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
          <h2 className="text-xl font-bold text-[#0D1F4E]">Articles & Blog</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Publish engineering insights, announcements, and SEO-optimised editorial articles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor(emptyArticle())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" /> Write Article
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles by title, author, or category..."
          className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFD] text-xs font-semibold text-[#475569]">
                <th className="px-6 py-3.5">Article</th>
                <th className="px-4 py-3.5">Author & Categories</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Updated</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    Loading articles...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    No articles found.
                  </td>
                </tr>
              ) : (
                filtered.map((art) => (
                  <tr key={art.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-[#0F172A]">{art.title}</div>
                      <div className="text-xs text-[#64748B] truncate max-w-md">{art.excerpt}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-medium text-[#0D1F4E]">{art.author}</div>
                      <div className="text-xs text-[#64748B]">{(art.categories || []).join(' · ')}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusText status={art.status} />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-[#64748B]">
                      {formatDateTime(art.updatedAt)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditor(art)}
                          className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(art)}
                          className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
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
        title="Delete Article"
        description={`Permanently delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete Article"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
