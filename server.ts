import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, initDatabase, logAudit, verifyPassword } from './server/db.ts';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
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
} from './server/auth.ts';
import {
  deleteDocument,
  getDocument,
  getSanityClient,
  hasSanityWriteToken,
  inspectSanityProject,
  listDocuments,
  saveDocument,
} from './server/sanity.ts';
import { fetchGa4Analytics, getGa4ConfigStatus } from './server/ga4.ts';
import type { AnalyticsDateRange, GlobalSeoSettings, MediaAsset, SeoIssue, WebsitePage } from './src/types/cms.ts';

initDatabase();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (_req, file, cb) => {
      const mimeToExt: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
      };
      const ext = mimeToExt[file.mimetype] || '.png';
      cb(null, `avatar-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported profile photo format. Allowed: JPG, JPEG, PNG, and WebP.'));
    }
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      const base = path
        .basename(file.originalname, path.extname(file.originalname))
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .slice(0, 48);
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  }),
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Serve uploaded media files
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

  // ============================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================

  app.post('/api/auth/login', (req, res) => {
    const ip = getClientIp(req);
    const username = sanitizeString(req.body?.username, 120);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const rateKey = `${ip}:${username.toLowerCase()}`;
    const rate = checkLoginRateLimit(rateKey);
    if (!rate.allowed) {
      logAudit({
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

    const userRow = db
      .prepare('SELECT * FROM admin_users WHERE lower(username) = lower(?)')
      .get(username) as any;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      recordFailedLogin(rateKey);
      logAudit({
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

    clearFailedLogins(rateKey);
    const ttlHours = getSessionTtlHours();
    const { rawToken, expiresAt } = createSession(
      userRow.id,
      ip,
      String(req.headers['user-agent'] || ''),
      ttlHours
    );
    setSessionCookie(req, res, rawToken, expiresAt);

    logAudit({
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
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    const rawToken = extractSessionToken(req);
    if (rawToken) revokeSession(rawToken);
    clearSessionCookie(req, res);

    logAudit({
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

  app.put('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const usernameChanged = username.toLowerCase() !== current.username.toLowerCase();
    const emailChanged = email.toLowerCase() !== current.email.toLowerCase();
    const nameChanged = name !== current.name;

    // Require current password verification before changing sensitive account details (username or email)
    if (usernameChanged || emailChanged) {
      if (!currentPassword) {
        res.status(400).json({
          error: 'Current password is required to change your username or email address.',
        });
        return;
      }

      const authRow = db
        .prepare('SELECT password_hash FROM admin_users WHERE id = ?')
        .get(current.id) as { password_hash: string } | undefined;

      if (!authRow || !verifyPassword(currentPassword, authRow.password_hash)) {
        logAudit({
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

    // Prevent duplicate usernames
    const dupUsername = db
      .prepare('SELECT id FROM admin_users WHERE lower(username) = lower(?) AND id != ?')
      .get(username, current.id);
    if (dupUsername) {
      res.status(409).json({ error: 'That username is already in use by another administrator.' });
      return;
    }

    // Prevent duplicate email addresses
    const dupEmail = db
      .prepare('SELECT id FROM admin_users WHERE lower(email) = lower(?) AND id != ?')
      .get(email, current.id);
    if (dupEmail) {
      res.status(409).json({ error: 'That email address is already associated with another administrator.' });
      return;
    }

    db.prepare('UPDATE admin_users SET username = ?, name = ?, email = ? WHERE id = ?').run(
      username,
      name,
      email,
      current.id
    );

    const changedParts: string[] = [];
    if (usernameChanged) changedParts.push(`username: ${current.username} → ${username}`);
    if (nameChanged) changedParts.push(`display name: "${current.name}" → "${name}"`);
    if (emailChanged) changedParts.push(`email: ${current.email} → ${email}`);

    logAudit({
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
      let avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // If Sanity write token is configured, store permanently in Sanity Assets too
      if (hasSanityWriteToken()) {
        try {
          const client = getSanityClient();
          const stream = fs.createReadStream(req.file.path);
          const uploaded = await client.assets.upload('image', stream, {
            filename: req.file.originalname || req.file.filename,
            contentType: req.file.mimetype,
          });
          if (uploaded?.url) {
            avatarUrl = uploaded.url;
          }
        } catch (sanityErr) {
          console.error('[Sanity Avatar Upload Error]', sanityErr);
        }
      }

      // Clean up previous local avatar file if replaced
      if (current.avatarUrl && current.avatarUrl.startsWith('/uploads/avatars/')) {
        const oldFile = path.basename(current.avatarUrl);
        const oldPath = path.join(AVATARS_DIR, oldFile);
        if (fs.existsSync(oldPath) && oldFile !== req.file.filename) {
          try {
            fs.unlinkSync(oldPath);
          } catch {
            // ignore cleanup errors
          }
        }
      }

      db.prepare('UPDATE admin_users SET avatar_url = ? WHERE id = ?').run(avatarUrl, current.id);

      logAudit({
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

  app.delete('/api/auth/avatar', requireAuth, (req: AuthenticatedRequest, res) => {
    const current = req.adminUser!;

    if (current.avatarUrl && current.avatarUrl.startsWith('/uploads/avatars/')) {
      const oldFile = path.basename(current.avatarUrl);
      const oldPath = path.join(AVATARS_DIR, oldFile);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    db.prepare('UPDATE admin_users SET avatar_url = NULL WHERE id = ?').run(current.id);

    logAudit({
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

  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
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

    const row = db.prepare('SELECT password_hash FROM admin_users WHERE id = ?').get(req.adminUser!.id) as {
      password_hash: string;
    };

    if (!verifyPassword(currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(nextHash, req.adminUser!.id);

    logAudit({
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
    const sanity = await inspectSanityProject();
    const ga4 = getGa4ConfigStatus();
    res.json({
      sanity,
      ga4,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        siteUrl: process.env.SITE_URL || 'https://ryzite.com',
        appUrl: process.env.APP_URL || 'http://localhost:3000',
        sessionTtlHours: getSessionTtlHours(),
      },
    });
  });

  app.get('/api/dashboard/overview', requireAuth, async (_req, res) => {
    const countsRows = db
      .prepare('SELECT doc_type, status, COUNT(*) as count FROM cms_documents GROUP BY doc_type, status')
      .all() as { doc_type: string; status: string; count: number }[];

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
      if (!counts[r.doc_type]) counts[r.doc_type] = { total: 0, published: 0, draft: 0 };
      counts[r.doc_type].total += r.count;
      if (r.status === 'published') counts[r.doc_type].published += r.count;
      else counts[r.doc_type].draft += r.count;
    }

    const mediaCount = (db.prepare('SELECT COUNT(*) as count FROM media_assets').get() as { count: number }).count;

    const recentDocs = (
      db
        .prepare('SELECT id, doc_type, status, data_json, updated_at, updated_by FROM cms_documents ORDER BY updated_at DESC LIMIT 8')
        .all() as any[]
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
      db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8').all() as any[]
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

    logAudit({
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

    logAudit({
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

    logAudit({
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

    logAudit({
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

  app.get('/api/media', requireAuth, (_req, res) => {
    const rows = db.prepare('SELECT * FROM media_assets ORDER BY uploaded_at DESC').all() as any[];
    const items: MediaAsset[] = rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: r.url,
      altText: r.alt_text,
      source: r.source,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
    }));
    res.json({ items });
  });

  app.post('/api/media/upload', requireAuth, (req: AuthenticatedRequest, res) => {
    upload.single('file')(req, res, async (err: any) => {
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
      let url = `/uploads/${req.file.filename}`;
      let source: 'sanity' | 'local' = 'local';

      // If Sanity write token is configured, upload directly to Sanity Assets as well
      if (hasSanityWriteToken()) {
        try {
          const client = getSanityClient();
          const assetType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
          const stream = fs.createReadStream(req.file.path);
          const uploaded = await client.assets.upload(assetType, stream, {
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

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO media_assets (id, file_name, original_name, mime_type, size_bytes, url, alt_text, source, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        url,
        altText,
        source,
        req.adminUser!.username,
        now
      );

      logAudit({
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
          fileName: req.file.filename,
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

  app.put('/api/media/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const altText = sanitizeString(req.body?.altText, 300);
    const existing = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    db.prepare('UPDATE media_assets SET alt_text = ? WHERE id = ?').run(altText, id);

    logAudit({
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
        sizeBytes: existing.size_bytes,
        url: existing.url,
        altText,
        source: existing.source,
        uploadedBy: existing.uploaded_by,
        uploadedAt: existing.uploaded_at,
      },
    });
  });

  app.post('/api/media/:id/replace', requireAuth, (req: AuthenticatedRequest, res) => {
    upload.single('file')(req, res, (err: any) => {
      if (err || !req.file) {
        res.status(400).json({ error: err?.message || 'Replacement file is required.' });
        return;
      }

      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
      if (!existing) {
        res.status(404).json({ error: 'Media asset not found.' });
        return;
      }

      // Remove old local file if present
      if (existing.source === 'local' && existing.file_name) {
        const oldPath = path.join(UPLOADS_DIR, existing.file_name);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const newUrl = `/uploads/${req.file.filename}`;
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE media_assets
        SET file_name = ?, original_name = ?, mime_type = ?, size_bytes = ?, url = ?, uploaded_at = ?
        WHERE id = ?
      `).run(req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, newUrl, now, id);

      logAudit({
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
          fileName: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          url: newUrl,
          altText: existing.alt_text,
          source: 'local',
          uploadedBy: req.adminUser!.username,
          uploadedAt: now,
        },
      });
    });
  });

  app.delete('/api/media/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    if (existing.source === 'local' && existing.file_name) {
      const filePath = path.join(UPLOADS_DIR, existing.file_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);

    logAudit({
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

  app.get('/api/seo/global', requireAuth, (_req, res) => {
    const row = db.prepare('SELECT value_json FROM site_settings WHERE key = ?').get('global_seo') as
      | { value_json: string }
      | undefined;
    res.json({ settings: row ? JSON.parse(row.value_json) : null });
  });

  app.put('/api/seo/global', requireAuth, (req: AuthenticatedRequest, res) => {
    const now = new Date().toISOString();
    const currentRow = db.prepare('SELECT value_json FROM site_settings WHERE key = ?').get('global_seo') as
      | { value_json: string }
      | undefined;
    const current = currentRow ? JSON.parse(currentRow.value_json) : {};

    const next: GlobalSeoSettings = {
      siteTitle: sanitizeString(req.body?.siteTitle ?? current.siteTitle, 160),
      siteDescription: sanitizeString(req.body?.siteDescription ?? current.siteDescription, 320),
      siteUrl: sanitizeString(req.body?.siteUrl ?? current.siteUrl, 240),
      defaultOgImage: sanitizeString(req.body?.defaultOgImage ?? current.defaultOgImage, 500),
      robotsDirectives: sanitizeString(req.body?.robotsDirectives ?? current.robotsDirectives, 120),
      sitemapEnabled: Boolean(req.body?.sitemapEnabled ?? current.sitemapEnabled ?? true),
      sessionTimeoutHours: Math.max(1, Math.min(168, Number(req.body?.sessionTimeoutHours ?? current.sessionTimeoutHours ?? 24))),
      updatedAt: now,
      updatedBy: req.adminUser!.username,
    };

    db.prepare(`
      INSERT INTO site_settings (key, value_json, updated_at, updated_by)
      VALUES ('global_seo', ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).run(JSON.stringify(next), now, req.adminUser!.username);

    logAudit({
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

    const mediaRows = db
      .prepare("SELECT id, original_name FROM media_assets WHERE mime_type LIKE 'image/%' AND trim(alt_text) = ''")
      .all() as { id: string; original_name: string }[];
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

  app.get('/api/activity', requireAuth, (req, res) => {
    const search = sanitizeString(req.query.search, 120).toLowerCase();
    const contentType = sanitizeString(req.query.contentType, 40);
    const result = sanitizeString(req.query.result, 20);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));

    const where: string[] = [];
    const params: any[] = [];

    if (search) {
      where.push('(lower(admin_username) LIKE ? OR lower(action) LIKE ? OR lower(record_title) LIKE ? OR lower(details) LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (contentType && contentType !== 'all') {
      where.push('content_type = ?');
      params.push(contentType);
    }
    if (result && result !== 'all') {
      where.push('result = ?');
      params.push(result);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`).get(...params) as { count: number }
    ).count;

    const rows = db
      .prepare(`SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as any[];

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

  // ============================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC SPA SERVING
  // ============================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RYZITE Control Centre running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
