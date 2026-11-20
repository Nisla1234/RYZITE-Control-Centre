export type ContentStatus = 'draft' | 'published';

export type AdminRole = 'super_admin' | 'admin' | 'editor';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: AdminRole;
  avatarUrl?: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SeoFields {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
}

export type PageBlockType =
  | 'hero'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'cta'
  | 'list'
  | 'cards'
  | 'stats'
  | 'faq'
  | 'contact';

export interface PageBlock {
  id: string;
  type: PageBlockType;
  visible?: boolean;
  level?: 1 | 2 | 3; // for heading
  text?: string; // for heading, paragraph (supports **bold**, *italic*, [label](url))
  eyebrow?: string; // for hero
  subtitle?: string; // for hero / section intro
  primaryButtonText?: string; // for hero
  primaryButtonUrl?: string; // for hero
  secondaryButtonText?: string; // for hero
  secondaryButtonUrl?: string; // for hero
  items?: string[]; // for list
  mediaId?: string; // linked Media Library asset ID
  imageUrl?: string; // for image / hero
  imageAlt?: string; // for image / hero
  caption?: string; // for image
  ctaHeading?: string; // for cta
  ctaBody?: string; // for cta
  ctaButtonText?: string; // for cta
  ctaButtonUrl?: string; // for cta
  cards?: { title: string; description: string; linkText?: string; linkUrl?: string; imageUrl?: string; mediaId?: string }[];
  stats?: { value: string; label: string; note?: string }[];
  faqs?: { question: string; answer: string }[];
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
}

export interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  blocks: PageBlock[];
  seo: SeoFields;
  updatedAt: string;
  updatedBy: string;
  publishedAt?: string | null;
  publishedBy?: string | null;
  hasUnpublishedChanges?: boolean;
}

export interface ContentRevision {
  id: string;
  docType: string;
  docId: string;
  action: string;
  status: ContentStatus;
  data: any;
  summary: string;
  createdAt: string;
  createdBy: string;
}

export interface PortfolioProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  technologies: string[];
  projectUrl: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  thumbnailMediaId?: string;
  gallery: { url: string; alt: string; mediaId?: string }[];
  featured: boolean;
  displayOrder: number;
  status: ContentStatus;
  seo: SeoFields;
  updatedAt: string;
  updatedBy: string;
}

export interface ServiceOrSolution {
  id: string;
  type: 'service' | 'solution';
  title: string;
  slug: string;
  category: string;
  summary: string;
  description: string;
  iconName: string;
  imageUrl: string;
  imageAlt: string;
  imageMediaId?: string;
  features: string[];
  benefits: string[];
  ctaText: string;
  ctaUrl: string;
  displayOrder: number;
  status: ContentStatus;
  seo: SeoFields;
  updatedAt: string;
  updatedBy: string;
}

export interface TeamMember {
  id: string;
  name: string;
  jobTitle: string;
  department: string;
  bio: string;
  avatarUrl: string;
  avatarAlt: string;
  avatarMediaId?: string;
  socialLinks: {
    linkedin?: string;
    github?: string;
    twitter?: string;
    website?: string;
  };
  displayOrder: number;
  status: ContentStatus;
  updatedAt: string;
  updatedBy: string;
}

export interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  featuredImageMediaId?: string;
  author: string;
  categories: string[];
  tags: string[];
  publishedAt: string;
  status: ContentStatus;
  seo: SeoFields;
  updatedAt: string;
  updatedBy: string;
}

export interface TestimonialItem {
  id: string;
  quote: string;
  customerName: string;
  role: string;
  company: string;
  avatarUrl: string;
  avatarAlt: string;
  avatarMediaId?: string;
  rating: number;
  displayOrder: number;
  status: ContentStatus;
  updatedAt: string;
  updatedBy: string;
}

export interface MediaUsageRef {
  entityType: string;
  entityId: string;
  entityTitle: string;
  field: string;
  deepLink: string;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText: string;
  title?: string;
  caption?: string;
  description?: string;
  category?: string;
  focalPoint?: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  version?: number;
  source: 'sanity' | 'local' | 'database' | 'main-site';
  uploadedBy: string;
  uploadedAt: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  usageCount?: number;
  usedIn?: MediaUsageRef[];
  duplicateOf?: string | null;
}

export interface GlobalSeoSettings {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  defaultOgImage: string;
  defaultOgMediaId?: string;
  robotsDirectives: string;
  sitemapEnabled: boolean;
  sessionTimeoutHours: number;
  updatedAt: string;
  updatedBy: string;
}

export interface SeoIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  entityType: string;
  entityId: string;
  entityTitle: string;
  slug?: string;
  field: string;
  currentValue?: string;
  recommended?: string;
  message: string;
  deepLink: string;
  module: 'page' | 'service' | 'solution' | 'article' | 'portfolio' | 'media' | 'global';
}

export interface SeoAuditResult {
  issues: SeoIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  moduleCounts: {
    page: number;
    service: number;
    solution: number;
    article: number;
    portfolio: number;
    media: number;
    global: number;
    total: number;
  };
  checkedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  adminUsername: string;
  adminName: string;
  action: string;
  contentType: string;
  recordId: string;
  recordTitle: string;
  result: 'success' | 'failure';
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface AdminAccessRequest {
  id: string;
  fullName: string;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAdminId: string | null;
  requestedIp: string;
  createdAt: string;
}

export interface IntegrationStatus {
  sanity: {
    projectId: string;
    dataset: string;
    apiVersion: string;
    writeTokenConfigured: boolean;
    reachable: boolean;
    mode: 'sanity_live' | 'local_staging';
    existingTypes: string[];
    message: string;
  };
  ga4: {
    configured: boolean;
    propertyId: string | null;
    missingVars: string[];
    message: string;
  };
  database?: {
    engine: 'postgresql' | 'sqlite';
    connected: boolean;
    persistent: boolean;
    message: string;
  };
  email?: {
    configured: boolean;
    provider: 'resend';
    fromAddress: string | null;
    notificationRecipients: string[];
    missingVars: string[];
    message: string;
  };
  environment: {
    nodeEnv: string;
    siteUrl: string;
    appUrl: string;
    sessionTtlHours: number;
  };
}

export interface AnalyticsDateRange {
  preset: 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
}

export interface AnalyticsReport {
  configured: boolean;
  error?: string;
  missingVars?: string[];
  propertyId?: string;
  dateRange: { startDate: string; endDate: string; label: string };
  summary?: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
    sessions: number;
    pageViews: number;
    engagementRate: number;
    avgEngagementDurationSec: number;
  };
  dailyTrend?: { date: string; users: number; sessions: number; pageViews: number }[];
  topPages?: { path: string; title: string; views: number; users: number; avgDurationSec: number }[];
  landingPages?: { path: string; sessions: number; engagementRate: number }[];
  channels?: { channel: string; sessions: number; users: number }[];
  sources?: { sourceMedium: string; sessions: number; users: number }[];
  countries?: { country: string; users: number; sessions: number }[];
  cities?: { city: string; country: string; users: number }[];
  devices?: { device: string; users: number; sharePct: number }[];
  browsers?: { browser: string; users: number; sharePct: number }[];
}
