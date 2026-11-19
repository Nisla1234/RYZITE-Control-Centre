import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  ArrowUp,
  ArrowDown,
  Bold,
  Italic,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  Image as ImageIcon,
  List,
  MousePointerClick,
  CheckCircle2,
  Clock,
  X,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest, formatDateTime, slugify } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import type { PageBlock, PageBlockType, WebsitePage } from '../types/cms';

function createEmptyPage(): WebsitePage {
  return {
    id: '',
    title: '',
    slug: '/',
    status: 'draft',
    blocks: [
      { id: `b-${Date.now()}-1`, type: 'heading', level: 1, text: '' },
      { id: `b-${Date.now()}-2`, type: 'paragraph', text: '' },
    ],
    seo: {
      metaTitle: '',
      metaDescription: '',
      canonicalUrl: '',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      noIndex: false,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

function renderFormattedText(text: string): React.ReactNode {
  // Safe inline renderer for **bold**, *italic*, and [label](url) without raw innerHTML
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1438B8] underline"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function PagesManagerPage() {
  const { notify } = useAuth();
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [editing, setEditing] = useState<WebsitePage | null>(null);
  const [previewing, setPreviewing] = useState<WebsitePage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebsitePage | null>(null);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: WebsitePage[] }>('/api/content/page');
      setPages(data.items);
    } catch (err: any) {
      notify('error', err.message || 'Failed to load website pages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const filtered = useMemo(() => {
    return pages.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
      }
      return true;
    });
  }, [pages, search, statusFilter]);

  const headingHierarchyWarnings = useMemo(() => {
    if (!editing) return [];
    const warnings: string[] = [];
    const h1Count = editing.blocks.filter((b) => b.type === 'heading' && b.level === 1).length;
    if (h1Count === 0) warnings.push('Add an H1 heading block for proper page hierarchy.');
    if (h1Count > 1) warnings.push(`Found ${h1Count} H1 headings; keep a single H1 per page.`);
    let prevLevel = 0;
    for (const b of editing.blocks) {
      if (b.type === 'heading' && b.level) {
        if (prevLevel === 0 && b.level > 1) {
          warnings.push(`First heading is H${b.level}; start with H1.`);
        } else if (prevLevel > 0 && b.level - prevLevel > 1) {
          warnings.push(`Skipped heading level from H${prevLevel} to H${b.level}.`);
        }
        prevLevel = b.level;
      }
    }
    return warnings;
  }, [editing]);

  const addBlock = (type: PageBlockType, level?: 1 | 2 | 3) => {
    if (!editing) return;
    const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let block: PageBlock;
    if (type === 'heading') {
      block = { id, type: 'heading', level: level || 2, text: '' };
    } else if (type === 'paragraph') {
      block = { id, type: 'paragraph', text: '' };
    } else if (type === 'list') {
      block = { id, type: 'list', items: [''] };
    } else if (type === 'image') {
      block = { id, type: 'image', imageUrl: '', imageAlt: '', caption: '' };
    } else {
      block = {
        id,
        type: 'cta',
        ctaHeading: '',
        ctaBody: '',
        ctaButtonText: 'Contact RYZITE',
        ctaButtonUrl: '/contact',
      };
    }
    setEditing({ ...editing, blocks: [...editing.blocks, block] });
  };

  const updateBlock = (blockId: string, patch: Partial<PageBlock>) => {
    if (!editing) return;
    setEditing({
      ...editing,
      blocks: editing.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (!editing) return;
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= editing.blocks.length) return;
    const next = [...editing.blocks];
    [next[index], next[nextIdx]] = [next[nextIdx], next[index]];
    setEditing({ ...editing, blocks: next });
  };

  const removeBlock = (blockId: string) => {
    if (!editing) return;
    setEditing({ ...editing, blocks: editing.blocks.filter((b) => b.id !== blockId) });
  };

  const applyInlineFormat = (blockId: string, currentText: string, syntax: 'bold' | 'italic' | 'link') => {
    const append =
      syntax === 'bold'
        ? ' **bold text**'
        : syntax === 'italic'
        ? ' *italic text*'
        : ' [link label](https://ryzite.com)';
    updateBlock(blockId, { text: `${currentText || ''}${append}`.trimStart() });
  };

  const handleSave = async (targetStatus?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.title.trim()) {
      notify('error', 'Page title is required.');
      return;
    }
    if (!editing.slug.trim()) {
      notify('error', 'Page URL slug is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: WebsitePage = {
        ...editing,
        status: targetStatus || editing.status,
      };
      if (editing.id) {
        await apiRequest(`/api/content/page/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Page "${payload.title}" saved (${payload.status}).`);
      } else {
        await apiRequest('/api/content/page', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Page "${payload.title}" created (${payload.status}).`);
      }
      setEditing(null);
      await fetchPages();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save page.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (page: WebsitePage) => {
    const nextStatus = page.status === 'published' ? 'draft' : 'published';
    try {
      await apiRequest(`/api/content/page/${page.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      notify(
        'success',
        nextStatus === 'published'
          ? `Published "${page.title}".`
          : `Moved "${page.title}" back to draft.`
      );
      await fetchPages();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update page status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/page/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted page "${deleteTarget.title}".`);
      setDeleteTarget(null);
      await fetchPages();
    } catch (err: any) {
      notify('error', err.message || 'Failed to delete page.');
    }
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE5F0]">
          <div>
            <h2 className="text-xl font-bold text-[#0D1F4E]">
              {editing.id ? `Edit Page: ${editing.title}` : 'Create Website Page'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Structured content blocks with heading hierarchy checks and page-level SEO.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewing(editing)}
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] bg-white px-3.5 py-2 text-xs font-semibold text-[#1438B8] hover:bg-[#EEF3FC] disabled:opacity-50"
            >
              <Clock className="h-3.5 w-3.5" />
              Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96] disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Publish Page'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Structured Block Editor */}
          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                    Page Title *
                  </label>
                  <input
                    type="text"
                    value={editing.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      setEditing({
                        ...editing,
                        title,
                        slug: !editing.id && editing.slug === '/' ? `/${slugify(title)}` : editing.slug,
                      });
                    }}
                    placeholder="e.g. Cloud Engineering Services"
                    className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">
                    URL Slug *
                  </label>
                  <input
                    type="text"
                    value={editing.slug}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    placeholder="/about"
                    className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {headingHierarchyWarnings.length > 0 && (
              <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#92400E]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Heading Hierarchy Check
                </div>
                <ul className="mt-1.5 list-disc pl-5 text-xs text-[#92400E] space-y-0.5">
                  {headingHierarchyWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Structured Blocks */}
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <h3 className="text-sm font-semibold text-[#0D1F4E]">
                  Structured Content Blocks ({editing.blocks.length})
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addBlock('heading', 1)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <Heading1 className="h-3.5 w-3.5" /> H1
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('heading', 2)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <Heading2 className="h-3.5 w-3.5" /> H2
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('heading', 3)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <Heading3 className="h-3.5 w-3.5" /> H3
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('paragraph')}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <AlignLeft className="h-3.5 w-3.5" /> Paragraph
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('list')}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <List className="h-3.5 w-3.5" /> List
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('image')}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Image
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('cta')}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DDE5F0] px-2 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" /> CTA
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {editing.blocks.map((block, index) => (
                  <div key={block.id} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0D1F4E] capitalize">
                        {block.type === 'heading' ? `Heading H${block.level || 2}` : `${block.type} block`}
                      </span>
                      <div className="flex items-center gap-1">
                        {block.type === 'paragraph' && (
                          <>
                            <button
                              type="button"
                              onClick={() => applyInlineFormat(block.id, block.text || '', 'bold')}
                              title="Insert bold text"
                              className="rounded p-1 text-[#475569] hover:bg-white hover:text-[#1438B8]"
                            >
                              <Bold className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => applyInlineFormat(block.id, block.text || '', 'italic')}
                              title="Insert italic text"
                              className="rounded p-1 text-[#475569] hover:bg-white hover:text-[#1438B8]"
                            >
                              <Italic className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => applyInlineFormat(block.id, block.text || '', 'link')}
                              title="Insert link"
                              className="rounded p-1 text-[#475569] hover:bg-white hover:text-[#1438B8]"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => moveBlock(index, -1)}
                          disabled={index === 0}
                          className="rounded p-1 text-[#475569] hover:bg-white disabled:opacity-30"
                          aria-label="Move block up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(index, 1)}
                          disabled={index === editing.blocks.length - 1}
                          className="rounded p-1 text-[#475569] hover:bg-white disabled:opacity-30"
                          aria-label="Move block down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlock(block.id)}
                          className="rounded p-1 text-[#DC2626] hover:bg-red-50"
                          aria-label="Remove block"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {block.type === 'heading' && (
                      <div className="flex items-center gap-2">
                        <select
                          value={block.level || 2}
                          onChange={(e) =>
                            updateBlock(block.id, { level: Number(e.target.value) as 1 | 2 | 3 })
                          }
                          className="rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 text-xs font-semibold text-[#0D1F4E]"
                        >
                          <option value={1}>H1</option>
                          <option value={2}>H2</option>
                          <option value={3}>H3</option>
                        </select>
                        <input
                          type="text"
                          value={block.text || ''}
                          onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                          placeholder="Enter heading text..."
                          className="flex-1 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold focus:border-[#1438B8] focus:outline-none"
                        />
                      </div>
                    )}

                    {block.type === 'paragraph' && (
                      <textarea
                        rows={3}
                        value={block.text || ''}
                        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                        placeholder="Write paragraph content (supports **bold**, *italic*, [label](url))..."
                        className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                      />
                    )}

                    {block.type === 'list' && (
                      <div className="space-y-2">
                        {(block.items || ['']).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item}
                              onChange={(e) => {
                                const nextItems = [...(block.items || [])];
                                nextItems[idx] = e.target.value;
                                updateBlock(block.id, { items: nextItems });
                              }}
                              placeholder={`List item ${idx + 1}`}
                              className="flex-1 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm focus:border-[#1438B8] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nextItems = (block.items || []).filter((_, i) => i !== idx);
                                updateBlock(block.id, { items: nextItems.length ? nextItems : [''] });
                              }}
                              className="text-xs text-[#DC2626] hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateBlock(block.id, { items: [...(block.items || []), ''] })}
                          className="text-xs font-medium text-[#1438B8] hover:underline"
                        >
                          + Add list item
                        </button>
                      </div>
                    )}

                    {block.type === 'image' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={block.imageUrl || ''}
                          onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                          placeholder="Image URL (from Media Library)"
                          className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={block.imageAlt || ''}
                          onChange={(e) => updateBlock(block.id, { imageAlt: e.target.value })}
                          placeholder="Descriptive alt text (required for SEO)"
                          className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={block.caption || ''}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          placeholder="Optional caption"
                          className="sm:col-span-2 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                      </div>
                    )}

                    {block.type === 'cta' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={block.ctaHeading || ''}
                          onChange={(e) => updateBlock(block.id, { ctaHeading: e.target.value })}
                          placeholder="CTA Heading"
                          className="sm:col-span-2 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-medium focus:border-[#1438B8] focus:outline-none"
                        />
                        <textarea
                          rows={2}
                          value={block.ctaBody || ''}
                          onChange={(e) => updateBlock(block.id, { ctaBody: e.target.value })}
                          placeholder="Supporting CTA text"
                          className="sm:col-span-2 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={block.ctaButtonText || ''}
                          onChange={(e) => updateBlock(block.id, { ctaButtonText: e.target.value })}
                          placeholder="Button label"
                          className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={block.ctaButtonUrl || ''}
                          onChange={(e) => updateBlock(block.id, { ctaButtonUrl: e.target.value })}
                          placeholder="Button destination URL (/contact)"
                          className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Page SEO Panel */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#0D1F4E]">Page SEO Metadata</h3>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#334155]">Meta Title</label>
                  <span className="font-mono text-[11px] text-[#64748B]">
                    {(editing.seo.metaTitle || '').length}/60
                  </span>
                </div>
                <input
                  type="text"
                  value={editing.seo.metaTitle || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, seo: { ...editing.seo, metaTitle: e.target.value } })
                  }
                  placeholder="Page Title | RYZITE"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#334155]">Meta Description</label>
                  <span className="font-mono text-[11px] text-[#64748B]">
                    {(editing.seo.metaDescription || '').length}/160
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={editing.seo.metaDescription || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      seo: { ...editing.seo, metaDescription: e.target.value },
                    })
                  }
                  placeholder="Concise summary for search engines..."
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">Canonical URL</label>
                <input
                  type="text"
                  value={editing.seo.canonicalUrl || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      seo: { ...editing.seo, canonicalUrl: e.target.value },
                    })
                  }
                  placeholder="https://ryzite.com/..."
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-xs focus:border-[#1438B8] focus:outline-none"
                />
              </div>

              {/* Live SERP Preview */}
              <div className="pt-3 border-t border-[#E2E8F0]">
                <p className="text-xs font-medium text-[#64748B] mb-2">Search Result Preview</p>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] p-3 space-y-1">
                  <div className="text-[11px] font-mono text-[#475569] truncate">
                    https://ryzite.com{editing.slug.startsWith('/') ? editing.slug : `/${editing.slug}`}
                  </div>
                  <div className="text-sm font-medium text-[#1438B8] truncate">
                    {editing.seo.metaTitle || editing.title || 'Untitled Page | RYZITE'}
                  </div>
                  <p className="text-xs text-[#475569] line-clamp-2">
                    {editing.seo.metaDescription || 'Add a meta description to preview how this page appears in search listings.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Page Preview Modal */}
        {previewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1F4E]/60 p-4">
            <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-[#DDE5F0] bg-white shadow-2xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#0D1F4E]">
                    Live Page Preview · {previewing.slug}
                  </h3>
                  <p className="text-xs text-[#64748B]">Rendered structured blocks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewing(null)}
                  className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F4F7FC]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-8 space-y-5">
                {previewing.blocks.map((b) => {
                  if (b.type === 'heading') {
                    if (b.level === 1)
                      return <h1 key={b.id} className="text-3xl font-bold text-[#0D1F4E]">{b.text}</h1>;
                    if (b.level === 2)
                      return <h2 key={b.id} className="text-xl font-bold text-[#0D1F4E] pt-2">{b.text}</h2>;
                    return <h3 key={b.id} className="text-lg font-semibold text-[#1E293B]">{b.text}</h3>;
                  }
                  if (b.type === 'paragraph') {
                    return (
                      <p key={b.id} className="text-base leading-relaxed text-[#334155]">
                        {renderFormattedText(b.text || '')}
                      </p>
                    );
                  }
                  if (b.type === 'list') {
                    return (
                      <ul key={b.id} className="list-disc pl-6 space-y-1.5 text-sm text-[#334155]">
                        {(b.items || []).filter(Boolean).map((it, idx) => (
                          <li key={idx}>{it}</li>
                        ))}
                      </ul>
                    );
                  }
                  if (b.type === 'image' && b.imageUrl) {
                    return (
                      <figure key={b.id} className="space-y-1.5">
                        <img
                          src={b.imageUrl}
                          alt={b.imageAlt || ''}
                          className="w-full max-h-80 object-cover rounded-lg border border-[#E2E8F0]"
                        />
                        {b.caption && <figcaption className="text-xs text-[#64748B]">{b.caption}</figcaption>}
                      </figure>
                    );
                  }
                  if (b.type === 'cta') {
                    return (
                      <div key={b.id} className="rounded-xl bg-[#0D1F4E] p-6 text-white">
                        <h3 className="text-lg font-bold">{b.ctaHeading}</h3>
                        <p className="mt-1.5 text-sm text-[#CBD9F2]">{b.ctaBody}</p>
                        {b.ctaButtonText && (
                          <span className="mt-4 inline-block rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white">
                            {b.ctaButtonText}
                          </span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
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
          <h2 className="text-xl font-bold text-[#0D1F4E]">Website Pages</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Manage structured page content blocks, heading hierarchy, and publishing workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(createEmptyPage())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Website Page
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages by title or slug..."
            className="w-full rounded-lg border border-[#DDE5F0] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#1438B8] focus:outline-none"
          />
        </div>
        <div className="inline-flex items-center rounded-lg border border-[#DDE5F0] bg-white p-1">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-[#1438B8] text-white' : 'text-[#475569] hover:text-[#0D1F4E]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Pages Table */}
      <div className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFD] text-xs font-semibold text-[#475569]">
                <th className="px-6 py-3.5">Page Title</th>
                <th className="px-4 py-3.5">URL Slug</th>
                <th className="px-4 py-3.5">Blocks</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Last Updated</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    Loading website pages...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    No pages match your current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((page) => (
                  <tr key={page.id} className="hover:bg-[#F8FAFD]">
                    <td className="px-6 py-3.5 font-semibold text-[#0F172A]">{page.title}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-[#475569]">{page.slug}</td>
                    <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-[#475569]">
                      {(page.blocks || []).length}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusText status={page.status} />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#64748B]">
                      <div className="font-mono tabular-nums">{formatDateTime(page.updatedAt)}</div>
                      <div className="text-[11px]">by {page.updatedBy || 'admin'}</div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(page)}
                          className="rounded-md border border-[#DDE5F0] px-2.5 py-1 text-xs font-medium text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                        >
                          {page.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(page)}
                          className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                          aria-label={`Edit ${page.title}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(page)}
                          className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
                          aria-label={`Delete ${page.title}`}
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
        title="Delete Website Page"
        description={`Are you sure you want to permanently delete "${deleteTarget?.title}" (${deleteTarget?.slug})? This action is logged and cannot be undone.`}
        confirmLabel="Delete Page"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
