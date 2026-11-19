import React, { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, Star, CheckCircle2, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import type { TestimonialItem } from '../types/cms';

function emptyTestimonial(): TestimonialItem {
  return {
    id: '',
    quote: '',
    customerName: '',
    role: '',
    company: '',
    avatarUrl: '',
    avatarAlt: '',
    rating: 5,
    displayOrder: 1,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export function TestimonialsPage() {
  const { notify } = useAuth();
  const [items, setItems] = useState<TestimonialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TestimonialItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestimonialItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: TestimonialItem[] }>('/api/content/testimonial');
      setItems(data.items.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99)));
    } catch (err: any) {
      notify('error', err.message || 'Failed to load testimonials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (status?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.customerName.trim() || !editing.quote.trim()) {
      notify('error', 'Customer name and testimonial text are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editing, status: status || editing.status };
      if (editing.id) {
        await apiRequest(`/api/content/testimonial/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated testimonial from ${payload.customerName}.`);
      } else {
        await apiRequest('/api/content/testimonial', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Added testimonial from ${payload.customerName}.`);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/testimonial/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Deleted testimonial from ${deleteTarget.customerName}.`);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Delete failed.');
    }
  };

  if (editing) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE5F0]">
          <h2 className="text-xl font-bold text-[#0D1F4E]">
            {editing.id ? `Edit Testimonial` : 'Add Testimonial'}
          </h2>
          <div className="flex items-center gap-2">
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
              <Clock className="h-3.5 w-3.5" /> Hide / Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('published')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Publish
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Testimonial Quote *</label>
            <textarea
              rows={4}
              value={editing.quote}
              onChange={(e) => setEditing({ ...editing, quote: e.target.value })}
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Customer Name *</label>
              <input
                type="text"
                value={editing.customerName}
                onChange={(e) => setEditing({ ...editing, customerName: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Role / Title</label>
              <input
                type="text"
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Company</label>
              <input
                type="text"
                value={editing.company}
                onChange={(e) => setEditing({ ...editing, company: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Rating (1–5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={editing.rating}
                onChange={(e) => setEditing({ ...editing, rating: Math.min(5, Math.max(1, Number(e.target.value) || 5)) })}
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
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Avatar URL</label>
              <input
                type="text"
                value={editing.avatarUrl}
                onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
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
          <h2 className="text-xl font-bold text-[#0D1F4E]">Client Testimonials</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Curate verified client endorsements, ratings, and display ordering.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(emptyTestimonial())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Testimonial
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-sm text-[#64748B]">Loading testimonials...</div>
        ) : items.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-[#64748B]">No testimonials yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#DDE5F0] bg-white p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-0.5 text-[#D97706]">
                    {Array.from({ length: item.rating || 5 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                  <span className="font-mono text-xs text-[#64748B]">Order #{item.displayOrder}</span>
                </div>
                <p className="text-sm leading-relaxed text-[#1E293B]">“{item.quote}”</p>
                <div className="mt-4 text-xs">
                  <span className="font-semibold text-[#0D1F4E]">{item.customerName}</span>
                  <span className="text-[#64748B]">
                    {' '}· {item.role}
                    {item.company ? `, ${item.company}` : ''}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
                <StatusText status={item.status} />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Testimonial"
        description={`Delete testimonial from "${deleteTarget?.customerName}"?`}
        confirmLabel="Delete Testimonial"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
