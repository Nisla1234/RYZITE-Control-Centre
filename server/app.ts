import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  dbAll,
  dbGet,
  dbRun,
  ensureDatabaseReady,
  getDatabaseStatus,
  hashPassword,
  logAudit,
  verifyPassword,
} from './db.ts';
import {
  type AuthenticatedRequest,
  checkLoginRateLimit,
  clearFailedLogins,
  clearSessionCookie,
  createSession,
  extractSessionToken,
  getClientIp,
  getSessionTtlHours,
  recordFailedLogin,
  requireAuth,
  revokeSession,
  setSessionCookie,
} from './auth.ts';
import {
  deleteDocument,
  getDocument,
  getSanityClient,
  hasSanityWriteToken,
  inspectSanityProject,
  listDocuments,
  saveDocument,
} from './sanity.ts';
import { fetchGa4Analytics, getGa4ConfigStatus } from './ga4.ts';
import type {
  AnalyticsDateRange,
  GlobalSeoSettings,
  MediaAsset,
  SeoIssue,
  WebsitePage,
} from '../src/types/cms.ts';

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.NETLIFY === 'true');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

if (!IS_SERVERLESS) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
]);

// Use memoryStorage so uploads work seamlessly on both Netlify read-only serverless functions and local Node
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported profile photo format. Allowed: JPG, JPEG, PNG, and WebP.'));
    }
  },
});

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, SVG, PDF.'));
    }
  },
});

const ALLOWED_CONTENT_TYPES = new Set([
  'page',
  'project',
  'service',
  'solution',
  'team',
  'article',
  'testimonial',
]);

function getRecordTitle(doc: Record<string, any>): string {
  return String(doc.title || doc.name || doc.customerName || doc.slug || doc.id || 'Untitled');
}

function sanitizeString(val: unknown, maxLen = 10000): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function safeFileName(originalName: string, mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
  };
  const ext = mimeToExt[mimeType] || path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 48);
  return `${Date.now()}-${base || 'asset'}${ext}`;
}

