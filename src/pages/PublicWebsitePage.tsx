import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, Lock, Menu, X } from 'lucide-react';
import type {
  ArticleItem,
  GlobalSeoSettings,
  PortfolioProject,
  ServiceOrSolution,
  TestimonialItem,
  WebsitePage,
} from '../types/cms';
import { PageBlockRenderer } from '../components/public/PageBlockRenderer';

interface PublicSitePayload {
  globalSeo: GlobalSeoSettings | null;
  pages: WebsitePage[];
  services: ServiceOrSolution[];
  solutions: ServiceOrSolution[];
  portfolio: PortfolioProject[];
  testimonials: TestimonialItem[];
  articles: ArticleItem[];
}

function setMetaTag(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function PublicWebsitePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [site, setSite] = useState<PublicSitePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentPath = location.pathname === '' ? '/' : location.pathname;

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/public/site', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: PublicSitePayload) => {
        if (active) setSite(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentPath]);

  const activePage = site?.pages.find((p) => {
    const slug = (p.slug || '/').startsWith('/') ? p.slug : `/${p.slug}`;
    return slug.toLowerCase() === currentPath.toLowerCase();
  });

  // Apply resolved SEO metadata dynamically
  useEffect(() => {
    if (!site) return;
    const g = site.globalSeo;
    const title = activePage?.seo?.metaTitle || g?.siteTitle || 'RYZITE — Digital Engineering & Technology Solutions';
    const desc = activePage?.seo?.metaDescription || g?.siteDescription || '';
    const ogTitle = activePage?.seo?.ogTitle || title;
    const ogDesc = activePage?.seo?.ogDescription || desc;
    const ogImg = activePage?.seo?.ogImage || g?.defaultOgImage || '/assets/branding/ryzite-logo.png';

    document.title = title;
    setMetaTag('name', 'description', desc);
    setMetaTag('property', 'og:title', ogTitle);
    setMetaTag('property', 'og:description', ogDesc);
    setMetaTag('property', 'og:image', ogImg);
  }, [site, activePage]);

  const navPages = (site?.pages || []).filter((p) => p.slug && p.slug !== '/');

  return (
    <div className="min-h-screen bg-[#F4F7FC] text-[#0F172A] flex flex-col">
      {/* Public Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#DDE5F0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src="/assets/branding/ryzite-logo.png"
              alt="RYZITE"
              className="h-9 w-auto object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#334155]">
            <Link
              to="/"
              className={`hover:text-[#1438B8] transition-colors ${
                currentPath === '/' ? 'text-[#1438B8] font-semibold' : ''
              }`}
            >
              Home
            </Link>
            {navPages.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                to={p.slug}
                className={`hover:text-[#1438B8] transition-colors ${
                  currentPath === p.slug ? 'text-[#1438B8] font-semibold' : ''
                }`}
              >
                {p.title}
              </Link>
            ))}
            {(site?.services?.length ?? 0) > 0 && (
              <a href="#services" className="hover:text-[#1438B8] transition-colors">
                Services
              </a>
            )}
            {(site?.articles?.length ?? 0) > 0 && (
              <a href="#articles" className="hover:text-[#1438B8] transition-colors">
                Insights
              </a>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFEE] hover:border-[#1438B8] hover:text-[#1438B8] px-3 py-1.5 text-xs font-semibold text-[#334155] transition-colors"
            >
              <Lock className="w-3.5 h-3.5" /> Admin
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden p-2 rounded-lg text-[#334155] hover:bg-[#F4F7FC]"
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-[#E5ECF6] bg-white px-4 py-3 space-y-2 text-sm">
            <Link to="/" onClick={() => setMenuOpen(false)} className="block py-1.5 font-medium">
              Home
            </Link>
            {navPages.map((p) => (
              <Link
                key={p.id}
                to={p.slug}
                onClick={() => setMenuOpen(false)}
                className="block py-1.5 font-medium"
              >
                {p.title}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 space-y-14">
        {loading ? (
          <div className="py-24 text-center text-sm text-[#64748B]">Loading RYZITE...</div>
        ) : activePage ? (
          <PageBlockRenderer blocks={activePage.blocks} onNavigate={(url) => navigate(url)} />
        ) : (
          <div className="rounded-2xl border border-[#DDE5F0] bg-white p-12 text-center space-y-3">
            <h1 className="text-2xl font-bold text-[#0D1F4E]">Page Not Found</h1>
            <p className="text-sm text-[#64748B]">
              The page <code className="font-mono">{currentPath}</code> is not currently published.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1438B8] text-white px-4 py-2 text-xs font-semibold"
            >
              Return Home <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Live Published Services & Solutions on Home */}
        {currentPath === '/' && (site?.services?.length ?? 0) > 0 && (
          <section id="services" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Services</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">
                Engineering Capabilities Built for Scale
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {site!.services.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {s.imageUrl && (
                    <img
                      src={s.imageUrl}
                      alt={s.imageAlt || s.title}
                      className="h-40 w-full object-cover"
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
        {currentPath === '/' && (site?.portfolio?.length ?? 0) > 0 && (
          <section id="portfolio" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Portfolio</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">Selected Deliveries</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {site!.portfolio.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {proj.thumbnailUrl && (
                    <img
                      src={proj.thumbnailUrl}
                      alt={proj.thumbnailAlt || proj.name}
                      className="h-40 w-full object-cover"
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
        {currentPath === '/' && (site?.articles?.length ?? 0) > 0 && (
          <section id="articles" className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1438B8]">Insights</p>
              <h2 className="text-2xl font-bold text-[#0D1F4E] mt-1">Latest from RYZITE Engineering</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {site!.articles.slice(0, 6).map((art) => (
                <article
                  key={art.id}
                  className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col"
                >
                  {art.featuredImageUrl && (
                    <img
                      src={art.featuredImageUrl}
                      alt={art.featuredImageAlt || art.title}
                      className="h-40 w-full object-cover"
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
      <footer className="bg-[#0D1F4E] text-[#CBD5E1] mt-16">
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
            <Link to="/admin/" className="hover:text-white">
              Control Centre
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
