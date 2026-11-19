import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'ryzite-cms.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      avatar_url TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      attempted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_username TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      content_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      record_title TEXT NOT NULL,
      result TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cms_documents (
      id TEXT PRIMARY KEY,
      doc_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cms_doc_type ON cms_documents(doc_type);

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      alt_text TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'local',
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
  `);

  // Safe non-destructive migration for existing admin_users tables
  const adminCols = db.prepare('PRAGMA table_info(admin_users)').all() as { name: string }[];
  if (!adminCols.some((c) => c.name === 'avatar_url')) {
    db.exec('ALTER TABLE admin_users ADD COLUMN avatar_url TEXT');
  }

  // Provision initial administrator account from env or safe initial dev bootstrap
  const existingAdmin = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (!existingAdmin) {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const password = process.env.ADMIN_PASSWORD || 'RyziteAdmin2026!';
    const name = process.env.ADMIN_NAME || 'RYZITE Administrator';
    const email = process.env.ADMIN_EMAIL || 'admin@ryzite.com';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
      VALUES (?, ?, ?, ?, ?, 'super_admin', ?)
    `).run(crypto.randomUUID(), username, hashPassword(password), name, email, now);
  }

  // Provision default site settings if empty
  const existingSettings = db.prepare('SELECT key FROM site_settings WHERE key = ?').get('global_seo');
  if (!existingSettings) {
    const now = new Date().toISOString();
    const defaults = {
      siteTitle: 'RYZITE — Enterprise Digital Engineering & Technology Solutions',
      siteDescription: 'RYZITE designs and builds high-reliability web platforms, cloud architectures, and custom software solutions for ambitious organisations.',
      siteUrl: process.env.SITE_URL || 'https://ryzite.com',
      defaultOgImage: '/assets/branding/ryzite-logo.png',
      robotsDirectives: 'index, follow',
      sitemapEnabled: true,
      sessionTimeoutHours: Number(process.env.SESSION_TTL_HOURS || 24),
      updatedAt: now,
      updatedBy: 'system',
    };
    db.prepare(`
      INSERT INTO site_settings (key, value_json, updated_at, updated_by)
      VALUES ('global_seo', ?, ?, 'system')
    `).run(JSON.stringify(defaults), now);
  }

  // Seed initial staging records only if cms_documents is completely empty
  // (Never touches Sanity production dataset hnm8jy5w)
  const docCount = (db.prepare('SELECT COUNT(*) as count FROM cms_documents').get() as { count: number }).count;
  if (docCount === 0) {
    seedStagingDocuments();
  }
}

