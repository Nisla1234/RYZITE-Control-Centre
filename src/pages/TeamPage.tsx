import React, { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusText } from '../components/ui/StatusText';
import type { TeamMember } from '../types/cms';

function emptyMember(): TeamMember {
  return {
    id: '',
    name: '',
    jobTitle: '',
    department: 'Engineering',
    bio: '',
    avatarUrl: '',
    avatarAlt: '',
    socialLinks: { linkedin: '', github: '', twitter: '', website: '' },
    displayOrder: 1,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    updatedBy: '',
  };
}

export function TeamPage() {
  const { notify } = useAuth();
  const [items, setItems] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: TeamMember[] }>('/api/content/team');
      setItems(data.items.sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99)));
    } catch (err: any) {
      notify('error', err.message || 'Failed to load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (status?: 'draft' | 'published') => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.jobTitle.trim()) {
      notify('error', 'Name and job title are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editing, status: status || editing.status };
      if (editing.id) {
        await apiRequest(`/api/content/team/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('success', `Updated team member "${payload.name}".`);
      } else {
        await apiRequest('/api/content/team', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', `Added team member "${payload.name}".`);
      }
      setEditing(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save team member.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/content/team/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', `Removed "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      notify('error', err.message || 'Delete failed.');
    }
  };

  if (editing) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE5F0]">
          <h2 className="text-xl font-bold text-[#0D1F4E]">
            {editing.id ? `Edit Member: ${editing.name}` : 'Add Team Member'}
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
              <Clock className="h-3.5 w-3.5" /> Save Draft
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Full Name *</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Job Title *</label>
              <input
                type="text"
                value={editing.jobTitle}
                onChange={(e) => setEditing({ ...editing, jobTitle: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Department</label>
              <input
                type="text"
                value={editing.department}
                onChange={(e) => setEditing({ ...editing, department: e.target.value })}
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
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Biography</label>
            <textarea
              rows={3}
              value={editing.bio}
              onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
              className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Profile Image URL</label>
              <input
                type="text"
                value={editing.avatarUrl}
                onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                placeholder="/uploads/..."
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">Image Alt Text</label>
              <input
                type="text"
                value={editing.avatarAlt}
                onChange={(e) => setEditing({ ...editing, avatarAlt: e.target.value })}
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F0]">
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">LinkedIn URL</label>
              <input
                type="url"
                value={editing.socialLinks?.linkedin || ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    socialLinks: { ...editing.socialLinks, linkedin: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1.5">GitHub URL</label>
              <input
                type="url"
                value={editing.socialLinks?.github || ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    socialLinks: { ...editing.socialLinks, github: e.target.value },
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
          <h2 className="text-xl font-bold text-[#0D1F4E]">Team Directory</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Manage RYZITE leadership and engineering profiles displayed on the website.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(emptyMember())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1438B8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102D96] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Team Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-12 text-center text-sm text-[#64748B]">Loading team...</div>
        ) : items.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-[#64748B]">No team members yet.</div>
        ) : (
          items.map((member) => (
            <div key={member.id} className="rounded-xl border border-[#DDE5F0] bg-white p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.avatarAlt || member.name}
                        className="h-11 w-11 rounded-full object-cover border border-[#DDE5F0] shrink-0"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF3FC] text-sm font-bold text-[#1438B8]">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[#0D1F4E] truncate">{member.name}</h3>
                      <p className="text-xs text-[#475569] truncate">{member.jobTitle}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-[#64748B]">#{member.displayOrder}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#475569] line-clamp-3">{member.bio}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
                <StatusText status={member.status} />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(member)}
                    className="rounded-md p-1.5 text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                    aria-label={`Edit ${member.name}`}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(member)}
                    className="rounded-md p-1.5 text-[#DC2626] hover:bg-red-50"
                    aria-label={`Delete ${member.name}`}
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
        title="Delete Team Member"
        description={`Remove "${deleteTarget?.name}" from the team directory?`}
        confirmLabel="Delete Member"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
