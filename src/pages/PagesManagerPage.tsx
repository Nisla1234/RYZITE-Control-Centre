import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  History,
  Image as ImageIcon,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  ContentRevision,
  PageBlock,
  PageBlockType,
  SeoAuditResult,
  SeoIssue,
  WebsitePage,
} from '../types/cms';
import { SeoFieldsPanel } from '../components/ui/SeoFieldsPanel';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import { PageBlockRenderer } from '../components/public/PageBlockRenderer';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const BLOCK_CATALOG: { type: PageBlockType; label: string; desc: string }[] = [
  { type: 'hero', label: 'Hero Banner', desc: 'Eyebrow, H1 headline, subtitle, CTAs & image' },
  { type: 'heading', label: 'Heading', desc: 'H1, H2, or H3 section heading' },
  { type: 'paragraph', label: 'Paragraph', desc: 'Rich text supporting **bold**, *italic*, [links](url)' },
  { type: 'list', label: 'Checklist / Bullets', desc: 'Structured feature or benefit list' },
  { type: 'image', label: 'Image / Illustration', desc: 'Linked from Media Library with alt & caption' },
  { type: 'cards', label: 'Feature Cards', desc: '3-column cards with titles, text & links' },
  { type: 'stats', label: 'Stats / Metrics', desc: 'Key numerical proof points' },
  { type: 'faq', label: 'FAQ Accordion', desc: 'Expandable questions & answers' },
  { type: 'contact', label: 'Contact Details', desc: 'Email, phone & office location block' },
  { type: 'cta', label: 'Call-to-Action', desc: 'High-contrast conversion banner' },
];

function createBlock(type: PageBlockType): PageBlock {
  const id = `blk-${Math.random().toString(36).slice(2, 9)}`;
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        visible: true,
        eyebrow: 'RYZITE',
        text: 'Hero Headline',
        subtitle: 'Add a clear value proposition describing what RYZITE delivers.',
        primaryButtonText: 'Get Started',
        primaryButtonUrl: '/contact',
        secondaryButtonText: 'Learn More',
        secondaryButtonUrl: '/about',
        imageUrl: '',
        imageAlt: '',
      };
    case 'heading':
      return { id, type, visible: true, level: 2, text: 'Section Heading' };
    case 'paragraph':
      return { id, type, visible: true, text: 'Enter paragraph copy here.' };
    case 'list':
      return { id, type, visible: true, items: ['Key capability one', 'Key capability two'] };
    case 'image':
      return { id, type, visible: true, imageUrl: '', imageAlt: '', caption: '' };
    case 'cards':
      return {
        id,
        type,
        visible: true,
        text: 'Core Capabilities',
        subtitle: '',
        cards: [
          { title: 'Capability One', description: 'Concise description of this capability.', linkText: 'Explore', linkUrl: '/services' },
          { title: 'Capability Two', description: 'Concise description of this capability.', linkText: 'Explore', linkUrl: '/solutions' },
        ],
      };
    case 'stats':
      return {
        id,
        type,
        visible: true,
        text: 'Key Metrics',
        stats: [
          { value: '99.9%', label: 'Uptime SLA', note: 'Production reliability' },
          { value: '50+', label: 'Deliveries', note: 'Enterprise projects' },
          { value: '24/7', label: 'Monitoring', note: 'Proactive support' },
        ],
      };
    case 'faq':
      return {
        id,
        type,
        visible: true,
        text: 'Frequently Asked Questions',
        faqs: [
          { question: 'How does RYZITE scope enterprise engagements?', answer: 'We begin with an architecture discovery sprint and clear delivery milestones.' },
        ],
      };
    case 'contact':
      return {
        id,
        type,
        visible: true,
        text: 'Contact RYZITE',
        subtitle: 'Reach our engineering leadership directly.',
        contactEmail: 'info@ryzite.lk',
        contactPhone: '+94 11 000 0000',
        contactAddress: 'Colombo, Sri Lanka',
      };
    case 'cta':
      return {
        id,
        type,
        visible: true,
        ctaHeading: 'Ready to start your next platform release?',
        ctaBody: 'Speak with our engineering team to scope architecture and timelines.',
        ctaButtonText: 'Schedule a Briefing',
        ctaButtonUrl: '/contact',
      };
  }
}