function seedStagingDocuments() {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO cms_documents (id, doc_type, status, data_json, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const pages = [
    {
      id: 'page-home',
      title: 'Home',
      slug: '/',
      status: 'published',
      blocks: [
        { id: 'b1', type: 'heading', level: 1, text: 'Engineering Resilient Digital Platforms for Modern Enterprises' },
        { id: 'b2', type: 'paragraph', text: 'RYZITE partners with forward-thinking organisations to architect scalable web applications, cloud infrastructure, and tailored software systems.' },
        { id: 'b3', type: 'heading', level: 2, text: 'Built for Measurable Operational Velocity' },
        { id: 'b4', type: 'list', items: ['Full-stack cloud and edge web engineering', 'Headless CMS and digital commerce modernisation', 'Security-first architecture and observability'] },
        { id: 'b5', type: 'cta', ctaHeading: 'Ready to modernise your digital stack?', ctaBody: 'Speak with RYZITE engineering leadership to scope your next platform release.', ctaButtonText: 'Schedule a Technical Briefing', ctaButtonUrl: '/contact' },
      ],
      seo: {
        metaTitle: 'RYZITE | Enterprise Digital Engineering & Cloud Platforms',
        metaDescription: 'RYZITE builds high-performance web applications, cloud systems, and tailored software platforms for modern enterprises.',
        canonicalUrl: 'https://ryzite.com/',
        ogTitle: 'RYZITE — Enterprise Digital Engineering',
        ogDescription: 'High-performance web applications and cloud architecture engineered by RYZITE.',
        ogImage: '',
        noIndex: false,
      },
      updatedAt: now,
      updatedBy: 'admin',
      publishedAt: now,
    },
    {
      id: 'page-about',
      title: 'About RYZITE',
      slug: '/about',
      status: 'published',
      blocks: [
        { id: 'b1', type: 'heading', level: 1, text: 'Precision Engineering Driven by Long-Term Outcomes' },
        { id: 'b2', type: 'paragraph', text: 'Founded by systems architects and product designers, RYZITE delivers software that balances architectural discipline with intuitive human experience.' },
        { id: 'b3', type: 'heading', level: 2, text: 'Our Delivery Principles' },
        { id: 'b4', type: 'paragraph', text: 'Every engagement starts with measurable technical discovery, transparent milestones, and security-by-default implementation.' },
      ],
      seo: {
        metaTitle: 'About RYZITE | Our Engineering Philosophy & Leadership',
        metaDescription: 'Learn how RYZITE combines systems engineering, cloud reliability, and product design to deliver enterprise software.',
        canonicalUrl: 'https://ryzite.com/about',
        ogTitle: 'About RYZITE',
        ogDescription: 'Systems engineering and digital product leadership at RYZITE.',
        ogImage: '',
        noIndex: false,
      },
      updatedAt: now,
      updatedBy: 'admin',
      publishedAt: now,
    },
    {
      id: 'page-contact',
      title: 'Contact',
      slug: '/contact',
      status: 'draft',
      blocks: [
        { id: 'b1', type: 'heading', level: 1, text: 'Start a Conversation with RYZITE' },
        { id: 'b2', type: 'paragraph', text: 'Share your project goals, timeline, and technical context. Our solution architects respond within one business day.' },
      ],
      seo: {
        metaTitle: 'Contact RYZITE | Start Your Engineering Project',
        metaDescription: 'Connect with RYZITE for web engineering, cloud modernisation, and enterprise platform architecture.',
        canonicalUrl: 'https://ryzite.com/contact',
        ogTitle: 'Contact RYZITE',
        ogDescription: 'Reach out to RYZITE engineering teams.',
        ogImage: '',
        noIndex: false,
      },
      updatedAt: now,
      updatedBy: 'admin',
      publishedAt: null,
    },
  ];

  for (const p of pages) {
    insert.run(p.id, 'page', p.status, JSON.stringify(p), now, 'admin');
  }

  const projects = [
    {
      id: 'proj-finledger',
      name: 'FinLedger Treasury Portal',
      slug: 'finledger-treasury-portal',
      description: 'Multi-currency institutional treasury dashboard with real-time settlement workflows, role-based approvals, and immutable audit trails.',
      category: 'FinTech & Enterprise',
      technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Cloudflare'],
      projectUrl: 'https://ryzite.com/portfolio/finledger-treasury-portal',
      thumbnailUrl: '',
      thumbnailAlt: 'FinLedger Treasury Portal interface overview',
      gallery: [],
      featured: true,
      displayOrder: 1,
      status: 'published',
      seo: {
        metaTitle: 'FinLedger Treasury Portal Case Study | RYZITE',
        metaDescription: 'How RYZITE engineered a multi-currency institutional treasury platform with sub-second reporting.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
    {
      id: 'proj-medsync',
      name: 'MedSync Clinical Operations Suite',
      slug: 'medsync-clinical-operations',
      description: 'HIPAA-aligned scheduling, diagnostic intake, and multi-clinic resource coordination platform serving 18 regional facilities.',
      category: 'Healthcare Systems',
      technologies: ['Astro', 'React', 'Sanity CMS', 'AWS'],
      projectUrl: 'https://ryzite.com/portfolio/medsync-clinical-operations',
      thumbnailUrl: '',
      thumbnailAlt: 'MedSync Clinical Operations dashboard',
      gallery: [],
      featured: true,
      displayOrder: 2,
      status: 'published',
      seo: {
        metaTitle: 'MedSync Clinical Operations Case Study | RYZITE',
        metaDescription: 'Scalable clinical coordination platform engineered by RYZITE for regional healthcare networks.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const p of projects) {
    insert.run(p.id, 'project', p.status, JSON.stringify(p), now, 'admin');
  }

  const services = [
    {
      id: 'srv-web-eng',
      type: 'service',
      title: 'Enterprise Web Engineering',
      slug: 'enterprise-web-engineering',
      category: 'Engineering',
      summary: 'High-availability web applications built with TypeScript, React, Astro, and edge-first architectures.',
      description: 'We architect and deliver mission-critical web platforms optimised for Core Web Vitals, accessibility, and long-term maintainability.',
      iconName: 'Code2',
      imageUrl: '',
      imageAlt: 'Enterprise Web Engineering',
      features: ['TypeScript full-stack architecture', 'Headless CMS & Sanity integration', 'Automated CI/CD & observability'],
      benefits: ['Faster release velocity', 'Reduced infrastructure latency', 'Zero vendor lock-in'],
      ctaText: 'Discuss Your Web Platform',
      ctaUrl: '/contact',
      displayOrder: 1,
      status: 'published',
      seo: {
        metaTitle: 'Enterprise Web Engineering Services | RYZITE',
        metaDescription: 'Custom TypeScript, React, and Astro web engineering services for scalable enterprise platforms.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
    {
      id: 'srv-cloud-arch',
      type: 'service',
      title: 'Cloud Architecture & DevSecOps',
      slug: 'cloud-architecture-devsecops',
      category: 'Infrastructure',
      summary: 'Resilient multi-region cloud environments with zero-trust security posture and automated deployment pipelines.',
      description: 'From legacy migration to serverless edge orchestration, RYZITE secures and optimises cloud workloads.',
      iconName: 'Shield',
      imageUrl: '',
      imageAlt: 'Cloud Architecture & DevSecOps',
      features: ['Infrastructure as Code', 'Zero-trust identity & secrets management', 'Cost & performance telemetry'],
      benefits: ['99.99% uptime architecture', 'Audit-ready compliance controls', 'Predictable cloud spend'],
      ctaText: 'Request Architecture Review',
      ctaUrl: '/contact',
      displayOrder: 2,
      status: 'published',
      seo: {
        metaTitle: 'Cloud Architecture & DevSecOps | RYZITE',
        metaDescription: 'Secure, scalable cloud infrastructure and DevSecOps engineering by RYZITE.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const s of services) {
    insert.run(s.id, 'service', s.status, JSON.stringify(s), now, 'admin');
  }

  const solutions = [
    {
      id: 'sol-headless-cms',
      type: 'solution',
      title: 'Headless CMS Modernisation',
      slug: 'headless-cms-modernisation',
      category: 'Digital Experience',
      summary: 'Structured content operations powered by Sanity CMS and high-speed static/hybrid frontends.',
      description: 'Replace rigid monolithic CMS installations with structured, multi-channel content pipelines that empower editorial teams without sacrificing engineering control.',
      iconName: 'Layers',
      imageUrl: '',
      imageAlt: 'Headless CMS Modernisation',
      features: ['Real-time editorial preview', 'Granular role-based governance', 'Automated SEO & structured metadata'],
      benefits: ['Instant publishing workflows', 'Consistent omnichannel content', 'Hardened security surface'],
      ctaText: 'Explore CMS Modernisation',
      ctaUrl: '/contact',
      displayOrder: 1,
      status: 'published',
      seo: {
        metaTitle: 'Headless CMS Modernisation Solutions | RYZITE',
        metaDescription: 'Modernise legacy websites with Sanity headless CMS and high-speed frontends engineered by RYZITE.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const s of solutions) {
    insert.run(s.id, 'solution', s.status, JSON.stringify(s), now, 'admin');
  }

  const team = [
    {
      id: 'team-1',
      name: 'Nadia Al-Mansoor',
      jobTitle: 'Principal Systems Architect',
      department: 'Engineering',
      bio: 'Leads cloud platform architecture, distributed systems reliability, and technical governance across RYZITE enterprise engagements.',
      avatarUrl: '',
      avatarAlt: 'Nadia Al-Mansoor portrait',
      socialLinks: { linkedin: 'https://linkedin.com', github: 'https://github.com' },
      displayOrder: 1,
      status: 'published',
      updatedAt: now,
      updatedBy: 'admin',
    },
    {
      id: 'team-2',
      name: 'Daniel Lindholm',
      jobTitle: 'Head of Product Design',
      department: 'Design',
      bio: 'Directs design systems, interaction architecture, and enterprise UX standards for RYZITE client platforms.',
      avatarUrl: '',
      avatarAlt: 'Daniel Lindholm portrait',
      socialLinks: { linkedin: 'https://linkedin.com' },
      displayOrder: 2,
      status: 'published',
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const t of team) {
    insert.run(t.id, 'team', t.status, JSON.stringify(t), now, 'admin');
  }

  const articles = [
    {
      id: 'art-1',
      title: 'Designing Structured Content Models for Multi-Region Websites',
      slug: 'structured-content-models-multi-region',
      excerpt: 'How schema-first CMS architecture prevents content drift and accelerates enterprise publishing teams.',
      body: '## Why Flat Pages Break Down at Scale\n\nWhen growing organisations manage dozens of service pages, case studies, and landing campaigns, unstructured rich-text blobs quickly create layout inconsistency.\n\n## Block-Based Governance\n\nBy modelling content into explicit heading hierarchies, validated metadata, and reusable call-to-action blocks, engineering and editorial teams ship faster without compromising brand consistency.',
      featuredImageUrl: '',
      featuredImageAlt: 'Structured content model diagram',
      author: 'Nadia Al-Mansoor',
      categories: ['Architecture', 'CMS'],
      tags: ['Sanity', 'TypeScript', 'Content Modelling'],
      publishedAt: now.slice(0, 10),
      status: 'published',
      seo: {
        metaTitle: 'Structured Content Models for Multi-Region Websites | RYZITE',
        metaDescription: 'Learn how schema-first CMS architecture keeps enterprise websites consistent and fast.',
      },
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const a of articles) {
    insert.run(a.id, 'article', a.status, JSON.stringify(a), now, 'admin');
  }

  const testimonials = [
    {
      id: 'test-1',
      quote: 'RYZITE rebuilt our customer platform ahead of schedule and cut page load times by 64%, directly improving enterprise trial conversions.',
      customerName: 'Marcus Vance',
      role: 'VP of Digital Operations',
      company: 'FinLedger Group',
      avatarUrl: '',
      avatarAlt: 'Marcus Vance',
      rating: 5,
      displayOrder: 1,
      status: 'published',
      updatedAt: now,
      updatedBy: 'admin',
    },
  ];
  for (const t of testimonials) {
    insert.run(t.id, 'testimonial', t.status, JSON.stringify(t), now, 'admin');
  }
}

export function logAudit(params: {
  adminUsername: string;
  adminName: string;
  action: string;
  contentType: string;
  recordId: string;
  recordTitle: string;
  result: 'success' | 'failure';
  details: string;
  ipAddress: string;
}) {
  db.prepare(`
    INSERT INTO audit_logs (
      id, admin_username, admin_name, action, content_type,
      record_id, record_title, result, details, ip_address, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    params.adminUsername,
    params.adminName,
    params.action,
    params.contentType,
    params.recordId,
    params.recordTitle,
    params.result,
    params.details,
    params.ipAddress,
    new Date().toISOString()
  );
}
