import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export type DbEngine = 'postgresql' | 'sqlite';

let pgPool: Pool | null = null;
let sqliteDb: any = null;
let initPromise: Promise<void> | null = null;

export type CredentialSyncStatus =
  | 'disabled'
  | 'provisioned'
  | 'synced'
  | 'up_to_date'
  | 'skipped_missing_env'
  | 'skipped_short_password';

let lastCredentialSyncStatus: CredentialSyncStatus = 'disabled';

export function getCredentialSyncStatus(): CredentialSyncStatus {
  return lastCredentialSyncStatus;
}

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.NETLIFY === 'true');

function cleanEnvValue(raw: string | undefined, trim = true): string {
  let val = (raw || '').replace(/[\r\n]+/g, '');
  if (trim) val = val.trim();
  if (
    val.length >= 2 &&
    ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
  ) {
    val = val.slice(1, -1);
  }
  return trim ? val.trim() : val;
}

function getPostgresUrl(): string | null {
  const url = cleanEnvValue(
    process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL
  );
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
    if (IS_SERVERLESS || process.env.NODE_ENV === 'production') {
      throw new Error(
        'DATABASE_URL is required in production (Vercel/Netlify). SQLite fallback is disabled; configure your Neon PostgreSQL connection string in Environment Variables.'
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
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  if (!salt || !key) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(key, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
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

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        requested_ip TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

      CREATE TABLE IF NOT EXISTS admin_access_requests (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_notes TEXT,
        created_admin_id TEXT,
        requested_ip TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON admin_access_requests(status);

      CREATE TABLE IF NOT EXISTS cms_revisions (
        id TEXT PRIMARY KEY,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        data_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cms_revisions_doc ON cms_revisions(doc_type, doc_id, created_at);
    `);
    await pool.query(`
      ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE cms_documents ADD COLUMN IF NOT EXISTS published_json TEXT;
      ALTER TABLE cms_documents ADD COLUMN IF NOT EXISTS published_at TEXT;
      ALTER TABLE cms_documents ADD COLUMN IF NOT EXISTS published_by TEXT;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS caption TEXT DEFAULT '';
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS focal_x DOUBLE PRECISION DEFAULT 50;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS focal_y DOUBLE PRECISION DEFAULT 50;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS width INTEGER;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS height INTEGER;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS sha256 TEXT;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS content_data_url TEXT;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS updated_at TEXT;
      ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS updated_by TEXT;
    `);
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

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        requested_ip TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

      CREATE TABLE IF NOT EXISTS admin_access_requests (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TEXT,
        review_notes TEXT,
        created_admin_id TEXT,
        requested_ip TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON admin_access_requests(status);

      CREATE TABLE IF NOT EXISTS cms_revisions (
        id TEXT PRIMARY KEY,
        doc_type TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        data_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cms_revisions_doc ON cms_revisions(doc_type, doc_id, created_at);
    `);

    const ensureSqliteColumn = (table: string, col: string, def: string) => {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    };

    ensureSqliteColumn('admin_users', 'avatar_url', 'TEXT');
    ensureSqliteColumn('cms_documents', 'published_json', 'TEXT');
    ensureSqliteColumn('cms_documents', 'published_at', 'TEXT');
    ensureSqliteColumn('cms_documents', 'published_by', 'TEXT');
    ensureSqliteColumn('media_assets', 'title', "TEXT DEFAULT ''");
    ensureSqliteColumn('media_assets', 'caption', "TEXT DEFAULT ''");
    ensureSqliteColumn('media_assets', 'description', "TEXT DEFAULT ''");
    ensureSqliteColumn('media_assets', 'category', "TEXT DEFAULT 'general'");
    ensureSqliteColumn('media_assets', 'focal_x', 'REAL DEFAULT 50');
    ensureSqliteColumn('media_assets', 'focal_y', 'REAL DEFAULT 50');
    ensureSqliteColumn('media_assets', 'width', 'INTEGER');
    ensureSqliteColumn('media_assets', 'height', 'INTEGER');
    ensureSqliteColumn('media_assets', 'sha256', 'TEXT');
    ensureSqliteColumn('media_assets', 'version', 'INTEGER DEFAULT 1');
    ensureSqliteColumn('media_assets', 'content_data_url', 'TEXT');
    ensureSqliteColumn('media_assets', 'updated_at', 'TEXT');
    ensureSqliteColumn('media_assets', 'updated_by', 'TEXT');
  }

  // Non-destructively backfill published_json for already-published documents
  await dbRun(
    `UPDATE cms_documents
     SET published_json = data_json,
         published_at = COALESCE(published_at, updated_at),
         published_by = COALESCE(published_by, updated_by)
     WHERE status = 'published' AND published_json IS NULL`
  );

  // Provision or securely sync the administrator account from server-side env vars
  const envUsername = cleanEnvValue(process.env.ADMIN_USERNAME, true);
  const envPassword = cleanEnvValue(process.env.ADMIN_PASSWORD, false);
  const syncFlag = cleanEnvValue(process.env.ADMIN_SYNC_CREDENTIALS, true).toLowerCase();
  const syncCredentials = syncFlag === 'true' || syncFlag === '1' || syncFlag === 'yes';
  const isProduction = process.env.NODE_ENV === 'production' || IS_SERVERLESS;

  type AdminRow = {
    id: string;
    username: string;
    name: string;
    email: string;
    role: string;
    password_hash: string;
  };

  // Prefer matching existing username first (avoids UNIQUE collisions), then super_admin, then oldest admin
  let existingAdmin: AdminRow | undefined;
  if (envUsername) {
    existingAdmin = await dbGet<AdminRow>(
      'SELECT id, username, name, email, role, password_hash FROM admin_users WHERE lower(trim(username)) = lower($1) LIMIT 1',
      [envUsername]
    );
  }
  if (!existingAdmin) {
    existingAdmin = await dbGet<AdminRow>(
      "SELECT id, username, name, email, role, password_hash FROM admin_users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1"
    );
  }
  if (!existingAdmin) {
    existingAdmin = await dbGet<AdminRow>(
      'SELECT id, username, name, email, role, password_hash FROM admin_users ORDER BY created_at ASC LIMIT 1'
    );
  }

  if (!existingAdmin) {
    // In production/serverless, require explicit ADMIN_USERNAME & ADMIN_PASSWORD env vars
    if (isProduction && (!envUsername || !envPassword)) {
      lastCredentialSyncStatus = 'skipped_missing_env';
      console.warn(
        '[RYZITE Auth] No admin account exists yet. Set ADMIN_USERNAME and ADMIN_PASSWORD environment variables (or run npm run admin:reset against DATABASE_URL) to provision the administrator.'
      );
    } else {
      const username = envUsername || 'admin';
      const password = envPassword || 'RyziteAdmin2026!';
      const name = cleanEnvValue(process.env.ADMIN_NAME, true) || 'RYZITE Administrator';
      const email = cleanEnvValue(process.env.ADMIN_EMAIL, true) || 'admin@ryzite.com';
      const now = new Date().toISOString();

      await dbRun(
        `INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
         VALUES ($1, $2, $3, $4, $5, 'super_admin', $6)`,
        [crypto.randomUUID(), username, hashPassword(password), name, email, now]
      );
      lastCredentialSyncStatus = 'provisioned';
    }
  } else if (syncCredentials) {
    if (!envUsername || !envPassword) {
      lastCredentialSyncStatus = 'skipped_missing_env';
      console.warn(
        '[RYZITE Auth] ADMIN_SYNC_CREDENTIALS is enabled, but ADMIN_USERNAME or ADMIN_PASSWORD is missing.'
      );
    } else if (envPassword.length < 8) {
      lastCredentialSyncStatus = 'skipped_short_password';
      console.warn(
        '[RYZITE Auth] ADMIN_SYNC_CREDENTIALS skipped because ADMIN_PASSWORD must be at least 8 characters.'
      );
    } else {
      // Idempotent opt-in sync: updates ONLY the existing admin row if username, role, or password differs
      const usernameChanged = existingAdmin.username.trim().toLowerCase() !== envUsername.toLowerCase();
      const passwordChanged = !verifyPassword(envPassword, existingAdmin.password_hash);
      const roleNeedsUpgrade = existingAdmin.role !== 'super_admin';

      if (usernameChanged || passwordChanged || roleNeedsUpgrade) {
        const targetName = cleanEnvValue(process.env.ADMIN_NAME, true) || existingAdmin.name;
        const targetEmail = cleanEnvValue(process.env.ADMIN_EMAIL, true) || existingAdmin.email;
        const nextHash = hashPassword(envPassword);

        await dbRun(
          "UPDATE admin_users SET username = $1, password_hash = $2, name = $3, email = $4, role = 'super_admin' WHERE id = $5",
          [envUsername, nextHash, targetName, targetEmail, existingAdmin.id]
        );
        await dbRun('DELETE FROM admin_sessions');
        await dbRun('DELETE FROM login_attempts');
        await logAudit({
          adminUsername: envUsername,
          adminName: targetName,
          action: 'sync_credentials',
          contentType: 'auth',
          recordId: existingAdmin.id,
          recordTitle: envUsername,
          result: 'success',
          details: `Administrator credentials synced via server-side ADMIN_SYNC_CREDENTIALS (${engine}). Prior sessions revoked.`,
          ipAddress: 'server-init',
        });
        lastCredentialSyncStatus = 'synced';
      } else {
        lastCredentialSyncStatus = 'up_to_date';
      }
    }
  } else {
    lastCredentialSyncStatus = 'disabled';
  }

  // Provision default site settings if empty, or upgrade legacy placeholder domain/long title
  const rawEnvSiteUrl = cleanEnvValue(process.env.SITE_URL, true);
  const resolvedDefaultSiteUrl =
    rawEnvSiteUrl && !rawEnvSiteUrl.includes('your-ryzite-domain') && rawEnvSiteUrl !== 'https://ryzite.com'
      ? rawEnvSiteUrl
      : 'https://ryzite.lk';

  const existingSettings = await dbGet<{ value_json: string }>(
    'SELECT value_json FROM site_settings WHERE key = $1',
    ['global_seo']
  );
  if (!existingSettings) {
    const now = new Date().toISOString();
    const defaults = {
      siteTitle: 'RYZITE — Digital Engineering & Technology Solutions',
      siteDescription:
        'RYZITE designs and builds high-reliability web platforms, cloud architectures, and custom software solutions for ambitious organisations.',
      siteUrl: resolvedDefaultSiteUrl,
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
  } else {
    try {
      const parsed = JSON.parse(existingSettings.value_json);
      let changed = false;
      if (
        !parsed.siteUrl ||
        parsed.siteUrl === 'https://ryzite.com' ||
        parsed.siteUrl.includes('your-ryzite-domain')
      ) {
        parsed.siteUrl = resolvedDefaultSiteUrl;
        changed = true;
      }
      if (parsed.siteTitle === 'RYZITE — Enterprise Digital Engineering & Technology Solutions') {
        parsed.siteTitle = 'RYZITE — Digital Engineering & Technology Solutions';
        changed = true;
      }
      if (changed) {
        await dbRun(
          `UPDATE site_settings SET value_json = $1 WHERE key = 'global_seo'`,
          [JSON.stringify(parsed)]
        );
      }
    } catch {
      // Ignore malformed settings JSON
    }
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
    INSERT INTO cms_documents (id, doc_type, status, data_json, published_json, published_at, published_by, updated_at, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;

  const pages = [
    {
      id: 'page-home',
      title: 'Home',
      slug: '/',
      status: 'published',
      blocks: [
        {
          id: 'b1',
          type: 'hero',
          visible: true,
          eyebrow: 'RYZITE DIGITAL ENGINEERING',
          text: 'Engineering Resilient Digital Platforms for Modern Enterprises',
          subtitle:
            'RYZITE partners with forward-thinking organisations to architect scalable web applications, cloud infrastructure, and tailored software systems.',
          primaryButtonText: 'Explore Services',
          primaryButtonUrl: '/services',
          secondaryButtonText: 'Contact Leadership',
          secondaryButtonUrl: '/contact',
        },
        {
          id: 'b2',
          type: 'stats',
          visible: true,
          text: 'Proven Delivery Across Mission-Critical Systems',
          stats: [
            { value: '99.95%', label: 'Platform Reliability', note: 'Production uptime target' },
            { value: '40+', label: 'Enterprise Releases', note: 'Cloud & web systems' },
            { value: '< 120ms', label: 'Edge Response', note: 'Global CDN architecture' },
          ],
        },
        {
          id: 'b3',
          type: 'heading',
          visible: true,
          level: 2,
          text: 'Built for Measurable Operational Velocity',
        },
        {
          id: 'b4',
          type: 'list',
          visible: true,
          items: [
            'Full-stack cloud and edge web engineering',
            'Headless CMS and digital commerce modernisation',
            'Security-first architecture and observability',
          ],
        },
        {
          id: 'b5',
          type: 'cta',
          visible: true,
          ctaHeading: 'Ready to modernise your digital stack?',
          ctaBody: 'Speak with RYZITE engineering leadership to scope your next platform release.',
          ctaButtonText: 'Schedule a Technical Briefing',
          ctaButtonUrl: '/contact',
        },
      ],
      seo: {
        metaTitle: 'RYZITE | Digital Engineering & Cloud Platforms',
        metaDescription:
          'RYZITE builds high-performance web applications, cloud systems, and tailored software platforms for modern enterprises across Sri Lanka and globally.',
        canonicalUrl: 'https://ryzite.lk/',
        ogTitle: 'RYZITE — Digital Engineering & Cloud Platforms',
        ogDescription: 'High-performance web applications and cloud architecture engineered by RYZITE.',
        ogImage: '/assets/branding/ryzite-logo.png',
        noIndex: false,
      },
      updatedAt: now,
      updatedBy: 'admin',
      publishedAt: now,
      publishedBy: 'admin',
    },
    {
      id: 'page-about',
      title: 'About RYZITE',
      slug: '/about',
      status: 'published',
      blocks: [
        { id: 'b1', type: 'heading', visible: true, level: 1, text: 'Precision Engineering Driven by Long-Term Outcomes' },
        { id: 'b2', type: 'paragraph', visible: true, text: 'Founded by systems architects and product designers, RYZITE delivers software that balances architectural discipline with intuitive human experience.' },
      ],
      seo: {
        metaTitle: 'About RYZITE | Engineering Philosophy & Leadership',
        metaDescription:
          'Learn how RYZITE combines systems engineering, cloud reliability, and product design to deliver resilient enterprise software and digital platforms.',
        canonicalUrl: 'https://ryzite.lk/about',
        ogTitle: 'About RYZITE',
        ogDescription: 'Systems engineering and digital product leadership at RYZITE.',
        ogImage: '/assets/branding/ryzite-logo.png',
        noIndex: false,
      },
      updatedAt: now,
      updatedBy: 'admin',
      publishedAt: now,
      publishedBy: 'admin',
    },
  ];

  for (const p of pages) {
    const json = JSON.stringify(p);
    await dbRun(insertSql, [p.id, 'page', p.status, json, json, now, 'admin', now, 'admin']);
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