export function createApiApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());

  // Normalize Netlify Function base paths (/.netlify/functions/api/* -> /api/*)
  app.use((req, _res, next) => {
    if (req.url === '/.netlify/functions/api' || req.url.startsWith('/.netlify/functions/api/') || req.url.startsWith('/.netlify/functions/api?')) {
      req.url = req.url.replace(/^\/\.netlify\/functions\/api/, '/api');
    }
    next();
  });

  // Security & safe same-origin / configured-origin CORS headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Vary', 'Origin');

    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const allowedOrigins = new Set<string>(
      [
        process.env.APP_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
        host ? `https://${host}` : '',
        host ? `http://${host}` : '',
      ]
        .filter(Boolean)
        .map((u) => u!.replace(/\/$/, ''))
    );

    if (origin && allowedOrigins.has(origin.replace(/\/$/, ''))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Serve local uploads when not running on read-only serverless
  if (!IS_SERVERLESS && fs.existsSync(UPLOADS_DIR)) {
    app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  }

  // Ensure database schema is initialized on every cold start before API handlers run
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureDatabaseReady();
      next();
    } catch (err: any) {
      console.error('[Database Init Error]', err);
      res.status(503).json({
        error:
          err?.message ||
          'Database connection is not ready. Verify DATABASE_URL in environment variables.',
      });
    }
  });

  // Public health check (exposes no secrets)
  app.get('/api/health', async (_req, res) => {
    const dbStatus = await getDatabaseStatus();
    res.status(dbStatus.connected ? 200 : 503).json({
      ok: dbStatus.connected,
      database: dbStatus.engine,
      persistent: dbStatus.persistent,
    });
  });

  // ============================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================

  app.post('/api/auth/login', async (req, res) => {
    try {
      const ip = getClientIp(req);
      const username = sanitizeString(req.body?.username, 120);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
      }

      const rateKey = `${ip}:${username.toLowerCase()}`;
      const rate = await checkLoginRateLimit(rateKey);
      if (!rate.allowed) {
        await logAudit({
          adminUsername: username,
          adminName: username,
          action: 'login_blocked',
          contentType: 'auth',
          recordId: username,
          recordTitle: 'Rate-limited login attempt',
          result: 'failure',
          details: `Too many failed login attempts. Retry after ${rate.retryAfterSec}s.`,
          ipAddress: ip,
        });
        res.status(429).json({
          error: `Too many failed login attempts. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s) before trying again.`,
        });
        return;
      }

      const userRow = await dbGet<any>(
        'SELECT * FROM admin_users WHERE lower(username) = lower($1)',
        [username]
      );

      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        await recordFailedLogin(rateKey);
        await logAudit({
          adminUsername: username,
          adminName: username,
          action: 'login',
          contentType: 'auth',
          recordId: username,
          recordTitle: 'Admin sign-in',
          result: 'failure',
          details: 'Invalid username or password.',
          ipAddress: ip,
        });
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }

      await clearFailedLogins(rateKey);
      const ttlHours = await getSessionTtlHours();
      const { rawToken, expiresAt } = await createSession(
        userRow.id,
        ip,
        String(req.headers['user-agent'] || ''),
        ttlHours
      );
      setSessionCookie(req, res, rawToken, expiresAt);

      await logAudit({
        adminUsername: userRow.username,
        adminName: userRow.name,
        action: 'login',
        contentType: 'auth',
        recordId: userRow.id,
        recordTitle: userRow.username,
        result: 'success',
        details: `Signed in (session valid for ${ttlHours}h).`,
        ipAddress: ip,
      });

      res.json({
        sessionToken: rawToken,
        user: {
          id: userRow.id,
          username: userRow.username,
          name: userRow.name,
          email: userRow.email,
          role: userRow.role,
          avatarUrl: userRow.avatar_url || null,
          lastLoginAt: new Date().toISOString(),
          createdAt: userRow.created_at,
        },
      });
    } catch (err: any) {
      console.error('[Login Error]', err);
      res.status(500).json({ error: 'Sign-in failed due to a server error.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
    const rawToken = extractSessionToken(req);
    if (rawToken) await revokeSession(rawToken);
    clearSessionCookie(req, res);

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'logout',
      contentType: 'auth',
      recordId: req.adminUser!.id,
      recordTitle: req.adminUser!.username,
      result: 'success',
      details: 'Administrator signed out.',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.adminUser });
  });

  app.put('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    const current = req.adminUser!;
    const username = sanitizeString(req.body?.username ?? current.username, 64);
    const name = sanitizeString(req.body?.name, 120);
    const email = sanitizeString(req.body?.email, 180);
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
      res.status(400).json({
        error: 'Username must be 3–64 characters using letters, numbers, ".", "_", or "-".',
      });
      return;
    }

    if (!name) {
      res.status(400).json({ error: 'Display name is required.' });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const usernameChanged = username.toLowerCase() !== current.username.toLowerCase();
    const emailChanged = email.toLowerCase() !== current.email.toLowerCase();
    const nameChanged = name !== current.name;

    if (usernameChanged || emailChanged) {
      if (!currentPassword) {
        res.status(400).json({
          error: 'Current password is required to change your username or email address.',
        });
        return;
      }

      const authRow = await dbGet<{ password_hash: string }>(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [current.id]
      );

      if (!authRow || !verifyPassword(currentPassword, authRow.password_hash)) {
        await logAudit({
          adminUsername: current.username,
          adminName: current.name,
          action: 'update_profile',
          contentType: 'settings',
          recordId: current.id,
          recordTitle: current.username,
          result: 'failure',
          details: 'Rejected sensitive profile change due to incorrect current password.',
          ipAddress: getClientIp(req),
        });
        res.status(403).json({ error: 'Current password is incorrect. Profile changes were not saved.' });
        return;
      }
    }

    const dupUsername = await dbGet(
      'SELECT id FROM admin_users WHERE lower(username) = lower($1) AND id != $2',
      [username, current.id]
    );
    if (dupUsername) {
      res.status(409).json({ error: 'That username is already in use by another administrator.' });
      return;
    }

    const dupEmail = await dbGet(
      'SELECT id FROM admin_users WHERE lower(email) = lower($1) AND id != $2',
      [email, current.id]
    );
    if (dupEmail) {
      res.status(409).json({ error: 'That email address is already associated with another administrator.' });
      return;
    }

    await dbRun('UPDATE admin_users SET username = $1, name = $2, email = $3 WHERE id = $4', [
      username,
      name,
      email,
      current.id,
    ]);

    const changedParts: string[] = [];
    if (usernameChanged) changedParts.push(`username: ${current.username} → ${username}`);
    if (nameChanged) changedParts.push(`display name: "${current.name}" → "${name}"`);
    if (emailChanged) changedParts.push(`email: ${current.email} → ${email}`);

    await logAudit({
      adminUsername: username,
      adminName: name,
      action: 'update_profile',
      contentType: 'settings',
      recordId: current.id,
      recordTitle: name,
      result: 'success',
      details:
        changedParts.length > 0
          ? `Updated administrator profile (${changedParts.join('; ')}).`
          : 'Saved administrator profile (no field changes).',
      ipAddress: getClientIp(req),
    });

    res.json({
      user: { ...current, username, name, email },
    });
  });

  app.post('/api/auth/avatar', requireAuth, (req: AuthenticatedRequest, res) => {
    avatarUpload.single('avatar')(req, res, async (err: any) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Profile photo exceeds the 5 MB size limit.'
            : err.message || 'Profile photo upload failed.';
        res.status(400).json({ error: msg });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Please select a JPG, PNG, or WebP image to upload.' });
        return;
      }

      const current = req.adminUser!;
      let avatarUrl: string | null = null;

      // 1. Prefer Sanity Assets CDN when SANITY_API_TOKEN is configured (permanent cloud storage)
      if (hasSanityWriteToken()) {
        try {
          const client = getSanityClient();
          const uploaded = await client.assets.upload('image', req.file.buffer, {
            filename: req.file.originalname || 'admin-avatar.png',
            contentType: req.file.mimetype,
          });
          if (uploaded?.url) {
            avatarUrl = uploaded.url;
          }
        } catch (sanityErr) {
          console.error('[Sanity Avatar Upload Error]', sanityErr);
        }
      }

      // 2. Otherwise write to persistent local disk in standalone Node, or persist data URI in PostgreSQL on serverless
      if (!avatarUrl) {
        if (!IS_SERVERLESS) {
          const fileName = `avatar-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${
            req.file.mimetype === 'image/jpeg'
              ? '.jpg'
              : req.file.mimetype === 'image/webp'
              ? '.webp'
              : '.png'
          }`;
          fs.writeFileSync(path.join(AVATARS_DIR, fileName), req.file.buffer);
          avatarUrl = `/uploads/avatars/${fileName}`;

          if (current.avatarUrl && current.avatarUrl.startsWith('/uploads/avatars/')) {
            const oldPath = path.join(AVATARS_DIR, path.basename(current.avatarUrl));
            if (fs.existsSync(oldPath)) {
              try {
                fs.unlinkSync(oldPath);
              } catch {
                // ignore
              }
            }
          }
        } else {
          // Persistent PostgreSQL storage for cropped 512x512 avatar on serverless (Vercel/Netlify)
          avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
      }

      await dbRun('UPDATE admin_users SET avatar_url = $1 WHERE id = $2', [avatarUrl, current.id]);

      await logAudit({
        adminUsername: current.username,
        adminName: current.name,
        action: 'update_avatar',
        contentType: 'settings',
        recordId: current.id,
        recordTitle: current.name,
        result: 'success',
        details: `Updated administrator profile picture (${Math.round(req.file.size / 1024)} KB).`,
        ipAddress: getClientIp(req),
      });

      res.json({
        user: { ...current, avatarUrl },
      });
    });
  });

  app.delete('/api/auth/avatar', requireAuth, async (req: AuthenticatedRequest, res) => {
    const current = req.adminUser!;

    if (!IS_SERVERLESS && current.avatarUrl && current.avatarUrl.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(AVATARS_DIR, path.basename(current.avatarUrl));
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // ignore
        }
      }
    }

    await dbRun('UPDATE admin_users SET avatar_url = NULL WHERE id = $1', [current.id]);

    await logAudit({
      adminUsername: current.username,
      adminName: current.name,
      action: 'remove_avatar',
      contentType: 'settings',
      recordId: current.id,
      recordTitle: current.name,
      result: 'success',
      details: 'Removed administrator profile picture.',
      ipAddress: getClientIp(req),
    });

    res.json({
      user: { ...current, avatarUrl: null },
    });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (newPassword.length < 10) {
      res.status(400).json({ error: 'New password must be at least 10 characters long.' });
      return;
    }

    const row = await dbGet<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [req.adminUser!.id]
    );

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    await dbRun('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [nextHash, req.adminUser!.id]);

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'change_password',
      contentType: 'settings',
      recordId: req.adminUser!.id,
      recordTitle: req.adminUser!.username,
      result: 'success',
      details: 'Administrator password updated.',
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  });

  // ============================================================
  // INTEGRATION STATUS & DASHBOARD OVERVIEW
  // ============================================================

  app.get('/api/status', requireAuth, async (_req, res) => {
    const [sanity, database, sessionTtlHours] = await Promise.all([
      inspectSanityProject(),
      getDatabaseStatus(),
      getSessionTtlHours(),
    ]);
    const ga4 = getGa4ConfigStatus();
    res.json({
      sanity,
      ga4,
      database,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        siteUrl: process.env.SITE_URL || 'https://ryzite.com',
        appUrl: process.env.APP_URL || process.env.URL || 'http://localhost:3000',
        sessionTtlHours,
      },
    });
  });

  app.get('/api/dashboard/overview', requireAuth, async (_req, res) => {
    const countsRows = await dbAll<{ doc_type: string; status: string; count: string | number }>(
      'SELECT doc_type, status, COUNT(*) as count FROM cms_documents GROUP BY doc_type, status'
    );

    const counts: Record<string, { total: number; published: number; draft: number }> = {
      page: { total: 0, published: 0, draft: 0 },
      project: { total: 0, published: 0, draft: 0 },
      service: { total: 0, published: 0, draft: 0 },
      solution: { total: 0, published: 0, draft: 0 },
      team: { total: 0, published: 0, draft: 0 },
      article: { total: 0, published: 0, draft: 0 },
      testimonial: { total: 0, published: 0, draft: 0 },
    };

    for (const r of countsRows) {
      const c = Number(r.count || 0);
      if (!counts[r.doc_type]) counts[r.doc_type] = { total: 0, published: 0, draft: 0 };
      counts[r.doc_type].total += c;
      if (r.status === 'published') counts[r.doc_type].published += c;
      else counts[r.doc_type].draft += c;
    }

    const mediaRow = await dbGet<{ count: string | number }>('SELECT COUNT(*) as count FROM media_assets');
    const mediaCount = Number(mediaRow?.count || 0);

    const recentDocs = (
      await dbAll<any>(
        'SELECT id, doc_type, status, data_json, updated_at, updated_by FROM cms_documents ORDER BY updated_at DESC LIMIT 8'
      )
    ).map((r) => {
      const parsed = JSON.parse(r.data_json);
      return {
        id: r.id,
        docType: r.doc_type,
        title: getRecordTitle(parsed),
        status: r.status,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
      };
    });

    const recentActivity = (
      await dbAll<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8')
    ).map((r) => ({
      id: r.id,
      adminUsername: r.admin_username,
      adminName: r.admin_name,
      action: r.action,
      contentType: r.content_type,
      recordId: r.record_id,
      recordTitle: r.record_title,
      result: r.result,
      details: r.details,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));

    const sanity = await inspectSanityProject();
    const ga4 = getGa4ConfigStatus();

    res.json({
      counts,
      mediaCount,
      recentUpdates: recentDocs,
      recentActivity,
      sanity,
      ga4,
    });
  });

  // ============================================================
  // GOOGLE ANALYTICS 4 ENDPOINT (REAL DATA ONLY)
  // ============================================================

  app.get('/api/analytics', requireAuth, async (req, res) => {
    const preset = String(req.query.preset || '30d') as AnalyticsDateRange['preset'];
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const report = await fetchGa4Analytics({ preset, startDate, endDate });
    res.json(report);
  });

  // ============================================================
  // UNIFIED CMS CONTENT CRUD ENDPOINTS
  // ============================================================

  app.get('/api/content/:type', requireAuth, async (req, res) => {
    const docType = req.params.type;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }
    const items = await listDocuments(docType);
    res.json({ items });
  });

  app.post('/api/content/:type', requireAuth, async (req: AuthenticatedRequest, res) => {
    const docType = req.params.type;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }

    const body = req.body || {};
    const id = body.id && typeof body.id === 'string' ? body.id : `${docType}-${crypto.randomUUID().slice(0, 8)}`;
    const status = body.status === 'published' ? 'published' : 'draft';

    const titleCheck = getRecordTitle({ ...body, id });
    if (!titleCheck || titleCheck === id) {
      res.status(400).json({ error: 'A title or name is required.' });
      return;
    }

    const saved = await saveDocument(
      docType,
      {
        ...body,
        id,
        status,
        publishedAt: status === 'published' ? body.publishedAt || new Date().toISOString() : body.publishedAt || null,
      },
      req.adminUser!.username
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'create',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(saved),
      result: 'success',
      details: `Created ${docType} (${status}).`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ item: saved });
  });

  app.put('/api/content/:type/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { type: docType, id } = req.params;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }

    const body = req.body || {};
    const status = body.status === 'published' ? 'published' : 'draft';

    const saved = await saveDocument(
      docType,
      {
        ...body,
        id,
        status,
        publishedAt: status === 'published' ? body.publishedAt || new Date().toISOString() : body.publishedAt || null,
      },
      req.adminUser!.username
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'update',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(saved),
      result: 'success',
      details: `Updated ${docType} (${status}).`,
      ipAddress: getClientIp(req),
    });

    res.json({ item: saved });
  });

  app.post('/api/content/:type/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { type: docType, id } = req.params;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }

    const existing = await getDocument<any>(docType, id);
    if (!existing) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }

    const nextStatus = req.body?.status === 'published' ? 'published' : 'draft';
    const saved = await saveDocument(
      docType,
      {
        ...existing,
        status: nextStatus,
        publishedAt: nextStatus === 'published' ? new Date().toISOString() : existing.publishedAt,
      },
      req.adminUser!.username
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: nextStatus === 'published' ? 'publish' : 'unpublish',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(saved),
      result: 'success',
      details: `${nextStatus === 'published' ? 'Published' : 'Moved to draft'}: ${getRecordTitle(saved)}.`,
      ipAddress: getClientIp(req),
    });

    res.json({ item: saved });
  });

  app.delete('/api/content/:type/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { type: docType, id } = req.params;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }

    const existing = await getDocument<any>(docType, id);
    if (!existing) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }

    await deleteDocument(docType, id);

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'delete',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(existing),
      result: 'success',
      details: `Deleted ${docType} "${getRecordTitle(existing)}".`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  });

  // ============================================================
  // MEDIA LIBRARY ENDPOINTS
  // ============================================================

  app.get('/api/media', requireAuth, async (_req, res) => {
    const rows = await dbAll<any>('SELECT * FROM media_assets ORDER BY uploaded_at DESC');
    const items: MediaAsset[] = rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      url: r.url,
      altText: r.alt_text,
      source: r.source,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
    }));
    res.json({ items });
  });

  app.post('/api/media/upload', requireAuth, (req: AuthenticatedRequest, res) => {
    mediaUpload.single('file')(req, res, async (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'File upload failed.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file provided.' });
        return;
      }

      const id = `media-${crypto.randomUUID().slice(0, 8)}`;
      const altText = sanitizeString(req.body?.altText, 300);
      const generatedName = safeFileName(req.file.originalname, req.file.mimetype);
      let url = '';
      let source: 'sanity' | 'local' = 'local';

      if (hasSanityWriteToken()) {
        try {
          const client = getSanityClient();
          const assetType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
          const uploaded = await client.assets.upload(assetType, req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });
          if (uploaded?.url) {
            url = uploaded.url;
            source = 'sanity';
          }
        } catch (sanityErr) {
          console.error('[Sanity Asset Upload Error]', sanityErr);
        }
      }

      if (!url) {
        if (!IS_SERVERLESS) {
          fs.writeFileSync(path.join(UPLOADS_DIR, generatedName), req.file.buffer);
          url = `/uploads/${generatedName}`;
        } else {
          res.status(400).json({
            error:
              'Configure SANITY_API_TOKEN in Environment Variables to store uploaded media assets permanently.',
          });
          return;
        }
      }

      const now = new Date().toISOString();
      await dbRun(
        `INSERT INTO media_assets (id, file_name, original_name, mime_type, size_bytes, url, alt_text, source, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          generatedName,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          url,
          altText,
          source,
          req.adminUser!.username,
          now,
        ]
      );

      await logAudit({
        adminUsername: req.adminUser!.username,
        adminName: req.adminUser!.name,
        action: 'upload_media',
        contentType: 'media',
        recordId: id,
        recordTitle: req.file.originalname,
        result: 'success',
        details: `Uploaded ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB) via ${source}.`,
        ipAddress: getClientIp(req),
      });

      res.status(201).json({
        item: {
          id,
          fileName: generatedName,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          url,
          altText,
          source,
          uploadedBy: req.adminUser!.username,
          uploadedAt: now,
        },
      });
    });
  });

  app.put('/api/media/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const altText = sanitizeString(req.body?.altText, 300);
    const existing = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    await dbRun('UPDATE media_assets SET alt_text = $1 WHERE id = $2', [altText, id]);

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'update_media',
      contentType: 'media',
      recordId: id,
      recordTitle: existing.original_name,
      result: 'success',
      details: `Updated alt text for ${existing.original_name}.`,
      ipAddress: getClientIp(req),
    });

    res.json({
      item: {
        id: existing.id,
        fileName: existing.file_name,
        originalName: existing.original_name,
        mimeType: existing.mime_type,
        sizeBytes: Number(existing.size_bytes),
        url: existing.url,
        altText,
        source: existing.source,
        uploadedBy: existing.uploaded_by,
        uploadedAt: existing.uploaded_at,
      },
    });
  });

  app.post('/api/media/:id/replace', requireAuth, (req: AuthenticatedRequest, res) => {
    mediaUpload.single('file')(req, res, async (err: any) => {
      if (err || !req.file) {
        res.status(400).json({ error: err?.message || 'Replacement file is required.' });
        return;
      }

      const { id } = req.params;
      const existing = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Media asset not found.' });
        return;
      }

      const generatedName = safeFileName(req.file.originalname, req.file.mimetype);
      let newUrl = '';
      let source: 'sanity' | 'local' = 'local';

      if (hasSanityWriteToken()) {
        try {
          const client = getSanityClient();
          const assetType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
          const uploaded = await client.assets.upload(assetType, req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });
          if (uploaded?.url) {
            newUrl = uploaded.url;
            source = 'sanity';
          }
        } catch (sanityErr) {
          console.error('[Sanity Asset Replace Error]', sanityErr);
        }
      }

      if (!newUrl) {
        if (!IS_SERVERLESS) {
          if (existing.source === 'local' && existing.file_name) {
            const oldPath = path.join(UPLOADS_DIR, existing.file_name);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          fs.writeFileSync(path.join(UPLOADS_DIR, generatedName), req.file.buffer);
          newUrl = `/uploads/${generatedName}`;
        } else {
          res.status(400).json({
            error: 'Configure SANITY_API_TOKEN in Environment Variables to replace media assets.',
          });
          return;
        }
      }

      const now = new Date().toISOString();
      await dbRun(
        `UPDATE media_assets
         SET file_name = $1, original_name = $2, mime_type = $3, size_bytes = $4, url = $5, source = $6, uploaded_at = $7
         WHERE id = $8`,
        [generatedName, req.file.originalname, req.file.mimetype, req.file.size, newUrl, source, now, id]
      );

      await logAudit({
        adminUsername: req.adminUser!.username,
        adminName: req.adminUser!.name,
        action: 'replace_media',
        contentType: 'media',
        recordId: id,
        recordTitle: req.file.originalname,
        result: 'success',
        details: `Replaced asset with ${req.file.originalname}.`,
        ipAddress: getClientIp(req),
      });

      res.json({
        item: {
          id,
          fileName: generatedName,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          url: newUrl,
          altText: existing.alt_text,
          source,
          uploadedBy: req.adminUser!.username,
          uploadedAt: now,
        },
      });
    });
  });

  app.delete('/api/media/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    if (!IS_SERVERLESS && existing.source === 'local' && existing.file_name) {
      const filePath = path.join(UPLOADS_DIR, existing.file_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await dbRun('DELETE FROM media_assets WHERE id = $1', [id]);

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'delete_media',
      contentType: 'media',
      recordId: id,
      recordTitle: existing.original_name,
      result: 'success',
      details: `Deleted media asset "${existing.original_name}".`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  });

  // ============================================================
  // SEO CENTRE & VALIDATION ENDPOINTS
  // ============================================================

  app.get('/api/seo/global', requireAuth, async (_req, res) => {
    const row = await dbGet<{ value_json: string }>('SELECT value_json FROM site_settings WHERE key = $1', [
      'global_seo',
    ]);
    res.json({ settings: row ? JSON.parse(row.value_json) : null });
  });

  app.put('/api/seo/global', requireAuth, async (req: AuthenticatedRequest, res) => {
    const now = new Date().toISOString();
    const currentRow = await dbGet<{ value_json: string }>(
      'SELECT value_json FROM site_settings WHERE key = $1',
      ['global_seo']
    );
    const current = currentRow ? JSON.parse(currentRow.value_json) : {};

    const next: GlobalSeoSettings = {
      siteTitle: sanitizeString(req.body?.siteTitle ?? current.siteTitle, 160),
      siteDescription: sanitizeString(req.body?.siteDescription ?? current.siteDescription, 320),
      siteUrl: sanitizeString(req.body?.siteUrl ?? current.siteUrl, 240),
      defaultOgImage: sanitizeString(req.body?.defaultOgImage ?? current.defaultOgImage, 500),
      robotsDirectives: sanitizeString(req.body?.robotsDirectives ?? current.robotsDirectives, 120),
      sitemapEnabled: Boolean(req.body?.sitemapEnabled ?? current.sitemapEnabled ?? true),
      sessionTimeoutHours: Math.max(
        1,
        Math.min(168, Number(req.body?.sessionTimeoutHours ?? current.sessionTimeoutHours ?? 24))
      ),
      updatedAt: now,
      updatedBy: req.adminUser!.username,
    };

    await dbRun(
      `INSERT INTO site_settings (key, value_json, updated_at, updated_by)
       VALUES ('global_seo', $1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(next), now, req.adminUser!.username]
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'update_seo',
      contentType: 'seo',
      recordId: 'global_seo',
      recordTitle: 'Global Website & SEO Configuration',
      result: 'success',
      details: 'Updated global SEO metadata and site settings.',
      ipAddress: getClientIp(req),
    });

    res.json({ settings: next });
  });

  app.get('/api/seo/audit', requireAuth, async (_req, res) => {
    const issues: SeoIssue[] = [];
    const seenTitles = new Map<string, { type: string; id: string; title: string }>();

    const checkSeoEntity = (entityType: string, id: string, entityTitle: string, seo: any) => {
      const metaTitle = (seo?.metaTitle || '').trim();
      const metaDesc = (seo?.metaDescription || '').trim();

      if (!metaTitle) {
        issues.push({
          id: `${id}-missing-title`,
          severity: 'error',
          entityType,
          entityId: id,
          entityTitle,
          field: 'metaTitle',
          message: 'Missing meta title.',
        });
      } else {
        if (metaTitle.length < 25) {
          issues.push({
            id: `${id}-short-title`,
            severity: 'warning',
            entityType,
            entityId: id,
            entityTitle,
            field: 'metaTitle',
            message: `Meta title is short (${metaTitle.length} chars; recommended 30–60).`,
          });
        } else if (metaTitle.length > 65) {
          issues.push({
            id: `${id}-long-title`,
            severity: 'warning',
            entityType,
            entityId: id,
            entityTitle,
            field: 'metaTitle',
            message: `Meta title may be truncated in search results (${metaTitle.length} chars; recommended ≤ 60).`,
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
            field: 'metaTitle',
            message: `Duplicate meta title also used by ${prev.type} "${prev.title}".`,
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
          field: 'metaDescription',
          message: 'Missing meta description.',
        });
      } else if (metaDesc.length < 70) {
        issues.push({
          id: `${id}-short-desc`,
          severity: 'warning',
          entityType,
          entityId: id,
          entityTitle,
          field: 'metaDescription',
          message: `Meta description is brief (${metaDesc.length} chars; recommended 120–160).`,
        });
      } else if (metaDesc.length > 165) {
        issues.push({
          id: `${id}-long-desc`,
          severity: 'warning',
          entityType,
          entityId: id,
          entityTitle,
          field: 'metaDescription',
          message: `Meta description exceeds 165 characters (${metaDesc.length} chars).`,
        });
      }
    };

    const pages = await listDocuments<WebsitePage>('page');
    for (const p of pages) {
      checkSeoEntity('page', p.id, p.title, p.seo);
      const h1s = (p.blocks || []).filter((b) => b.type === 'heading' && b.level === 1);
      if (h1s.length === 0) {
        issues.push({
          id: `${p.id}-no-h1`,
          severity: 'error',
          entityType: 'page',
          entityId: p.id,
          entityTitle: p.title,
          field: 'headings',
          message: 'Page has no H1 heading block.',
        });
      } else if (h1s.length > 1) {
        issues.push({
          id: `${p.id}-multi-h1`,
          severity: 'warning',
          entityType: 'page',
          entityId: p.id,
          entityTitle: p.title,
          field: 'headings',
          message: `Page contains ${h1s.length} H1 headings (best practice is a single H1).`,
        });
      }
      for (const b of p.blocks || []) {
        if (b.type === 'image' && b.imageUrl && !(b.imageAlt || '').trim()) {
          issues.push({
            id: `${p.id}-img-alt-${b.id}`,
            severity: 'warning',
            entityType: 'page',
            entityId: p.id,
            entityTitle: p.title,
            field: 'imageAlt',
            message: 'An image block on this page is missing alt text.',
          });
        }
      }
    }

    for (const type of ['project', 'service', 'solution', 'article'] as const) {
      const docs = await listDocuments<any>(type);
      for (const d of docs) {
        checkSeoEntity(type, d.id, getRecordTitle(d), d.seo);
      }
    }

    const mediaRows = await dbAll<{ id: string; original_name: string }>(
      "SELECT id, original_name FROM media_assets WHERE mime_type LIKE 'image/%' AND trim(alt_text) = ''"
    );
    for (const m of mediaRows) {
      issues.push({
        id: `${m.id}-media-alt`,
        severity: 'warning',
        entityType: 'media',
        entityId: m.id,
        entityTitle: m.original_name,
        field: 'altText',
        message: 'Uploaded image in Media Library is missing alt text.',
      });
    }

    res.json({
      issues,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      checkedAt: new Date().toISOString(),
    });
  });

  // ============================================================
  // ACTIVITY & AUDIT LOGS ENDPOINT
  // ============================================================

  app.get('/api/activity', requireAuth, async (req, res) => {
    const search = sanitizeString(req.query.search, 120).toLowerCase();
    const contentType = sanitizeString(req.query.contentType, 40);
    const result = sanitizeString(req.query.result, 20);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));

    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      const like = `%${search}%`;
      where.push(
        `(lower(admin_username) LIKE $${idx} OR lower(action) LIKE $${idx + 1} OR lower(record_title) LIKE $${idx + 2} OR lower(details) LIKE $${idx + 3})`
      );
      params.push(like, like, like, like);
      idx += 4;
    }
    if (contentType && contentType !== 'all') {
      where.push(`content_type = $${idx}`);
      params.push(contentType);
      idx += 1;
    }
    if (result && result !== 'all') {
      where.push(`result = $${idx}`);
      params.push(result);
      idx += 1;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await dbGet<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
      params
    );
    const total = Number(totalRow?.count || 0);

    const rows = await dbAll<any>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        adminUsername: r.admin_username,
        adminName: r.admin_name,
        action: r.action,
        contentType: r.content_type,
        recordId: r.record_id,
        recordTitle: r.record_title,
        result: r.result,
        details: r.details,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    });
  });

  return app;
}