function emptyPage(): WebsitePage {
  return {
    id: `page-${Math.random().toString(36).slice(2, 8)}`,
    title: 'New Page',
    slug: '/new-page',
    status: 'draft',
    blocks: [createBlock('hero')],
    seo: {
      metaTitle: '',
      metaDescription: '',
      canonicalUrl: 'https://ryzite.lk/new-page',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      noIndex: false,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: '',
    publishedAt: null,
  };
}

export function PagesManagerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [seoIssues, setSeoIssues] = useState<SeoIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<WebsitePage | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'content' | 'seo' | 'preview' | 'revisions'>('content');
  const [highlightField, setHighlightField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<ContentRevision[]>([]);
  const [loadingRevs, setLoadingRevs] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ blockId: string; cardIdx?: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebsitePage | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPagesAndSeo = async () => {
    setLoading(true);
    try {
      const [pagesRes, seoRes] = await Promise.all([
        apiFetch<{ items: WebsitePage[] }>('/api/content/page'),
        apiFetch<SeoAuditResult>('/api/seo/audit').catch(() => null),
      ]);
      setPages(pagesRes.items);
      if (seoRes) setSeoIssues(seoRes.issues.filter((i) => i.entityType === 'page'));
      return pagesRes.items;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Failed to load pages.' });
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPagesAndSeo().then((loaded) => {
      const parts = location.pathname.replace(/^\/admin\/pages\/?/, '').split('/').filter(Boolean);
      const targetId = parts[0];
      if (targetId && loaded.length > 0) {
        const found = loaded.find(
          (p) =>
            p.id === targetId ||
            p.slug.replace(/^\//, '') === targetId ||
            (targetId === 'home' && p.slug === '/')
        );
        if (found) {
          setEditing(found);
          setIsNew(false);
          setDirty(false);
          const qTab = searchParams.get('tab');
          const qField = searchParams.get('field');
          if (qTab === 'seo' || qTab === 'content' || qTab === 'preview' || qTab === 'revisions') {
            setTab(qTab);
          }
          setHighlightField(qField);
        }
      }
    });
  }, [location.pathname, searchParams]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const loadRevisions = async (pageId: string) => {
    setLoadingRevs(true);
    try {
      const res = await apiFetch<{ items: ContentRevision[] }>(
        `/api/content/page/${pageId}/revisions`
      );
      setRevisions(res.items);
    } catch {
      setRevisions([]);
    } finally {
      setLoadingRevs(false);
    }
  };

  useEffect(() => {
    if (editing && !isNew && tab === 'revisions') {
      loadRevisions(editing.id);
    }
  }, [editing?.id, isNew, tab]);

  const openEditor = (page: WebsitePage, initialTab: 'content' | 'seo' = 'content', field?: string) => {
    setEditing(JSON.parse(JSON.stringify(page)));
    setIsNew(false);
    setDirty(false);
    setTab(initialTab);
    setHighlightField(field || null);
    setNotice(null);
    navigate(`/admin/pages/${page.id}${initialTab === 'seo' ? `?tab=seo${field ? `&field=${field}` : ''}` : ''}`, {
      replace: true,
    });
  };

  const closeEditor = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them and return to the pages list?')) {
      return;
    }
    setEditing(null);
    setIsNew(false);
    setDirty(false);
    setHighlightField(null);
    setSearchParams({});
    navigate('/admin/pages', { replace: true });
  };

  const updateEditing = (updater: (prev: WebsitePage) => WebsitePage) => {
    setEditing((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  };

  const handleSave = async (targetStatus: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setNotice({ type: 'error', text: 'Page title is required.' });
      return;
    }
    const cleanSlug = editing.slug.trim().startsWith('/')
      ? editing.slug.trim()
      : `/${editing.slug.trim()}`;

    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        ...editing,
        slug: cleanSlug,
        status: targetStatus,
      };
      const res = isNew
        ? await apiFetch<{ item: WebsitePage }>('/api/content/page', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ item: WebsitePage }>(`/api/content/page/${editing.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });

      setEditing(res.item);
      setIsNew(false);
      setDirty(false);
      await loadPagesAndSeo();
      setNotice({
        type: 'success',
        text:
          targetStatus === 'published'
            ? `Published "${res.item.title}" to the live RYZITE website.`
            : `Saved draft for "${res.item.title}". Live website content remains unchanged until you Publish.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreRevision = async (revId: string, publish: boolean) => {
    if (!editing) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: WebsitePage }>(
        `/api/content/page/${editing.id}/revisions/${revId}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ publish }),
        }
      );
      setEditing(res.item);
      setDirty(false);
      await loadPagesAndSeo();
      await loadRevisions(editing.id);
      setNotice({
        type: 'success',
        text: publish
          ? 'Revision restored and published live.'
          : 'Revision restored as draft. Review and click Publish when ready.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Restore failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePage = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/content/page/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      if (editing?.id === deleteTarget.id) {
        setEditing(null);
        setDirty(false);
      }
      await loadPagesAndSeo();
      setNotice({ type: 'success', text: `Deleted page "${deleteTarget.title}".` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Delete failed.' });
    }
  };

  // Block operations
  const updateBlock = (blockId: string, patch: Partial<PageBlock>) => {
    updateEditing((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  };

  const addBlock = (type: PageBlockType) => {
    updateEditing((prev) => ({ ...prev, blocks: [...prev.blocks, createBlock(type)] }));
  };

  const moveBlock = (index: number, delta: number) => {
    updateEditing((prev) => {
      const next = [...prev.blocks];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, blocks: next };
    });
  };

  const duplicateBlock = (index: number) => {
    updateEditing((prev) => {
      const copy = JSON.parse(JSON.stringify(prev.blocks[index])) as PageBlock;
      copy.id = `blk-${Math.random().toString(36).slice(2, 9)}`;
      const next = [...prev.blocks];
      next.splice(index + 1, 0, copy);
      return { ...prev, blocks: next };
    });
  };

  const removeBlock = (blockId: string) => {
    if (!window.confirm('Remove this section from the page?')) return;
    updateEditing((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== blockId),
    }));
  };

  const handleDropBlock = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    updateEditing((prev) => {
      const next = [...prev.blocks];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return { ...prev, blocks: next };
    });
    setDragIdx(null);
  };

  // ============================================================
  // EDITOR VIEW
  // ============================================================
  if (editing) {
    const pageIssues = seoIssues.filter((i) => i.entityId === editing.id);
    const activeFieldIssue = highlightField
      ? pageIssues.find((i) => i.field === highlightField)?.message || null
      : null;

    return (
      <div className="space-y-5">
        {/* Top Editor Toolbar */}
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={closeEditor}
              className="p-2 rounded-lg border border-[#DDE5F0] hover:bg-[#F4F7FC] text-[#334155]"
              title="Back to Website Pages"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-[#0F172A] truncate">
                  {editing.title || 'Untitled Page'}
                </h1>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    editing.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {editing.status === 'published' ? 'Published' : 'Draft'}
                </span>
                {editing.hasUnpublishedChanges && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1438B8] border border-blue-200">
                    Unpublished Draft Edits
                  </span>
                )}
                {dirty && (
                  <span className="text-[11px] font-semibold text-amber-700">● Unsaved</span>
                )}
              </div>
              <p className="text-xs text-[#64748B] truncate">
                Slug: <span className="font-mono">{editing.slug}</span>
                {editing.publishedAt
                  ? ` · Live published ${new Date(editing.publishedAt).toLocaleString()}`
                  : ' · Not yet published live'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editing.publishedAt && (
              <a
                href={editing.slug === '/' ? '/' : editing.slug}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-3 py-2 text-xs font-semibold text-[#334155]"
              >
                <Globe className="w-3.5 h-3.5 text-[#1438B8]" /> View Live
              </a>
            )}
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-3.5 py-2 text-xs font-semibold text-[#334155] disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {saving ? 'Publishing...' : 'Publish Live'}
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
              notice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Page Identity Row */}
        <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">Page Title</label>
            <input
              type="text"
              value={editing.title}
              onChange={(e) => updateEditing((p) => ({ ...p, title: e.target.value }))}
              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">
              URL Slug (e.g. <code>/</code>, <code>/about</code>, <code>/contact</code>)
            </label>
            <input
              type="text"
              value={editing.slug}
              onChange={(e) => updateEditing((p) => ({ ...p, slug: e.target.value }))}
              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1438B8]/25 focus:border-[#1438B8]"
            />
          </div>
        </div>

        {/* Editor Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DDE5F0]">
          {(
            [
              ['content', 'Content Sections', Layers],
              ['seo', `SEO & Metadata${pageIssues.length ? ` (${pageIssues.length})` : ''}`, Globe],
              ['preview', 'Live Preview', Eye],
              ['revisions', 'Revision History', History],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#1438B8] text-[#1438B8]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: CONTENT SECTIONS */}
        {tab === 'content' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-9 space-y-4">
              {editing.blocks.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-[#CBD8EC] p-10 text-center">
                  <p className="text-sm font-semibold text-[#0F172A]">No sections yet</p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Add a Hero, Heading, Paragraph, Image, Cards, Stats, FAQ, or CTA section from the right panel.
                  </p>
                </div>
              ) : (
                editing.blocks.map((block, idx) => {
                  const isHidden = block.visible === false;
                  return (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropBlock(idx)}
                      className={`bg-white rounded-xl border transition-all ${
                        isHidden
                          ? 'border-dashed border-[#CBD5E1] opacity-70'
                          : 'border-[#DDE5F0]'
                      }`}
                    >
                      {/* Block Header */}
                      <div className="px-4 py-2.5 bg-[#F8FAFD] border-b border-[#E5ECF6] rounded-t-xl flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-[#94A3B8] cursor-grab" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#1438B8] bg-[#EEF3FC] px-2 py-0.5 rounded">
                            {block.type}
                          </span>
                          {isHidden && (
                            <span className="text-[10px] font-semibold uppercase text-[#64748B]">
                              Hidden on Live Site
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveBlock(idx, -1)}
                            disabled={idx === 0}
                            title="Move up"
                            className="p-1 rounded hover:bg-[#E5ECF6] text-[#475569] disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(idx, 1)}
                            disabled={idx === editing.blocks.length - 1}
                            title="Move down"
                            className="p-1 rounded hover:bg-[#E5ECF6] text-[#475569] disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateBlock(idx)}
                            title="Duplicate section"
                            className="p-1 rounded hover:bg-[#E5ECF6] text-[#475569]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateBlock(block.id, { visible: isHidden ? true : false })
                            }
                            title={isHidden ? 'Show section' : 'Hide section'}
                            className="p-1 rounded hover:bg-[#E5ECF6] text-[#475569]"
                          >
                            {isHidden ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(block.id)}
                            title="Delete section"
                            className="p-1 rounded hover:bg-red-50 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Block Editor Body */}
                      <div className="p-4 space-y-3">
                        {block.type === 'hero' && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                                  Eyebrow Label
                                </label>
                                <input
                                  type="text"
                                  value={block.eyebrow || ''}
                                  onChange={(e) => updateBlock(block.id, { eyebrow: e.target.value })}
                                  className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                                  Hero Image (Optional)
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={block.imageUrl || ''}
                                    onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                                    placeholder="Choose from Media Library"
                                    className="flex-1 rounded-lg border border-[#D4DFEE] px-2.5 py-1.5 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setPickerTarget({ blockId: block.id })}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[#1438B8] text-[#1438B8] hover:bg-[#EEF3FC] px-2.5 py-1.5 text-xs font-semibold"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5" /> Pick
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                                H1 Headline
                              </label>
                              <input
                                type="text"
                                value={block.text || ''}
                                onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                                className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm font-semibold"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                                Subtitle
                              </label>
                              <textarea
                                rows={2}
                                value={block.subtitle || ''}
                                onChange={(e) => updateBlock(block.id, { subtitle: e.target.value })}
                                className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-xs"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={block.primaryButtonText || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { primaryButtonText: e.target.value })
                                }
                                placeholder="Primary CTA Label"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.primaryButtonUrl || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { primaryButtonUrl: e.target.value })
                                }
                                placeholder="Primary CTA URL (e.g. /services)"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs font-mono"
                              />
                              <input
                                type="text"
                                value={block.secondaryButtonText || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { secondaryButtonText: e.target.value })
                                }
                                placeholder="Secondary CTA Label"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.secondaryButtonUrl || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { secondaryButtonUrl: e.target.value })
                                }
                                placeholder="Secondary CTA URL (e.g. /contact)"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs font-mono"
                              />
                            </div>
                          </>
                        )}

                        {block.type === 'heading' && (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={block.level || 2}
                              onChange={(e) =>
                                updateBlock(block.id, {
                                  level: Number(e.target.value) as 1 | 2 | 3,
                                })
                              }
                              className="rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-2 text-xs font-semibold"
                            >
                              <option value={1}>H1</option>
                              <option value={2}>H2</option>
                              <option value={3}>H3</option>
                            </select>
                            <input
                              type="text"
                              value={block.text || ''}
                              onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                              className="flex-1 min-w-[200px] rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm font-semibold"
                            />
                          </div>
                        )}

                        {block.type === 'paragraph' && (
                          <textarea
                            rows={3}
                            value={block.text || ''}
                            onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                            placeholder="Write paragraph text (**bold**, *italic*, [Link](/about))"
                            className="w-full rounded-lg border border-[#D4DFEE] px-3 py-2 text-sm"
                          />
                        )}

                        {block.type === 'list' && (
                          <div className="space-y-2">
                            {(block.items || []).map((item, i) => (
                              <div key={i} className="flex gap-2">
                                <input
                                  type="text"
                                  value={item}
                                  onChange={(e) => {
                                    const next = [...(block.items || [])];
                                    next[i] = e.target.value;
                                    updateBlock(block.id, { items: next });
                                  }}
                                  className="flex-1 rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlock(block.id, {
                                      items: (block.items || []).filter((_, idx2) => idx2 !== i),
                                    })
                                  }
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, { items: [...(block.items || []), ''] })
                              }
                              className="text-xs font-semibold text-[#1438B8] hover:underline"
                            >
                              + Add list item
                            </button>
                          </div>
                        )}

                        {block.type === 'image' && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <input
                                type="text"
                                value={block.imageUrl || ''}
                                onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                                placeholder="Image URL or select from Media Library"
                                className="flex-1 min-w-[200px] rounded-lg border border-[#D4DFEE] px-3 py-2 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setPickerTarget({ blockId: block.id })}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-3 py-2 text-xs font-semibold transition-colors"
                              >
                                <ImageIcon className="w-3.5 h-3.5" /> Choose Media
                              </button>
                            </div>
                            {block.imageUrl && (
                              <img
                                src={block.imageUrl}
                                alt={block.imageAlt || ''}
                                className="h-36 rounded-lg border border-[#DDE5F0] object-cover"
                              />
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={block.imageAlt || ''}
                                onChange={(e) => updateBlock(block.id, { imageAlt: e.target.value })}
                                placeholder="Alt text (required for SEO & accessibility)"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.caption || ''}
                                onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                                placeholder="Optional caption"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {block.type === 'cards' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={block.text || ''}
                              onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                              placeholder="Section heading"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-sm font-semibold"
                            />
                            <div className="space-y-2.5">
                              {(block.cards || []).map((c, ci) => (
                                <div
                                  key={ci}
                                  className="rounded-lg border border-[#E5ECF6] bg-[#F8FAFD] p-3 space-y-2"
                                >
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={c.title}
                                      onChange={(e) => {
                                        const cards = [...(block.cards || [])];
                                        cards[ci] = { ...cards[ci], title: e.target.value };
                                        updateBlock(block.id, { cards });
                                      }}
                                      placeholder="Card title"
                                      className="flex-1 rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1.5 text-xs font-semibold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPickerTarget({ blockId: block.id, cardIdx: ci })
                                      }
                                      className="rounded-lg border border-[#1438B8] text-[#1438B8] px-2 py-1 text-[11px] font-semibold"
                                    >
                                      Image
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateBlock(block.id, {
                                          cards: (block.cards || []).filter((_, k) => k !== ci),
                                        })
                                      }
                                      className="text-red-600 p-1"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={c.description}
                                    onChange={(e) => {
                                      const cards = [...(block.cards || [])];
                                      cards[ci] = { ...cards[ci], description: e.target.value };
                                      updateBlock(block.id, { cards });
                                    }}
                                    placeholder="Card description"
                                    className="w-full rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1.5 text-xs"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      value={c.linkText || ''}
                                      onChange={(e) => {
                                        const cards = [...(block.cards || [])];
                                        cards[ci] = { ...cards[ci], linkText: e.target.value };
                                        updateBlock(block.id, { cards });
                                      }}
                                      placeholder="Link label"
                                      className="rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1 text-xs"
                                    />
                                    <input
                                      type="text"
                                      value={c.linkUrl || ''}
                                      onChange={(e) => {
                                        const cards = [...(block.cards || [])];
                                        cards[ci] = { ...cards[ci], linkUrl: e.target.value };
                                        updateBlock(block.id, { cards });
                                      }}
                                      placeholder="Link URL"
                                      className="rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1 text-xs font-mono"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, {
                                  cards: [
                                    ...(block.cards || []),
                                    { title: 'New Card', description: '', linkText: 'Learn more', linkUrl: '/' },
                                  ],
                                })
                              }
                              className="text-xs font-semibold text-[#1438B8] hover:underline"
                            >
                              + Add Card
                            </button>
                          </div>
                        )}

                        {block.type === 'stats' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={block.text || ''}
                              onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                              placeholder="Stats heading"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-sm font-semibold"
                            />
                            {(block.stats || []).map((st, si) => (
                              <div key={si} className="grid grid-cols-12 gap-2 items-center">
                                <input
                                  type="text"
                                  value={st.value}
                                  onChange={(e) => {
                                    const stats = [...(block.stats || [])];
                                    stats[si] = { ...stats[si], value: e.target.value };
                                    updateBlock(block.id, { stats });
                                  }}
                                  placeholder="99.9%"
                                  className="col-span-3 rounded-lg border border-[#D4DFEE] px-2.5 py-1.5 text-xs font-bold"
                                />
                                <input
                                  type="text"
                                  value={st.label}
                                  onChange={(e) => {
                                    const stats = [...(block.stats || [])];
                                    stats[si] = { ...stats[si], label: e.target.value };
                                    updateBlock(block.id, { stats });
                                  }}
                                  placeholder="Metric label"
                                  className="col-span-4 rounded-lg border border-[#D4DFEE] px-2.5 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  value={st.note || ''}
                                  onChange={(e) => {
                                    const stats = [...(block.stats || [])];
                                    stats[si] = { ...stats[si], note: e.target.value };
                                    updateBlock(block.id, { stats });
                                  }}
                                  placeholder="Sub-note"
                                  className="col-span-4 rounded-lg border border-[#D4DFEE] px-2.5 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlock(block.id, {
                                      stats: (block.stats || []).filter((_, k) => k !== si),
                                    })
                                  }
                                  className="col-span-1 text-red-600 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, {
                                  stats: [...(block.stats || []), { value: '100%', label: 'Metric', note: '' }],
                                })
                              }
                              className="text-xs font-semibold text-[#1438B8] hover:underline"
                            >
                              + Add Stat
                            </button>
                          </div>
                        )}

                        {block.type === 'faq' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={block.text || ''}
                              onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                              placeholder="FAQ heading"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-sm font-semibold"
                            />
                            {(block.faqs || []).map((f, fi) => (
                              <div key={fi} className="rounded-lg border border-[#E5ECF6] bg-[#F8FAFD] p-3 space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={f.question}
                                    onChange={(e) => {
                                      const faqs = [...(block.faqs || [])];
                                      faqs[fi] = { ...faqs[fi], question: e.target.value };
                                      updateBlock(block.id, { faqs });
                                    }}
                                    placeholder="Question"
                                    className="flex-1 rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1.5 text-xs font-semibold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateBlock(block.id, {
                                        faqs: (block.faqs || []).filter((_, k) => k !== fi),
                                      })
                                    }
                                    className="text-red-600 p-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  value={f.answer}
                                  onChange={(e) => {
                                    const faqs = [...(block.faqs || [])];
                                    faqs[fi] = { ...faqs[fi], answer: e.target.value };
                                    updateBlock(block.id, { faqs });
                                  }}
                                  placeholder="Answer"
                                  className="w-full rounded-lg border border-[#D4DFEE] bg-white px-2.5 py-1.5 text-xs"
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateBlock(block.id, {
                                  faqs: [...(block.faqs || []), { question: '', answer: '' }],
                                })
                              }
                              className="text-xs font-semibold text-[#1438B8] hover:underline"
                            >
                              + Add FAQ Item
                            </button>
                          </div>
                        )}

                        {block.type === 'contact' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={block.text || ''}
                              onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                              placeholder="Contact section heading"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-sm font-semibold"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              <input
                                type="email"
                                value={block.contactEmail || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { contactEmail: e.target.value })
                                }
                                placeholder="info@ryzite.lk"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.contactPhone || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { contactPhone: e.target.value })
                                }
                                placeholder="+94 ..."
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.contactAddress || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { contactAddress: e.target.value })
                                }
                                placeholder="Office address"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {block.type === 'cta' && (
                          <div className="space-y-2.5">
                            <input
                              type="text"
                              value={block.ctaHeading || ''}
                              onChange={(e) => updateBlock(block.id, { ctaHeading: e.target.value })}
                              placeholder="CTA Heading"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-sm font-semibold"
                            />
                            <textarea
                              rows={2}
                              value={block.ctaBody || ''}
                              onChange={(e) => updateBlock(block.id, { ctaBody: e.target.value })}
                              placeholder="CTA supporting copy"
                              className="w-full rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <input
                                type="text"
                                value={block.ctaButtonText || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { ctaButtonText: e.target.value })
                                }
                                placeholder="Button label"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={block.ctaButtonUrl || ''}
                                onChange={(e) =>
                                  updateBlock(block.id, { ctaButtonUrl: e.target.value })
                                }
                                placeholder="Button URL (e.g. /contact)"
                                className="rounded-lg border border-[#D4DFEE] px-3 py-1.5 text-xs font-mono"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Sidebar: Add Sections */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl border border-[#DDE5F0] p-4 sticky top-24 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569]">
                  Add Section Block
                </h3>
                <div className="space-y-1.5">
                  {BLOCK_CATALOG.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => addBlock(b.type)}
                      className="w-full text-left rounded-lg border border-[#E5ECF6] hover:border-[#1438B8] hover:bg-[#F8FAFD] px-3 py-2 transition-colors"
                    >
                      <p className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-[#1438B8]" /> {b.label}
                      </p>
                      <p className="text-[10px] text-[#64748B] mt-0.5">{b.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SEO & METADATA */}
        {tab === 'seo' && (
          <div className="bg-white rounded-xl border border-[#DDE5F0] p-6 max-w-3xl">
            <SeoFieldsPanel
              seo={editing.seo}
              slug={editing.slug}
              highlightField={highlightField}
              activeIssueMessage={activeFieldIssue}
              onChange={(nextSeo) => updateEditing((p) => ({ ...p, seo: nextSeo }))}
            />
          </div>
        )}

        {/* TAB 3: LIVE PREVIEW */}
        {tab === 'preview' && (
          <div className="bg-[#F4F7FC] rounded-2xl border border-[#DDE5F0] p-6 sm:p-10">
            <div className="max-w-5xl mx-auto">
              <div className="mb-6 flex items-center justify-between text-xs text-[#64748B] border-b border-[#DDE5F0] pb-3">
                <span>
                  Live Preview of <strong>{editing.title}</strong> ({editing.slug})
                </span>
                <span className="font-semibold text-[#1438B8]">
                  {dirty ? 'Showing unsaved draft preview' : 'Matches saved state'}
                </span>
              </div>
              <PageBlockRenderer blocks={editing.blocks} />
            </div>
          </div>
        )}

        {/* TAB 4: REVISION HISTORY */}
        {tab === 'revisions' && (
          <div className="bg-white rounded-xl border border-[#DDE5F0] p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Revision History</h3>
              <p className="text-xs text-[#64748B]">
                Every draft save, publish, and restore creates an immutable snapshot you can roll back to.
              </p>
            </div>
            {loadingRevs ? (
              <p className="text-xs text-[#64748B] py-6">Loading revision snapshots...</p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-[#64748B] py-6">No revisions recorded for this page yet.</p>
            ) : (
              <div className="divide-y divide-[#E5ECF6] border border-[#DDE5F0] rounded-xl">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#0F172A]">
                          {rev.summary}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#EEF3FC] text-[#1438B8]">
                          {rev.action}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {new Date(rev.createdAt).toLocaleString()} · by {rev.createdBy} ·{' '}
                        {(rev.data?.blocks || []).length} section(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestoreRevision(rev.id, false)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D4DFEE] hover:bg-[#F4F7FC] px-3 py-1.5 text-xs font-semibold text-[#334155]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreRevision(rev.id, true)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-3 py-1.5 text-xs font-semibold"
                      >
                        Restore & Publish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <MediaPickerModal
          open={Boolean(pickerTarget)}
          onClose={() => setPickerTarget(null)}
          onSelect={(sel) => {
            if (!pickerTarget) return;
            if (pickerTarget.cardIdx !== undefined) {
              const targetBlock = editing.blocks.find((b) => b.id === pickerTarget.blockId);
              if (targetBlock?.cards) {
                const cards = [...targetBlock.cards];
                cards[pickerTarget.cardIdx] = {
                  ...cards[pickerTarget.cardIdx],
                  imageUrl: sel.url,
                  mediaId: sel.mediaId,
                };
                updateBlock(pickerTarget.blockId, { cards });
              }
            } else {
              updateBlock(pickerTarget.blockId, {
                mediaId: sel.mediaId,
                imageUrl: sel.url,
                imageAlt: sel.altText || undefined,
              });
            }
          }}
        />
      </div>
    );
  }

  // ============================================================
  // PAGES LIST VIEW
  // ============================================================
  const filteredPages = pages.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">Website Pages</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Edit sections, manage SEO metadata, save drafts safely, and publish live to the RYZITE website.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(emptyPage());
            setIsNew(true);
            setDirty(true);
            setTab('content');
            setHighlightField(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] hover:bg-[#0D1F4E] text-white px-4 py-2 text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> New Page
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#DDE5F0] overflow-hidden">
        <div className="p-4 border-b border-[#E5ECF6] flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pages by title or slug..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#D4DFEE] text-xs"
            />
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1438B8] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Live Public Website
          </a>
        </div>

        {loading ? (
          <p className="p-10 text-center text-sm text-[#64748B]">Loading website pages...</p>
        ) : filteredPages.length === 0 ? (
          <p className="p-10 text-center text-sm text-[#64748B]">No pages found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFD] border-b border-[#E5ECF6] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="py-3 px-4">Page</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">SEO Health</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2FA] text-sm">
                {filteredPages.map((p) => {
                  const pIssues = seoIssues.filter((i) => i.entityId === p.id);
                  const firstIssue = pIssues[0];
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#F8FAFD] transition-colors ${
                        pIssues.length > 0 ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#0F172A]">{p.title}</p>
                        <p className="text-xs font-mono text-[#64748B]">{p.slug}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                              p.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {p.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                          {p.hasUnpublishedChanges && (
                            <span className="text-[10px] font-semibold text-[#1438B8]">
                              Has unpublished edits
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {pIssues.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" /> {pIssues.length} issue(s)
                            </span>
                            {firstIssue && (
                              <button
                                type="button"
                                onClick={() => navigate(firstIssue.deepLink)}
                                className="text-xs font-semibold text-[#1438B8] hover:underline"
                              >
                                Fix Issue
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#64748B]">
                        {new Date(p.updatedAt).toLocaleString()}
                        <div className="text-[11px] text-[#94A3B8]">by {p.updatedBy}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditor(p, 'content')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#EEF3FC] hover:bg-[#1438B8] text-[#1438B8] hover:text-white px-3 py-1.5 text-xs font-semibold transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          {p.publishedAt && (
                            <a
                              href={p.slug === '/' ? '/' : p.slug}
                              target="_blank"
                              rel="noreferrer"
                              title="View live page"
                              className="p-1.5 rounded-lg border border-[#DDE5F0] hover:bg-[#F4F7FC] text-[#475569]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            title="Delete page"
                            className="p-1.5 rounded-lg border border-[#DDE5F0] hover:bg-red-50 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Website Page"
        description={`Are you sure you want to permanently delete "${deleteTarget?.title}" (${deleteTarget?.slug})?`}
        confirmLabel="Delete Page"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeletePage}
      />
    </div>
  );
}
