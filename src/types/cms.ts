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

export type PageBlockType = 'heading' | 'paragraph' | 'image' | 'cta' | 'list';

export interface PageBlock {
  id: string;
  type: PageBlockType;
  level?: 1 | 2 | 3; // for heading
  text?: string; // for heading, paragraph (supports **bold**, *italic*, [label](url))
  items?: string[]; // for list
  imageUrl?: string; // for image
  imageAlt?: string; // for image
  caption?: string; // for image
  ctaHeading?: string; // for cta
  ctaBody?: string; // for cta
  ctaButtonText?: string; // for cta
  ctaButtonUrl?: string; // for cta
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
  gallery: { url: string; alt: string }[];
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
  rating: number;
  displayOrder: number;
  status: ContentStatus;
  updatedAt: string;
  updatedBy: string;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText: string;
  source: 'sanity' | 'local';
  uploadedBy: string;
  uploadedAt: string;
}

export interface GlobalSeoSettings {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  defaultOgImage: string;
  robotsDirectives: string;
  sitemapEnabled: boolean;
  sessionTimeoutHours: number;
  updatedAt: string;
  updatedBy: string;
}

export interface SeoIssue {
  id: string;
  severity: 'error' | 'warning';
  entityType: string;
  entityId: string;
  entityTitle: string;
  field: string;
  message: string;
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
