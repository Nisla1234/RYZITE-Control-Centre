# RYZITE Astro Main Website (`Nisla1234/ryzite-website-development`) — CMS Integration Guide

This guide connects the production Astro 7 website (`ryzite-main-site`, branch `vercel-migration`, domain `https://ryzite.lk`) to the live RYZITE Control Centre CMS (`ryzite-control-centre`, branch `main`) **without changing or replacing the existing Astro design, GSAP animations, header, or footer**.

---

## 1. Environment Variables in Vercel (`ryzite-main-site`)

Add the following environment variable in **Vercel → `ryzite-main-site` → Settings → Environment Variables**:

```env
CMS_API_URL=https://ryzite-control-centre.vercel.app
```

*(Server-side only — do NOT prefix with `PUBLIC_`.)*

---

## 2. Create `src/lib/cms.ts` in `Nisla1234/ryzite-website-development`

This helper:
- Fetches live **published** content from `GET ${CMS_API_URL}/api/public/site` and `GET ${CMS_API_URL}/api/public/page?slug=...`
- Supports **signed 15-minute draft previews** when `?cmsPreview=1&previewToken=...` is present on the request URL (calling `GET ${CMS_API_URL}/api/public/preview?slug=...&token=...`)
- Preserves a **last-known-good in-memory cache** so `ryzite.lk` stays 100% online even if the CMS API is temporarily unreachable.

```ts
// src/lib/cms.ts
export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  blocks: Array<Record<string, any>>;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    canonicalUrl?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    noIndex?: boolean;
  };
}

export interface CmsSitePayload {
  globalSeo: Record<string, any> | null;
  pages: CmsPage[];
  services: Array<Record<string, any>>;
  solutions: Array<Record<string, any>>;
  portfolio: Array<Record<string, any>>;
  team: Array<Record<string, any>>;
  testimonials: Array<Record<string, any>>;
  articles: Array<Record<string, any>>;
}

const CMS_API_URL = (import.meta.env.CMS_API_URL || process.env.CMS_API_URL || '').replace(/\/$/, '');

let lastKnownGoodSite: { data: CmsSitePayload; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function fetchCmsPageForRequest(requestUrl: URL, slug: string): Promise<{
  mode: 'published' | 'draft';
  page: CmsPage | null;
  seo: Record<string, any> | null;
  site: CmsSitePayload | null;
}> {
  if (!CMS_API_URL) {
    return { mode: 'published', page: null, seo: null, site: null };
  }

  const isPreview = requestUrl.searchParams.get('cmsPreview') === '1';
  const previewToken = requestUrl.searchParams.get('previewToken') || '';

  // 1. Signed Draft Preview Mode (never cached, verified server-side by Control Centre)
  if (isPreview && previewToken) {
    try {
      const res = await fetch(
        `${CMS_API_URL}/api/public/preview?slug=${encodeURIComponent(slug)}`,
        {
          headers: { 'X-CMS-Preview-Token': previewToken },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        return {
          mode: 'draft',
          page: data.page || null,
          seo: data.seo || null,
          site: {
            globalSeo: data.globalSeo || null,
            pages: data.pages || [],
            services: data.services || [],
            solutions: data.solutions || [],
            portfolio: data.portfolio || [],
            team: data.team || [],
            testimonials: data.testimonials || [],
            articles: data.articles || [],
          },
        };
      }
    } catch {
      // Fall through to published content safely
    }
  }

  // 2. Published Production Mode (with 30s in-memory cache + last-known-good fallback)
  try {
    const [pageRes, siteRes] = await Promise.all([
      fetch(`${CMS_API_URL}/api/public/page?slug=${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(5000),
      }),
      lastKnownGoodSite && Date.now() - lastKnownGoodSite.fetchedAt < CACHE_TTL_MS
        ? Promise.resolve(null)
        : fetch(`${CMS_API_URL}/api/public/site`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (siteRes && siteRes.ok) {
      lastKnownGoodSite = { data: await siteRes.json(), fetchedAt: Date.now() };
    }

    const pageData = pageRes.ok ? await pageRes.json() : null;
    return {
      mode: 'published',
      page: pageData?.page || null,
      seo: pageData?.seo || null,
      site: lastKnownGoodSite?.data || null,
    };
  } catch {
    const cachedPage =
      lastKnownGoodSite?.data.pages.find(
        (p) => (p.slug || '/').replace(/\/+$/, '') === slug.replace(/\/+$/, '')
      ) || null;
    return {
      mode: 'published',
      page: cachedPage,
      seo: null,
      site: lastKnownGoodSite?.data || null,
    };
  }
}

export function getBlockText(page: CmsPage | null, blockId: string, fallback: string): string {
  const found = page?.blocks?.find((b) => b.id === blockId && b.visible !== false);
  return (found?.text && String(found.text).trim()) || fallback;
}
```

---

## 3. Use CMS Content in Existing Astro Pages (Preserving Existing Design)

In any SSR Astro page (e.g. `src/pages/index.astro`, `src/pages/about.astro`, `src/pages/solutions.astro`, `src/pages/packages.astro`):

```astro
---
export const prerender = false; // Ensure SSR so publishes & signed draft previews reflect immediately

import Layout from '../layouts/Layout.astro';
import { fetchCmsPageForRequest, getBlockText } from '../lib/cms';

const { mode, page, seo, site } = await fetchCmsPageForRequest(Astro.url, '/');

// Map CMS blocks directly into your existing Astro components (with static fallbacks)
const heroHeadline = getBlockText(page, 'home-hero', 'Your Existing Default Hero Headline');
const solutionsList = site?.solutions?.length ? site.solutions : existingDefaultSolutions;
---

<Layout
  title={seo?.title || 'RYZITE'}
  description={seo?.description || 'Default description'}
  ogImage={seo?.ogImage}
  noIndex={mode === 'draft' || Boolean(seo?.noIndex)}
>
  {mode === 'draft' && (
    <div style="position:fixed;bottom:12px;right:12px;z-index:9999;background:#1438B8;color:#fff;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.2);">
      CMS Draft Preview Mode (Unpublished)
    </div>
  )}
  <!-- Keep your exact existing Astro hero, GSAP animations, sections, and footer here -->
</Layout>
```

---

## 4. Allow Admin CMS Preview Framing (`vercel.json` in `ryzite-main-site`)

To allow the Admin CMS (`https://ryzite-control-centre.vercel.app`) to embed `https://ryzite.lk` inside the Visual Live Page Preview iframe without framing errors:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://ryzite-control-centre.vercel.app;"
        }
      ]
    }
  ]
}
```
