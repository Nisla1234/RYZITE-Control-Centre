import React, { useState } from 'react';
import { ArrowRight, ExternalLink, Lock, Menu, X } from 'lucide-react';
import type {
  ArticleItem,
  GlobalSeoSettings,
  PortfolioProject,
  ServiceOrSolution,
  TestimonialItem,
  WebsitePage,
} from '../../types/cms';
import { PageBlockRenderer } from './PageBlockRenderer';
import { MediaThumbnail } from '../media/MediaThumbnail';

export interface PublicSitePayload {
  globalSeo: GlobalSeoSettings | null;
  pages: WebsitePage[];
  services: ServiceOrSolution[];
  solutions: ServiceOrSolution[];
  portfolio: PortfolioProject[];
  testimonials: TestimonialItem[];
  articles: ArticleItem[];
}

interface PublicSiteShellProps {
  site: PublicSitePayload | null;
  activePage: WebsitePage | null;
  currentPath: string;
  loading?: boolean;
  isPreview?: boolean;
  forceMobileNav?: boolean;
  onNavigate: (path: string) => void;
}

export function PublicSiteShell({
  site,
  activePage,
  currentPath,
  loading = false,
  isPreview = false,
  forceMobileNav = false,
  onNavigate,
}: PublicSiteShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const normalizedPath = (currentPath || '/').replace(/\/$/, '') || '/';
  const navPages = (site?.pages || []).filter((p) => p.slug && p.slug !== '/');

  const handleLinkClick = (e: React.MouseEvent, targetPath: string) => {
    e.preventDefault();
    setMenuOpen(false);
    onNavigate(targetPath);
  };

  return (
    <div className="min-h-full bg-[#F4F7FC] text-[#0F172A] flex flex-col font-sans">
      {/* Public Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#DDE5F0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="flex items-center gap-2.5 shrink-0"
          >
            <img
              src="/assets/branding/ryzite-logo.png"
              alt="RYZITE"
              className="h-9 w-auto object-contain"
            />
          </a>

          {!forceMobileNav && (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#334155]">
              <a
                href="/"
                onClick={(e) => handleLinkClick(e, '/')}
                className={`hover:text-[#1438B8] transition-colors ${
                  normalizedPath === '/' ? 'text-[#1438B8] font-semibold' : ''
                }`}
              >
                Home
              </a>
              {navPages.slice(0, 5).map((p) => {
                const pSlug = (p.slug || '/').replace(/\/$/, '') || '/';
                return (
                  <a
                    key={p.id}
                    href={p.slug}
                    onClick={(e) => handleLinkClick(e, p.slug)}
                    className={`hover:text-[#1438B8] transition-colors ${
                      normalizedPath === pSlug ? 'text-[#1438B8] font-semibold' : ''
                    }`}
                  >
                    {p.title}
                  </a>
                );
              })}
              {(site?.services?.length ?? 0) > 0 && normalizedPath === '/' && (
                <a href="#services" className="hover:text-[#1438B8] transition-colors">
                  Services
                </a>
              )}
              {(site?.articles?.length ?? 0) > 0 && normalizedPath === '/' && (
                <a href="#articles" className="hover:text-[#1438B8] transition-colors">
                  Insights
                </a>
              )}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {!isPreview && (
              <a
                href="/admin/"
                onClick={(e) => handleLinkClick(e, '/admin/')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:border-[#1438B8] hover:text-[#1438B8] px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors"
              >
                <Lock className="w-3.5 h-3.5" /> Admin
              </a>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className={`${forceMobileNav ? '' : 'md:hidden'} p-2 rounded-lg text-[#334155] hover:bg-[#F4F7FC]`}
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            className={`${
              forceMobileNav ? '' : 'md:hidden'
            } border-t border-[#E5ECF6] bg-white px-4 py-3 space-y-1 text-sm`}
          >
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className={`block py-1.5 font-medium ${
                normalizedPath === '/' ? 'text-[#1438B8] font-semibold' : 'text-[#334155]'
              }`}
            >
              Home
            </a>
            {navPages.map((p) => {
              const pSlug = (p.slug || '/').replace(/\/$/, '') || '/';
              return (
                <a
                  key={p.id}
                  href={p.slug}
                  onClick={(e) => handleLinkClick(e, p.slug)}
                  className={`block py-1.5 font-medium ${
                    normalizedPath === pSlug ? 'text-[#1438B8] font-semibold' : 'text-[#334155]'
                  }`}
                >
                  {p.title}
                </a>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-12">
        {loading ? (
          <div className="py-24 text-center text-sm text-[#64748B]">Loading RYZITE…</div>
        ) : activePage ? (
          <PageBlockRenderer
            blocks={activePage.blocks}
            onNavigate={(url) => {
              if (/^https?:\/\//i.test(url)) {
                window.open(url, '_blank', 'noopener,noreferrer');
              } else {
                onNavigate(url);
              }
            }}
          />
        ) : (
          <div className="rounded-2xl border border-[#DDE5F0] bg-white p-10 text-center space-y-3">
            <h1 className="text-2xl font-bold text-[#0D1F4E]">Page Not Published Yet</h1>
            <p className="text-sm text-[#64748B]">
              The route <code className="font-mono">{currentPath}</code> does not currently have a published version.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-4 py-2 text-xs font-semibold"
            >
              Return Home <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Live Published Services on Home */}
        {normalizedPath === '/' && (site?.services?.length ?? 0) > 0 && (
          <section id="services" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Services</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">
                Engineering & Growth Capabilities Built for Scale
              </h2>
            </div>
            <div className={`grid grid-cols-1 ${forceMobileNav ? '' : 'md:grid-cols-3'} gap-5`}>
              {site!.services.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {s.imageUrl && (
                    <MediaThumbnail
                      src={s.imageUrl}
                      alt={s.imageAlt || s.title}
                      className="h-40 w-full"
                      compact
                    />
                  )}
                  <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold text-[#1438B8] uppercase">
                        {s.category}
                      </span>
                      <h3 className="text-base font-bold text-[#0F172A] mt-1">{s.title}</h3>
                      <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">{s.summary}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Published Solutions on Home or Solutions Page */}
        {(normalizedPath === '/' || normalizedPath === '/solutions') &&
          (site?.solutions?.length ?? 0) > 0 && (
            <section id="solutions" className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">
                  Technology Solutions
                </p>
                <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">
                  Software, Web & Automation Systems
                </h2>
              </div>
              <div className={`grid grid-cols-1 ${forceMobileNav ? '' : 'md:grid-cols-3'} gap-5`}>
                {site!.solutions.slice(0, normalizedPath === '/solutions' ? 12 : 6).map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                  >
                    {s.imageUrl && (
                      <MediaThumbnail
                        src={s.imageUrl}
                        alt={s.imageAlt || s.title}
                        className="h-40 w-full"
                        compact
                      />
                    )}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-semibold text-[#1438B8] uppercase">
                          {s.category}
                        </span>
                        <h3 className="text-base font-bold text-[#0F172A] mt-1">{s.title}</h3>
                        <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">{s.summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* Live Published Portfolio on Home */}
        {normalizedPath === '/' && (site?.portfolio?.length ?? 0) > 0 && (
          <section id="portfolio" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Portfolio</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">Selected Deliveries</h2>
            </div>
            <div className={`grid grid-cols-1 ${forceMobileNav ? '' : 'md:grid-cols-3'} gap-5`}>
              {site!.portfolio.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {proj.thumbnailUrl && (
                    <MediaThumbnail
                      src={proj.thumbnailUrl}
                      alt={proj.thumbnailAlt || proj.name}
                      className="h-40 w-full"
                      compact
                    />
                  )}
                  <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-semibold text-[#1438B8] uppercase">
                        {proj.category}
                      </span>
                      <h3 className="text-base font-bold text-[#0F172A] mt-1">{proj.name}</h3>
                      <p className="text-xs text-[#475569] mt-1.5 leading-relaxed">
                        {proj.description}
                      </p>
                    </div>
                    {proj.projectUrl && (
                      <a
                        href={proj.projectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1438B8] hover:underline"
                      >
                        View Project <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Published Articles on Home */}
        {normalizedPath === '/' && (site?.articles?.length ?? 0) > 0 && (
          <section id="articles" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Insights</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">Latest from RYZITE Engineering</h2>
            </div>
            <div className={`grid grid-cols-1 ${forceMobileNav ? '' : 'md:grid-cols-3'} gap-5`}>
              {site!.articles.slice(0, 6).map((art) => (
                <article
                  key={art.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {art.featuredImageUrl && (
                    <MediaThumbnail
                      src={art.featuredImageUrl}
                      alt={art.featuredImageAlt || art.title}
                      className="h-40 w-full"
                      compact
                    />
                  )}
                  <div className="p-5 space-y-2">
                    <p className="text-[11px] text-[#64748B]">
                      {art.author} · {art.publishedAt?.slice(0, 10)}
                    </p>
                    <h3 className="text-base font-bold text-[#0F172A]">{art.title}</h3>
                    <p className="text-xs text-[#475569] leading-relaxed">{art.excerpt}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Public Footer */}
      <footer className="bg-[#0D1F4E] text-[#CBD5E1] mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="rounded bg-white px-2 py-1">
              <img
                src="/assets/branding/ryzite-logo.png"
                alt="RYZITE"
                className="h-6 w-auto object-contain"
              />
            </div>
            <span>© {new Date().getFullYear()} RYZITE. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="mailto:info@ryzite.lk" className="hover:text-white">
              info@ryzite.lk
            </a>
            {!isPreview && (
              <a
                href="/admin/"
                onClick={(e) => handleLinkClick(e, '/admin/')}
                className="hover:text-white"
              >
                Control Centre
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
