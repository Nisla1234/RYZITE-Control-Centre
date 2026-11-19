import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  KeyRound,
  Database,
  BarChart3,
  ShieldCheck,
  RefreshCw,
  Upload,
  Trash2,
  Lock,
} from 'lucide-react';
import { apiRequest, formatDateTime } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusText } from '../components/ui/StatusText';
import { AdminAvatar } from '../components/ui/AdminAvatar';
import { AvatarCropModal } from '../components/ui/AvatarCropModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { AdminUser, GlobalSeoSettings, IntegrationStatus } from '../types/cms';

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export function SettingsPage() {
  const { user, setUser, notify } = useAuth();

  // Editable Administrator Profile fields
  const [username, setUsername] = useState(user?.username || '');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar upload, crop, preview, and removal states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [removeAvatarConfirmOpen, setRemoveAvatarConfirmOpen] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Change Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Integration & Session Policy states
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState(24);
  const [savingSession, setSavingSession] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user?.username, user?.name, user?.email]);

  useEffect(() => {
    return () => {
      if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    };
  }, [pendingAvatarPreview]);

  const loadStatus = async () => {
    try {
      const [statusRes, seoRes] = await Promise.all([
        apiRequest<IntegrationStatus>('/api/status'),
        apiRequest<{ settings: GlobalSeoSettings }>('/api/seo/global'),
      ]);
      setStatus(statusRes);
      if (seoRes.settings?.sessionTimeoutHours) {
        setSessionTimeoutHours(seoRes.settings.sessionTimeoutHours);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to load system status.');
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const sensitiveProfileChanged =
    username.trim().toLowerCase() !== (user?.username || '').toLowerCase() ||
    email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

  const handleSelectPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      notify('error', 'Unsupported image format. Please select a JPG, JPEG, PNG, or WebP file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      notify('error', 'Profile picture exceeds the 5 MB size limit.');
      return;
    }
    setCropSourceFile(file);
  };

  const handleApplyCrop = (croppedFile: File, previewUrl: string) => {
    if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    setPendingAvatarFile(croppedFile);
    setPendingAvatarPreview(previewUrl);
    setCropSourceFile(null);
  };

  const handleDiscardPendingAvatar = () => {
    if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
  };

  const handleRemoveSavedAvatar = async () => {
    setRemovingAvatar(true);
    try {
      const res = await apiRequest<{ user: AdminUser }>('/api/auth/avatar', {
        method: 'DELETE',
      });
      setUser(res.user);
      handleDiscardPendingAvatar();
      setRemoveAvatarConfirmOpen(false);
      notify('success', 'Profile picture removed.');
    } catch (err: any) {
      notify('error', err.message || 'Failed to remove profile picture.');
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(trimmedUsername)) {
      notify('error', 'Username must be 3–64 characters (letters, numbers, ".", "_", or "-").');
      return;
    }
    if (!trimmedName) {
      notify('error', 'Display name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      notify('error', 'Please enter a valid email address.');
      return;
    }
    if (sensitiveProfileChanged && !profileConfirmPassword) {
      notify('error', 'Please enter your current password to confirm username or email changes.');
      return;
    }

    setSavingProfile(true);
    try {
      // 1. Update text profile fields first (validates password & uniqueness before committing avatar)
      const profileRes = await apiRequest<{ user: AdminUser }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          username: trimmedUsername,
          name: trimmedName,
          email: trimmedEmail,
          ...(sensitiveProfileChanged ? { currentPassword: profileConfirmPassword } : {}),
        }),
      });
      let latestUser = profileRes.user;

      // 2. If a new cropped avatar is staged, persist it to server storage + SQLite
      if (pendingAvatarFile) {
        const formData = new FormData();
        formData.append('avatar', pendingAvatarFile);
        const avatarRes = await apiRequest<{ user: AdminUser }>('/api/auth/avatar', {
          method: 'POST',
          body: formData,
        });
        latestUser = avatarRes.user;
        handleDiscardPendingAvatar();
      }

      setUser(latestUser);
      setProfileConfirmPassword('');
      notify('success', 'Administrator profile saved successfully.');
    } catch (err: any) {
      notify('error', err.message || 'Failed to save administrator profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notify('error', 'New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 10) {
      notify('error', 'New password must be at least 10 characters.');
      return;
    }

    setSavingPassword(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('success', 'Password changed successfully.');
    } catch (err: any) {
      notify('error', err.message || 'Password update failed.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSession(true);
    try {
      await apiRequest('/api/seo/global', {
        method: 'PUT',
        body: JSON.stringify({ sessionTimeoutHours }),
      });
      notify('success', `Session timeout updated to ${sessionTimeoutHours} hours.`);
      await loadStatus();
    } catch (err: any) {
      notify('error', err.message || 'Failed to save session configuration.');
    } finally {
      setSavingSession(false);
    }
  };

  const displayedAvatarUrl = pendingAvatarPreview || user?.avatarUrl || null;
  const hasSavedAvatar = Boolean(user?.avatarUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1F4E]">System & Account Settings</h2>
          <p className="mt-0.5 text-sm text-[#475569]">
            Manage administrator identity, profile picture, credentials, session policies, and live integration health.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDE5F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC] whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-check Connections
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Editable Administrator Profile & Change Password */}
        <div className="lg:col-span-6 space-y-6">
          <form onSubmit={handleSaveProfile} className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-5">
            <h3 className="text-sm font-semibold text-[#0D1F4E] pb-3 border-b border-[#E2E8F0]">
              Administrator Profile
            </h3>

            {/* Profile Picture Upload Section */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-[#F1F5F9]">
              <AdminAvatar
                name={name || user?.name}
                username={username || user?.username}
                avatarUrl={displayedAvatarUrl}
                size="lg"
              />
              <div className="flex-1 space-y-2">
                <div>
                  <div className="text-sm font-semibold text-[#0D1F4E]">Profile Picture</div>
                  <p className="text-xs text-[#64748B]">
                    JPG, PNG, or WebP up to 5 MB. Cropped into a circular avatar and stored permanently.
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleSelectPhoto}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#1438B8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1438B8] hover:bg-[#EEF3FC]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {hasSavedAvatar || pendingAvatarPreview ? 'Replace Photo' : 'Upload Photo'}
                  </button>

                  {pendingAvatarPreview && (
                    <button
                      type="button"
                      onClick={handleDiscardPendingAvatar}
                      className="rounded-lg border border-[#DDE5F0] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F4F7FC]"
                    >
                      Cancel New Photo
                    </button>
                  )}

                  {hasSavedAvatar && !pendingAvatarPreview && (
                    <button
                      type="button"
                      onClick={() => setRemoveAvatarConfirmOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-white px-3 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove Photo
                    </button>
                  )}
                </div>

                {pendingAvatarPreview && (
                  <p className="text-xs font-medium text-[#1438B8]">
                    New photo ready — click &ldquo;Save Profile&rdquo; below to apply permanently.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-username" className="block text-xs font-semibold text-[#1E293B] mb-1">
                  Username
                </label>
                <input
                  id="profile-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 font-mono text-sm text-[#0F172A] focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1">Role</label>
                <input
                  type="text"
                  value={(user?.role || 'super_admin').replace('_', ' ')}
                  disabled
                  className="w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFD] px-3 py-2 text-sm capitalize text-[#64748B]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-name" className="block text-xs font-semibold text-[#1E293B] mb-1">
                Display Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="profile-email" className="block text-xs font-semibold text-[#1E293B] mb-1">
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            {/* Re-authentication gate when changing username or email */}
            {sensitiveProfileChanged && (
              <div className="rounded-lg border border-[#BFDBFE] bg-[#F8FAFD] p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0D1F4E]">
                  <Lock className="h-3.5 w-3.5 text-[#1438B8]" />
                  Confirm Current Password Required
                </div>
                <p className="text-xs text-[#475569]">
                  Changing your username or email address requires re-entering your current password.
                </p>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={profileConfirmPassword}
                  onChange={(e) => setProfileConfirmPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#64748B]">
                Last login: <span className="font-mono">{formatDateTime(user?.lastLoginAt)}</span>
              </span>
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96] disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>

          {/* Existing Change Password Form */}
          <form onSubmit={handleChangePassword} className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#0D1F4E] pb-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#1438B8]" />
              Change Password
            </h3>
            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1">New Password (min 10 chars)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1E293B] mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm focus:border-[#1438B8] focus:outline-none"
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingPassword}
                className="rounded-lg bg-[#0D1F4E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1438B8]"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

        {/* Right: Integrations & Security (preserved intact) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-5">
            <h3 className="text-sm font-semibold text-[#0D1F4E] pb-3 border-b border-[#E2E8F0]">
              Integration & Connection Status
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <Database className="h-4 w-4 text-[#1438B8]" />
                  Sanity CMS
                </span>
                <StatusText
                  status={status?.sanity.mode === 'sanity_live' ? 'connected' : 'warning'}
                  label={status?.sanity.mode === 'sanity_live' ? 'Live Write Enabled' : 'Staging Mode'}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#475569] bg-[#F8FAFD] p-3 rounded-lg border border-[#E2E8F0]">
                <div>Project ID: {status?.sanity.projectId || 'hnm8jy5w'}</div>
                <div>Dataset: {status?.sanity.dataset || 'staging'}</div>
                <div>API Version: {status?.sanity.apiVersion || '2024-01-01'}</div>
                <div>Write Token: {status?.sanity.writeTokenConfigured ? 'Configured' : 'Not Set'}</div>
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">{status?.sanity.message}</p>
            </div>

            <div className="space-y-2 pt-4 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <BarChart3 className="h-4 w-4 text-[#1438B8]" />
                  Google Analytics 4 Data API
                </span>
                <StatusText
                  status={status?.ga4.configured ? 'connected' : 'disconnected'}
                  label={status?.ga4.configured ? 'Connected' : 'Not Configured'}
                />
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">{status?.ga4.message}</p>
            </div>
          </div>

          <form onSubmit={handleSaveSession} className="rounded-xl border border-[#DDE5F0] bg-white p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#0D1F4E] pb-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#1438B8]" />
              Session & Security Policy
            </h3>

            <div>
              <label className="block text-xs font-semibold text-[#1E293B] mb-1">
                Session Expiry Duration (hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={sessionTimeoutHours}
                onChange={(e) => setSessionTimeoutHours(Number(e.target.value) || 24)}
                className="w-40 rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-sm focus:border-[#1438B8] focus:outline-none"
              />
            </div>

            <div className="text-xs text-[#475569] space-y-1.5 pt-2 border-t border-[#F1F5F9]">
              <div>· Password hashing: Node.js scrypt with per-user 16-byte cryptographic salt</div>
              <div>· Session transport: HttpOnly cookies + HMAC-SHA256 server-validated sessions</div>
              <div>· Brute-force protection: 5 failed login attempts per 15 minutes per IP/username</div>
              <div>· Account protection: Current password required before changing username or email</div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingSession}
                className="rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
              >
                {savingSession ? 'Saving...' : 'Save Session Policy'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Circular Avatar Crop Modal */}
      <AvatarCropModal
        file={cropSourceFile}
        onCancel={() => setCropSourceFile(null)}
        onConfirm={handleApplyCrop}
      />

      {/* Confirm Remove Photo Dialog */}
      <ConfirmDialog
        open={removeAvatarConfirmOpen}
        title="Remove Profile Picture"
        description="Remove your current profile picture? Your account will revert to an initials avatar across RYZITE Control Centre."
        confirmLabel="Remove Photo"
        loading={removingAvatar}
        onConfirm={handleRemoveSavedAvatar}
        onCancel={() => setRemoveAvatarConfirmOpen(false)}
      />
    </div>
  );
}
