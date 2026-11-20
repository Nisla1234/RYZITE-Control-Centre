import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PublicSiteShell, type PublicSitePayload } from '../components/public/PublicSiteShell';

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

  const normalizedCurrent = currentPath.replace(/\/$/, '') || '/';
  const activePage =
    site?.pages.find((p) => {
      const slug = ((p.slug || '/').startsWith('/') ? p.slug : `/${p.slug}`).replace(/\/$/, '') || '/';
      return slug.toLowerCase() === normalizedCurrent.toLowerCase();
    }) || null;

  // Apply resolved SEO metadata dynamically
  useEffect(() => {
    if (!site) return;
    const g = site.globalSeo;
    const title =
      activePage?.seo?.metaTitle ||
      g?.siteTitle ||
      'RYZITE — Digital Engineering & Technology Solutions';
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

  return (
    <div className="min-h-screen flex flex-col">
      <PublicSiteShell
        site={site}
        activePage={activePage}
        currentPath={currentPath}
        loading={loading}
        onNavigate={(target) => navigate(target)}
      />
    </div>
  );
}
