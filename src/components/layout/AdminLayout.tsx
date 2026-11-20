import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Wrench,
  Layers,
  Users,
  BookOpen,
  MessageSquareQuote,
  Image as ImageIcon,
  SearchCheck,
  BarChart3,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminAvatar } from '../ui/AdminAvatar';
import { apiFetch } from '../../lib/api';
import type { SeoAuditResult } from '../../types/cms';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'overview' | 'content' | 'growth' | 'system';
  badgeKey?: keyof SeoAuditResult['moduleCounts'];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/admin/dashboard/', icon: LayoutDashboard, group: 'overview' },
  { label: 'Website Pages', to: '/admin/pages/', icon: FileText, group: 'content', badgeKey: 'page' },
  { label: 'Portfolio', to: '/admin/portfolio/', icon: Briefcase, group: 'content', badgeKey: 'portfolio' },
  { label: 'Services', to: '/admin/services/', icon: Wrench, group: 'content', badgeKey: 'service' },
  { label: 'Solutions', to: '/admin/solutions/', icon: Layers, group: 'content', badgeKey: 'solution' },
  { label: 'Team', to: '/admin/team/', icon: Users, group: 'content' },
  { label: 'Articles & Blog', to: '/admin/articles/', icon: BookOpen, group: 'content', badgeKey: 'article' },
  { label: 'Testimonials', to: '/admin/testimonials/', icon: MessageSquareQuote, group: 'content' },
  { label: 'Media Library', to: '/admin/media/', icon: ImageIcon, group: 'content', badgeKey: 'media' },
  { label: 'SEO Centre', to: '/admin/seo/', icon: SearchCheck, group: 'growth', badgeKey: 'total' },
  { label: 'Analytics (GA4)', to: '/admin/analytics/', icon: BarChart3, group: 'growth' },
  { label: 'Activity Logs', to: '/admin/activity/', icon: History, group: 'system' },
  { label: 'Settings', to: '/admin/settings/', icon: Settings, group: 'system' },
];

