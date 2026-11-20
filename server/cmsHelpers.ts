import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from './db.ts';
import { listDocuments } from './sanity.ts';
import type {
  MediaAsset,
  MediaUsageRef,
  SeoAuditResult,
  SeoIssue,
  WebsitePage,
} from '../src/types/cms.ts';

function stripQuery(url: string): string {
  return (url || '').split('?')[0].trim();
}

export function getEntityTitle(doc: any): string {
  return doc?.title || doc?.name || doc?.customerName || doc?.id || 'Untitled';
}

export function extractImageDimensions(
  buffer: Buffer,
  mimeType: string
): { width: number | null; height: number | null } {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === 'image/gif' && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (mimeType === 'image/jpeg' && buffer.length > 4) {
      let i = 2;
      while (i < buffer.length - 9) {
        if (buffer[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buffer[i + 1];
        if (
          marker === 0xc0 ||
          marker === 0xc1 ||
          marker === 0xc2 ||
          marker === 0xc3
        ) {
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          return { width, height };
        }
        const len = buffer.readUInt16BE(i + 2);
        if (len < 2) break;
        i += 2 + len;
      }
    }
    if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        const w = 1 + buffer.readUIntLE(24, 3);
        const h = 1 + buffer.readUIntLE(27, 3);
        return { width: w, height: h };
      }
      if (chunk === 'VP8 ' && buffer.length >= 30) {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }
    }
    if (mimeType === 'image/svg+xml') {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 2048));
      const vb = text.match(/viewBox=["'][\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)["']/i);
      if (vb) {
        return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
      }
      const wMatch = text.match(/\bwidth=["']([\d.]+)/i);
      const hMatch = text.match(/\bheight=["']([\d.]+)/i);
      if (wMatch && hMatch) {
        return { width: Math.round(Number(wMatch[1])), height: Math.round(Number(hMatch[1])) };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { width: null, height: null };
}

export function validateUploadSafety(buffer: Buffer, mimeType: string): string | null {
  if (mimeType === 'image/svg+xml') {
    const content = buffer.toString('utf8');
    if (/<script[\s>]/i.test(content) || /\son[a-z]+\s*=/i.test(content) || /javascript:/i.test(content)) {
      return 'SVG files containing scripts or inline event handlers are blocked for security.';
    }
  }
  if (mimeType === 'application/pdf') {
    if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
      return 'Invalid PDF file signature.';
    }
  }
  if (mimeType === 'image/png') {
    if (buffer.length < 8 || buffer.toString('ascii', 1, 4) !== 'PNG') {
      return 'Invalid PNG file signature.';
    }
  }
  return null;
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getEntityDeepLink(docType: string, id: string, tab = 'content', field?: string): string {
  const map: Record<string, string> = {
    page: `/admin/pages/${id}`,
    service: `/admin/services/${id}`,
    solution: `/admin/solutions/${id}`,
    article: `/admin/articles/${id}`,
    project: `/admin/portfolio/${id}`,
    team: `/admin/team/${id}`,
    testimonial: `/admin/testimonials/${id}`,
  };
  const base = map[docType] || `/admin/dashboard`;
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (field) params.set('field', field);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function computeMediaUsageMap(
  mediaRows: any[]
): Promise<Map<string, MediaUsageRef[]>> {
  const usageMap = new Map<string, MediaUsageRef[]>();
  for (const m of mediaRows) {
    usageMap.set(m.id, []);
  }

  if (mediaRows.length === 0) return usageMap;

  const docs = await dbAll<{ id: string; doc_type: string; data_json: string }>(
    'SELECT id, doc_type, data_json FROM cms_documents'
  );
  const settingsRow = await dbGet<{ value_json: string }>(
    'SELECT value_json FROM site_settings WHERE key = $1',
    ['global_seo']
  );

  for (const m of mediaRows) {
    const refs: MediaUsageRef[] = [];
    const baseUrl = stripQuery(m.url);
    const fileEndpoint = `/api/media/${m.id}/file`;

    for (const d of docs) {
      const raw = d.data_json || '';
      if (
        raw.includes(m.id) ||
        (baseUrl && raw.includes(baseUrl)) ||
        raw.includes(fileEndpoint)
      ) {
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          // ignore
        }
        refs.push({
          entityType: d.doc_type,
          entityId: d.id,
          entityTitle: getEntityTitle(parsed),
          field: raw.includes('ogImage') && (raw.includes(`"ogImage":"${m.url}"`) || raw.includes(`"ogImage":"${baseUrl}`))
            ? 'SEO OG Image'
            : 'Content Media',
          deepLink: getEntityDeepLink(d.doc_type, d.id, 'content'),
        });
      }
    }

    if (settingsRow?.value_json) {
      const raw = settingsRow.value_json;
      if (raw.includes(m.id) || (baseUrl && raw.includes(baseUrl)) || raw.includes(fileEndpoint)) {
        refs.push({
          entityType: 'global',
          entityId: 'global_seo',
          entityTitle: 'Global SEO Settings',
          field: 'Default OG Image',
          deepLink: '/admin/seo?tab=global&field=defaultOgImage',
        });
      }
    }

    usageMap.set(m.id, refs);
  }

  return usageMap;
}

export async function propagateMediaUrlChange(
  mediaId: string,
  oldUrl: string,
  newUrl: string
): Promise<number> {
  const oldBase = stripQuery(oldUrl);
  let updatedCount = 0;

  const replaceInJson = (raw: string | null): string | null => {
    if (!raw) return raw;
    let next = raw;
    if (oldUrl && next.includes(oldUrl)) {
      next = next.split(oldUrl).join(newUrl);
    }
    if (oldBase && oldBase !== oldUrl && next.includes(oldBase)) {
      // Replace exact base URL occurrences not already containing newUrl
      const escaped = oldBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}(\\?v=\\d+)?`, 'g');
      next = next.replace(regex, newUrl);
    }
    // Also update any object that explicitly holds mediaId
    if (next.includes(mediaId)) {
      try {
        const obj = JSON.parse(next);
        const walk = (node: any) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            node.forEach(walk);
            return;
          }
          if (node.mediaId === mediaId && 'imageUrl' in node) node.imageUrl = newUrl;
          if (node.thumbnailMediaId === mediaId) node.thumbnailUrl = newUrl;
          if (node.imageMediaId === mediaId) node.imageUrl = newUrl;
          if (node.featuredImageMediaId === mediaId) node.featuredImageUrl = newUrl;
          if (node.avatarMediaId === mediaId) node.avatarUrl = newUrl;
          if (node.defaultOgMediaId === mediaId) node.defaultOgImage = newUrl;
          Object.values(node).forEach(walk);
        };
        walk(obj);
        next = JSON.stringify(obj);
      } catch {
        // fallback to string replacement already applied
      }
    }
    return next;
  };

  const docs = await dbAll<{ id: string; data_json: string; published_json: string | null }>(
    'SELECT id, data_json, published_json FROM cms_documents'
  );
  for (const d of docs) {
    const nextData = replaceInJson(d.data_json);
    const nextPub = replaceInJson(d.published_json);
    if (nextData !== d.data_json || nextPub !== d.published_json) {
      await dbRun(
        'UPDATE cms_documents SET data_json = $1, published_json = $2 WHERE id = $3',
        [nextData, nextPub, d.id]
      );
      updatedCount++;
    }
  }

  const settings = await dbGet<{ value_json: string }>(
    'SELECT value_json FROM site_settings WHERE key = $1',
    ['global_seo']
  );
  if (settings?.value_json) {
    const nextSettings = replaceInJson(settings.value_json);
    if (nextSettings && nextSettings !== settings.value_json) {
      await dbRun("UPDATE site_settings SET value_json = $1 WHERE key = 'global_seo'", [
        nextSettings,
      ]);
      updatedCount++;
    }
  }

  return updatedCount;
}

export function resolveMediaDeliveryUrl(r: any): string {
  const version = Number(r.version || 1);
  if (r.source === 'sanity' && typeof r.url === 'string' && /^https?:\/\//i.test(r.url)) {
    return r.url;
  }
  return `/api/media/${r.id}/file?v=${version}`;
}

export function mapMediaRow(r: any, usageMap?: Map<string, MediaUsageRef[]>): MediaAsset {
  const usedIn = usageMap?.get(r.id) || [];
  return {
    id: r.id,
    fileName: r.file_name,
    originalName: r.original_name,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes || 0),
    url: resolveMediaDeliveryUrl(r),
    altText: r.alt_text || '',
    title: r.title || '',
    caption: r.caption || '',
    description: r.description || '',
    category: r.category || 'general',
    focalPoint: {
      x: typeof r.focal_x === 'number' ? r.focal_x : 50,
      y: typeof r.focal_y === 'number' ? r.focal_y : 50,
    },
    width: r.width != null ? Number(r.width) : null,
    height: r.height != null ? Number(r.height) : null,
    sha256: r.sha256 || null,
    version: Number(r.version || 1),
    source: r.source || 'local',
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    updatedAt: r.updated_at || r.uploaded_at,
    updatedBy: r.updated_by || r.uploaded_by,
    usageCount: usedIn.length,
    usedIn,
  };
}

function isValidUrl(val: string): boolean {
  if (!val) return false;
  try {
    const u = new URL(val);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function runSeoAudit(): Promise<SeoAuditResult> {
  const issues: SeoIssue[] = [];
  const seenTitles = new Map<string, { type: string; id: string; title: string }>();
  const seenDescs = new Map<string, { type: string; id: string; title: string }>();

  const globalRow = await dbGet<{ value_json: string }>(
    'SELECT value_json FROM site_settings WHERE key = $1',
    ['global_seo']
  );
  const globalSeo = globalRow ? JSON.parse(globalRow.value_json) : null;

  if (globalSeo) {
    const gTitle = (globalSeo.siteTitle || '').trim();
    const gDesc = (globalSeo.siteDescription || '').trim();
    const gUrl = (globalSeo.siteUrl || '').trim();
    const gOg = (globalSeo.defaultOgImage || '').trim();

    if (!gTitle) {
      issues.push({
        id: 'global-missing-title',
        severity: 'error',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || 'https://ryzite.lk',
        field: 'siteTitle',
        currentValue: '(empty)',
        recommended: '30–60 characters (e.g. RYZITE — Digital Engineering & Technology Solutions)',
        message: 'Global site title is missing.',
        deepLink: '/admin/seo?tab=global&field=siteTitle',
        module: 'global',
      });
    } else if (gTitle.length > 60) {
      issues.push({
        id: 'global-long-title',
        severity: 'warning',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || 'https://ryzite.lk',
        field: 'siteTitle',
        currentValue: `${gTitle.length} chars`,
        recommended: '≤ 60 characters',
        message: `Global site title is ${gTitle.length} chars (recommended ≤ 60).`,
        deepLink: '/admin/seo?tab=global&field=siteTitle',
        module: 'global',
      });
    }

    if (!gDesc) {
      issues.push({
        id: 'global-missing-desc',
        severity: 'error',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || 'https://ryzite.lk',
        field: 'siteDescription',
        currentValue: '(empty)',
        recommended: '120–160 characters',
        message: 'Global meta description is missing.',
        deepLink: '/admin/seo?tab=global&field=siteDescription',
        module: 'global',
      });
    } else if (gDesc.length < 110 || gDesc.length > 165) {
      issues.push({
        id: 'global-length-desc',
        severity: 'warning',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || 'https://ryzite.lk',
        field: 'siteDescription',
        currentValue: `${gDesc.length} chars`,
        recommended: '120–160 characters',
        message: `Global meta description is ${gDesc.length} chars (recommended 120–160).`,
        deepLink: '/admin/seo?tab=global&field=siteDescription',
        module: 'global',
      });
    }

    if (!isValidUrl(gUrl) || gUrl.includes('your-ryzite-domain')) {
      issues.push({
        id: 'global-invalid-url',
        severity: 'error',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || '(none)',
        field: 'siteUrl',
        currentValue: gUrl || '(empty)',
        recommended: 'https://ryzite.lk',
        message: 'Canonical base URL is missing or uses a placeholder domain.',
        deepLink: '/admin/seo?tab=global&field=siteUrl',
        module: 'global',
      });
    }

    if (!gOg) {
      issues.push({
        id: 'global-missing-og',
        severity: 'warning',
        entityType: 'global',
        entityId: 'global_seo',
        entityTitle: 'Global Website SEO',
        slug: gUrl || 'https://ryzite.lk',
        field: 'defaultOgImage',
        currentValue: '(empty)',
        recommended: 'Select a 1200×630 image from Media Library',
        message: 'Default social sharing (OG) image is not configured.',
        deepLink: '/admin/seo?tab=global&field=defaultOgImage',
        module: 'global',
      });
    }
  }

  const moduleOf = (entityType: string): SeoIssue['module'] => {
    if (entityType === 'project') return 'portfolio';
    if (
      entityType === 'page' ||
      entityType === 'service' ||
      entityType === 'solution' ||
      entityType === 'article' ||
      entityType === 'media' ||
      entityType === 'global'
    ) {
      return entityType;
    }
    return 'page';
  };

  const checkSeoEntity = (
    entityType: string,
    id: string,
    entityTitle: string,
    slug: string,
    seo: any
  ) => {
    const mod = moduleOf(entityType);
    const metaTitle = (seo?.metaTitle || '').trim();
    const metaDesc = (seo?.metaDescription || '').trim();
    const canonical = (seo?.canonicalUrl || '').trim();
    const ogImage = (seo?.ogImage || '').trim();

    if (!metaTitle) {
      issues.push({
        id: `${id}-missing-title`,
        severity: 'error',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'metaTitle',
        currentValue: '(empty)',
        recommended: '30–60 characters',
        message: 'Missing meta title.',
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaTitle'),
        module: mod,
      });
    } else {
      if (metaTitle.length < 25) {
        issues.push({
          id: `${id}-short-title`,
          severity: 'warning',
          entityType,
          entityId: id,
          entityTitle,
          slug,
          field: 'metaTitle',
          currentValue: `${metaTitle.length} chars`,
          recommended: '30–60 characters',
          message: `Meta title is short (${metaTitle.length} chars; recommended 30–60).`,
          deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaTitle'),
          module: mod,
        });
      } else if (metaTitle.length > 65) {
        issues.push({
          id: `${id}-long-title`,
          severity: 'warning',
          entityType,
          entityId: id,
          entityTitle,
          slug,
          field: 'metaTitle',
          currentValue: `${metaTitle.length} chars`,
          recommended: '≤ 60 characters',
          message: `Meta title may be truncated in search results (${metaTitle.length} chars; recommended ≤ 60).`,
          deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaTitle'),
          module: mod,
        });
      }

      const key = metaTitle.toLowerCase();
      if (seenTitles.has(key)) {
        const prev = seenTitles.get(key)!;
        issues.push({
          id: `${id}-dup-title`,
          severity: 'error',
          entityType,
          entityId: id,
          entityTitle,
          slug,
          field: 'metaTitle',
          currentValue: metaTitle,
          recommended: 'Unique meta title per page/record',
          message: `Duplicate meta title also used by ${prev.type} "${prev.title}".`,
          deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaTitle'),
          module: mod,
        });
      } else {
        seenTitles.set(key, { type: entityType, id, title: entityTitle });
      }
    }

    if (!metaDesc) {
      issues.push({
        id: `${id}-missing-desc`,
        severity: 'error',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'metaDescription',
        currentValue: '(empty)',
        recommended: '120–160 characters',
        message: 'Missing meta description.',
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaDescription'),
        module: mod,
      });
    } else if (metaDesc.length < 110) {
      issues.push({
        id: `${id}-short-desc`,
        severity: 'warning',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'metaDescription',
        currentValue: `${metaDesc.length} chars`,
        recommended: '120–160 characters',
        message: `Meta description is brief (${metaDesc.length} chars; recommended 120–160).`,
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaDescription'),
        module: mod,
      });
    } else if (metaDesc.length > 165) {
      issues.push({
        id: `${id}-long-desc`,
        severity: 'warning',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'metaDescription',
        currentValue: `${metaDesc.length} chars`,
        recommended: '120–160 characters',
        message: `Meta description exceeds 165 characters (${metaDesc.length} chars).`,
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaDescription'),
        module: mod,
      });
    } else {
      const descKey = metaDesc.toLowerCase();
      if (seenDescs.has(descKey)) {
        const prev = seenDescs.get(descKey)!;
        issues.push({
          id: `${id}-dup-desc`,
          severity: 'warning',
          entityType,
          entityId: id,
          entityTitle,
          slug,
          field: 'metaDescription',
          currentValue: `${metaDesc.slice(0, 60)}…`,
          recommended: 'Unique meta description per page/record',
          message: `Duplicate meta description also used by ${prev.type} "${prev.title}".`,
          deepLink: getEntityDeepLink(entityType, id, 'seo', 'metaDescription'),
          module: mod,
        });
      } else {
        seenDescs.set(descKey, { type: entityType, id, title: entityTitle });
      }
    }

    if (canonical && !isValidUrl(canonical)) {
      issues.push({
        id: `${id}-invalid-canonical`,
        severity: 'error',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'canonicalUrl',
        currentValue: canonical,
        recommended: `https://ryzite.lk${slug.startsWith('/') ? slug : `/${slug}`}`,
        message: 'Canonical URL is not a valid http(s) URL.',
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'canonicalUrl'),
        module: mod,
      });
    }

    if (!ogImage && !globalSeo?.defaultOgImage) {
      issues.push({
        id: `${id}-missing-og`,
        severity: 'warning',
        entityType,
        entityId: id,
        entityTitle,
        slug,
        field: 'ogImage',
        currentValue: '(empty)',
        recommended: 'Select an OG image from Media Library',
        message: 'Missing OpenGraph social preview image.',
        deepLink: getEntityDeepLink(entityType, id, 'seo', 'ogImage'),
        module: mod,
      });
    }
  };

  const pages = await listDocuments<WebsitePage>('page');
  for (const p of pages) {
    checkSeoEntity('page', p.id, p.title, p.slug || '/', p.seo);
    const visibleBlocks = (p.blocks || []).filter((b) => b.visible !== false);
    const h1s = visibleBlocks.filter(
      (b) => b.type === 'hero' || (b.type === 'heading' && b.level === 1)
    );
    if (h1s.length === 0) {
      issues.push({
        id: `${p.id}-no-h1`,
        severity: 'error',
        entityType: 'page',
        entityId: p.id,
        entityTitle: p.title,
        slug: p.slug || '/',
        field: 'headings',
        currentValue: '0 H1 sections',
        recommended: 'Exactly 1 Hero or H1 heading block',
        message: 'Page has no Hero or H1 heading block.',
        deepLink: getEntityDeepLink('page', p.id, 'content', 'headings'),
        module: 'page',
      });
    } else if (h1s.length > 1) {
      issues.push({
        id: `${p.id}-multi-h1`,
        severity: 'warning',
        entityType: 'page',
        entityId: p.id,
        entityTitle: p.title,
        slug: p.slug || '/',
        field: 'headings',
        currentValue: `${h1s.length} H1 sections`,
        recommended: 'Exactly 1 H1 heading per page',
        message: `Page contains ${h1s.length} H1/Hero headings (best practice is a single H1).`,
        deepLink: getEntityDeepLink('page', p.id, 'content', 'headings'),
        module: 'page',
      });
    }
    for (const b of visibleBlocks) {
      if ((b.type === 'image' || b.type === 'hero') && b.imageUrl && !(b.imageAlt || '').trim()) {
        issues.push({
          id: `${p.id}-img-alt-${b.id}`,
          severity: 'warning',
          entityType: 'page',
          entityId: p.id,
          entityTitle: p.title,
          slug: p.slug || '/',
          field: 'imageAlt',
          currentValue: '(empty)',
          recommended: 'Descriptive alt text for accessibility & SEO',
          message: `An image on "${p.title}" is missing alt text.`,
          deepLink: getEntityDeepLink('page', p.id, 'content', 'imageAlt'),
          module: 'page',
        });
      }
    }
  }

  for (const type of ['project', 'service', 'solution', 'article'] as const) {
    const docs = await listDocuments<any>(type);
    for (const d of docs) {
      checkSeoEntity(type, d.id, getEntityTitle(d), d.slug || '', d.seo);
      const imgUrl = d.featuredImageUrl || d.thumbnailUrl || d.imageUrl || '';
      const imgAlt = d.featuredImageAlt || d.thumbnailAlt || d.imageAlt || '';
      if (imgUrl && !imgAlt.trim()) {
        issues.push({
          id: `${d.id}-img-alt`,
          severity: 'warning',
          entityType: type,
          entityId: d.id,
          entityTitle: getEntityTitle(d),
          slug: d.slug || '',
          field: 'imageAlt',
          currentValue: '(empty)',
          recommended: 'Descriptive alt text for the cover image',
          message: `Cover image for "${getEntityTitle(d)}" is missing alt text.`,
          deepLink: getEntityDeepLink(type, d.id, 'content', 'imageAlt'),
          module: moduleOf(type),
        });
      }
    }
  }

  const mediaRows = await dbAll<{ id: string; original_name: string; title: string | null }>(
    "SELECT id, original_name, title FROM media_assets WHERE mime_type LIKE 'image/%' AND trim(COALESCE(alt_text, '')) = ''"
  );
  for (const m of mediaRows) {
    issues.push({
      id: `${m.id}-media-alt`,
      severity: 'warning',
      entityType: 'media',
      entityId: m.id,
      entityTitle: m.title || m.original_name,
      slug: m.original_name,
      field: 'altText',
      currentValue: '(empty)',
      recommended: 'Concise alt text describing the image',
      message: 'Image in Media Library is missing alt text.',
      deepLink: `/admin/media/${m.id}?field=altText`,
      module: 'media',
    });
  }

  const moduleCounts = {
    page: 0,
    service: 0,
    solution: 0,
    article: 0,
    portfolio: 0,
    media: 0,
    global: 0,
    total: issues.length,
  };
  for (const issue of issues) {
    if (issue.module in moduleCounts) {
      moduleCounts[issue.module]++;
    }
  }

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    infoCount: issues.filter((i) => i.severity === 'info').length,
    moduleCounts,
    checkedAt: new Date().toISOString(),
  };
}
