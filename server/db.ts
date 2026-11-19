import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export type DbEngine = 'postgresql' | 'sqlite';

let pgPool: Pool | null = null;
let sqliteDb: any = null;
let initPromise: Promise<void> | null = null;

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.NETLIFY === 'true');

function getPostgresUrl(): string | null {
  const url = (
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
  return url.length > 0 ? url : null;
}

export function getDbEngine(): DbEngine {
  return getPostgresUrl() ? 'postgresql' : 'sqlite';
}

function getPgPool(): Pool {
  if (!pgPool) {
    const connectionString = getPostgresUrl();
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured.');
    }
    const isLocalhost =
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pgPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: isLocalhost ? undefined : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

async function getSqliteDb(): Promise<any> {
  if (!sqliteDb) {
    if (IS_SERVERLESS) {
      throw new Error(
        'DATABASE_URL is required in serverless production (Vercel/Netlify). Configure your Neon PostgreSQL connection string in Environment Variables.'
      );
    }
    const modName = 'better-sqlite3';
    const { default: Database } = await import(/* @vite-ignore */ modName);
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'ryzite-cms.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}

// Convert PostgreSQL $1, $2 placeholders to SQLite ? placeholders
function toSqliteSql(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const mappedParams: unknown[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_match, numStr) => {
    const idx = Number(numStr) - 1;
    mappedParams.push(params[idx]);
    return '?';
  });
  return { sql: converted, params: mappedParams };
}

export async function dbAll<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (getDbEngine() === 'postgresql') {
    const res = await getPgPool().query(sql, params);
    return res.rows as T[];
  }
  const db = await getSqliteDb();
  const { sql: s, params: p } = toSqliteSql(sql, params);
  return db.prepare(s).all(...p) as T[];
}

export async function dbGet<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, params);
  return rows[0];
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  if (getDbEngine() === 'postgresql') {
    const res = await getPgPool().query(sql, params);
    return { changes: res.rowCount ?? 0 };
  }
  const db = await getSqliteDb();
  const { sql: s, params: p } = toSqliteSql(sql, params);
  const info = db.prepare(s).run(...p);
  return { changes: info.changes ?? 0 };
}

export async function getDatabaseStatus(): Promise<{
  engine: DbEngine;
  connected: boolean;
  persistent: boolean;
  message: string;
}> {
  const engine = getDbEngine();
  try {
    await ensureDatabaseReady();
    await dbGet('SELECT 1 as ok');
    if (engine === 'postgresql') {
      return {
        engine: 'postgresql',
        connected: true,
        persistent: true,
        message: 'Connected to Neon PostgreSQL database via DATABASE_URL.',
      };
    }
    return {
      engine: 'sqlite',
      connected: true,
      persistent: !IS_SERVERLESS,
      message: 'Connected to local SQLite database (data/ryzite-cms.db). Set DATABASE_URL for Neon PostgreSQL in production.',
    };
  } catch (err: any) {
    return {
      engine,
      connected: false,
      persistent: false,
      message: err?.message || 'Database connection failed.',
    };
  }
}

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

export function ensureDatabaseReady(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function initDatabase(): Promise<void> {
  const engine = getDbEngine();

  if (engine === 'postgresql') {
    const pool = getPgPool();
    await pool.query(`
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
        user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        identifier TEXT NOT NULL,
        attempted_at BIGINT NOT NULL
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
    await pool.query('ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT');
  } else {
    const db = await getSqliteDb();
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

    const adminCols = db.prepare('PRAGMA table_info(admin_users)').all() as { name: string }[];
    if (!adminCols.some((c) => c.name === 'avatar_url')) {
      db.exec('ALTER TABLE admin_users ADD COLUMN avatar_url TEXT');
    }
  }

  // Provision initial administrator account from env vars ONLY if admin_users is empty
  const existingAdmin = await dbGet('SELECT id FROM admin_users LIMIT 1');
  if (!existingAdmin) {
    const envUsername = (process.env.ADMIN_USERNAME || '').trim();
    const envPassword = process.env.ADMIN_PASSWORD || '';
    const isProduction = process.env.NODE_ENV === 'production' || IS_SERVERLESS;

    // In production/serverless, require explicit ADMIN_USERNAME & ADMIN_PASSWORD env vars
    if (isProduction && (!envUsername || !envPassword)) {
      console.warn(
        '[RYZITE Auth] No admin account exists yet. Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables (or run npm run admin:reset against DATABASE_URL) to provision the administrator.'
      );
    } else {
      const username = envUsername || 'admin';
      const password = envPassword || 'RyziteAdmin2026!';
      const name = process.env.ADMIN_NAME || 'RYZITE Administrator';
      const email = process.env.ADMIN_EMAIL || 'admin@ryzite.com';
      const now = new Date().toISOString();

      await dbRun(
        `INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
         VALUES ($1, $2, $3, $4, $5, 'super_admin', $6)`,
        [crypto.randomUUID(), username, hashPassword(password), name, email, now]
      );
    }
  }

  // Provision default site settings if empty
  const existingSettings = await dbGet('SELECT key FROM site_settings WHERE key = $1', ['global_seo']);
  if (!existingSettings) {
    const now = new Date().toISOString();
    const defaults = {
      siteTitle: 'RYZITE — Enterprise Digital Engineering & Technology Solutions',
      siteDescription:
        'RYZITE designs and builds high-reliability web platforms, cloud architectures, and custom software solutions for ambitious organisations.',
      siteUrl: process.env.SITE_URL || 'https://ryzite.com',
      defaultOgImage: '/assets/branding/ryzite-logo.png',
      robotsDirectives: 'index, follow',
      sitemapEnabled: true,
      sessionTimeoutHours: Number(process.env.SESSION_TTL_HOURS || 24),
      updatedAt: now,
      updatedBy: 'system',
    };
    await dbRun(
      `INSERT INTO site_settings (key, value_json, updated_at, updated_by)
       VALUES ('global_seo', $1, $2, 'system')`,
      [JSON.stringify(defaults), now]
    );
  }

  // Seed initial staging CMS records only if cms_documents is completely empty
  const countRow = await dbGet<{ count: string | number }>('SELECT COUNT(*) as count FROM cms_documents');
  const docCount = Number(countRow?.count || 0);
  if (docCount === 0) {
    await seedStagingDocuments();
  }
}

async function seedStagingDocuments() {
  const now = new Date().toISOString();
  const insertSql = `
    INSERT INTO cms_documents (id, doc_type, status, data_json, updated_at, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

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
  ];

  for (const p of pages) {
    await dbRun(insertSql, [p.id, 'page', p.status, JSON.stringify(p), now, 'admin']);
  }
}

export async function logAudit(params: {
  adminUsername: string;
  adminName: string;
  action: string;
  contentType: string;
  recordId: string;
  recordTitle: string;
  result: 'success' | 'failure';
  details: string;
  ipAddress: string;
}): Promise<void> {
  await dbRun(
    `INSERT INTO audit_logs (
      id, admin_username, admin_name, action, content_type,
      record_id, record_title, result, details, ip_address, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
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
      new Date().toISOString(),
    ]
  );
}