const GROUP_LABELS: Record<NavItem['group'], string> = {
  overview: 'Overview',
  content: 'Content Management',
  growth: 'Visibility & Data',
  system: 'Governance',
};

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, toasts, dismissToast } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickJump, setQuickJump] = useState('');
  const [showJumpResults, setShowJumpResults] = useState(false);
  const [moduleCounts, setModuleCounts] = useState<SeoAuditResult['moduleCounts'] | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    apiFetch<SeoAuditResult>('/api/seo/audit')
      .then((res) => {
        if (active && res?.moduleCounts) setModuleCounts(res.moduleCounts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const currentNav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to.replace(/\/$/, '')));
  const pageTitle = currentNav?.label || 'Control Centre';

  const jumpMatches = quickJump.trim()
    ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(quickJump.toLowerCase()))
    : [];

  const handleLogout = async () => {
    await logout();
    navigate('/admin/', { replace: true });
  };

  const renderNavGroups = () => {
    const groups: NavItem['group'][] = ['overview', 'content', 'growth', 'system'];
    return groups.map((group) => {
      const items = NAV_ITEMS.filter((i) => i.group === group);
      return (
        <div key={group} className="mb-5">
          <div className="px-4 pb-1.5 text-[11px] font-medium tracking-wide text-[#94AEDB]/70">
            {GROUP_LABELS[group]}
          </div>
          <nav className="space-y-0.5 px-2">
            {items.map((item) => {
              const Icon = item.icon;
              const badgeCount =
                item.badgeKey && moduleCounts ? moduleCounts[item.badgeKey] || 0 : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#1438B8] text-white'
                        : 'text-[#CBD9F2] hover:bg-[#1B3266] hover:text-white'
                    }`
                  }
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 opacity-90" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badgeCount > 0 && (
                    <span
                      title={`${badgeCount} unresolved SEO warning(s)`}
                      className="shrink-0 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-bold leading-none"
                    >
                      {badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F7FC] text-[#0F172A] flex">
      {/* Desktop Sidebar — Deep RYZITE Navy inspired by reference admin panel & RYZITE logo */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#13254D] text-white border-r border-[#0D1F4E]">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0D1F4E] border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 items-center justify-center rounded-md bg-white px-2.5 py-1 shrink-0">
              <img
                src="/assets/branding/ryzite-logo.png"
                alt="RYZITE"
                className="h-9 w-auto object-contain"
              />
            </div>
            <span className="text-xs font-semibold tracking-tight text-[#CBD9F2] truncate">
              Control Centre
            </span>
          </div>
        </div>

        {/* Admin Identity Block */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <AdminAvatar
            name={user?.name}
            username={user?.username}
            avatarUrl={user?.avatarUrl}
            size="md"
            className="border-white/20"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.name || 'Administrator'}</div>
            <div className="text-xs text-[#94AEDB] truncate">{user?.email || user?.username}</div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-4">{renderNavGroups()}</div>

        {/* Footer Actions */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <a
            href="https://ryzite.lk"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#CBD9F2] transition-colors hover:bg-[#1B3266] hover:text-white"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>View Live Website</span>
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#CBD9F2] transition-colors hover:bg-[#1B3266] hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0D1F4E]/60 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[82vw] flex-col bg-[#13254D] text-white shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3.5 bg-[#0D1F4E] border-b border-white/10">
              <div className="flex h-9 items-center justify-center rounded bg-white px-2.5 py-0.5">
                <img
                  src="/assets/branding/ryzite-logo.png"
                  alt="RYZITE"
                  className="h-8 w-auto object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-[#CBD9F2] hover:bg-white/10"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
              <AdminAvatar
                name={user?.name}
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size="sm"
                className="border-white/20"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{user?.name || 'Administrator'}</div>
                <div className="text-xs text-[#94AEDB] truncate">{user?.email || user?.username}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-4">{renderNavGroups()}</div>
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#CBD9F2] hover:bg-[#1B3266] hover:text-white"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-[#DDE5F0] bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-[#334155] hover:bg-[#F4F7FC]"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img
              src="/assets/branding/ryzite-logo.png"
              alt="RYZITE"
              className="lg:hidden h-8 w-auto object-contain shrink-0"
            />
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-[#64748B]">RYZITE</span>
              <span className="hidden sm:inline text-[#CBD5E1]">/</span>
              <h1 className="text-base sm:text-lg font-semibold text-[#0D1F4E] truncate">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick-jump module search */}
            <div className="relative hidden md:block w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                value={quickJump}
                onChange={(e) => {
                  setQuickJump(e.target.value);
                  setShowJumpResults(true);
                }}
                onFocus={() => setShowJumpResults(true)}
                onBlur={() => setTimeout(() => setShowJumpResults(false), 180)}
                placeholder="Jump to module..."
                className="w-full rounded-lg border border-[#DDE5F0] bg-[#F4F7FC] py-1.5 pl-9 pr-3 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#1438B8] focus:bg-white focus:outline-none"
              />
              {showJumpResults && jumpMatches.length > 0 && (
                <div className="absolute right-0 mt-1.5 w-full rounded-lg border border-[#DDE5F0] bg-white py-1 shadow-lg z-40">
                  {jumpMatches.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      onMouseDown={() => {
                        navigate(item.to);
                        setQuickJump('');
                        setShowJumpResults(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[#334155] hover:bg-[#EEF3FC] hover:text-[#1438B8]"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('/admin/settings/')}
              className="flex items-center gap-2 rounded-lg border border-[#DDE5F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC] whitespace-nowrap shrink-0"
            >
              <AdminAvatar
                name={user?.name}
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size="xs"
              />
              <span className="font-semibold text-[#0D1F4E] max-w-[140px] truncate">
                {user?.name || user?.username}
              </span>
              <span className="hidden sm:inline text-[#94A3B8]">·</span>
              <span className="hidden sm:inline capitalize text-[#64748B]">
                {user?.role?.replace('_', ' ')}
              </span>
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg bg-white ${
                t.type === 'success'
                  ? 'border-[#BBF7D0] text-[#14532D]'
                  : t.type === 'error'
                  ? 'border-[#FECACA] text-[#7F1D1D]'
                  : 'border-[#BFDBFE] text-[#1E3A8A]'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[#16A34A]" />
              ) : t.type === 'error' ? (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
              ) : (
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-[#2563EB]" />
              )}
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-[#64748B] hover:text-[#0F172A]"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
