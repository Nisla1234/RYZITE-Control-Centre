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
  getCredentialSyncStatus,
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
  hashToken,
  recordFailedLogin,
  requireAuth,
  requireRole,
  revokeSession,
  setSessionCookie,
} from './auth.ts';
import {
  deleteDocument,
  getDocument,
  getRevisionById,
  getSanityClient,
  hasSanityWriteToken,
  inspectSanityProject,
  listDocuments,
  listPublishedDocuments,
  listRevisions,
  saveDocument,
} from './sanity.ts';
import {
  computeMediaUsageMap,
  computeSha256,
  extractImageDimensions,
  mapMediaRow,
  propagateMediaUrlChange,
  runSeoAudit,
  validateUploadSafety,
} from './cmsHelpers.ts';
import { fetchGa4Analytics, getGa4ConfigStatus } from './ga4.ts';
import { mainSiteSeed } from './main-site-seed.ts';
import {
  getEmailConfigStatus,
  sendAdminSecurityNotification,
  sendPasswordResetEmail,
} from './email.ts';
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

  // Public health check (exposes no secrets, usernames, or credentials)
  app.get('/api/health', async (_req, res) => {
    const dbStatus = await getDatabaseStatus();
    let adminConfigured = false;
    let adminCount = 0;
    if (dbStatus.connected) {
      const countRow = await dbGet<{ count: string | number }>('SELECT COUNT(*) as count FROM admin_users');
      adminCount = Number(countRow?.count || 0);
      adminConfigured = adminCount > 0;
    }
    res.status(dbStatus.connected ? 200 : 503).json({
      ok: dbStatus.connected,
      database: dbStatus.engine,
      persistent: dbStatus.persistent,
      adminConfigured,
      adminCount,
      credentialSyncStatus: getCredentialSyncStatus(),
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
        void sendAdminSecurityNotification({
          eventTitle: 'Login Lockout Triggered',
          summary: `Multiple failed sign-in attempts triggered a temporary lockout for username "${username}".`,
          fields: [
            { label: 'Target Username', value: username },
            { label: 'Source IP', value: ip },
            { label: 'Retry Window', value: `${Math.ceil(rate.retryAfterSec / 60)} minute(s)` },
            { label: 'Timestamp (UTC)', value: new Date().toISOString() },
          ],
        });
        res.status(429).json({
          error: `Too many failed login attempts. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s) before trying again.`,
        });
        return;
      }

      const userRow = await dbGet<any>(
        'SELECT * FROM admin_users WHERE lower(trim(username)) = lower($1) OR lower(trim(email)) = lower($1) LIMIT 1',
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

    void sendAdminSecurityNotification({
      eventTitle: 'Administrator Password Changed',
      summary: `Administrator "${req.adminUser!.username}" changed their account password from Control Centre settings.`,
      fields: [
        { label: 'Username', value: req.adminUser!.username },
        { label: 'Email', value: req.adminUser!.email },
        { label: 'Source IP', value: getClientIp(req) },
        { label: 'Timestamp (UTC)', value: new Date().toISOString() },
      ],
    });

    res.json({ ok: true });
  });

  // ============================================================
  // FORGOT PASSWORD & SINGLE-USE 15-MINUTE RESET FLOW
  // ============================================================

  function getAppOrigin(req: express.Request): string {
    const envUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000')
      .split(',')[0]
      .trim();
    return `${proto}://${host}`;
  }

  function validateStrongPassword(password: string): string | null {
    if (password.length < 10) return 'Password must be at least 10 characters long.';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
      return 'Password must include both uppercase and lowercase letters.';
    }
    if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return 'Password must include at least one number or special character.';
    }
    return null;
  }

  app.post('/api/auth/forgot-password', async (req, res) => {
    const genericMessage =
      'If an administrator account is registered with that email address, a password reset link has been sent. The link expires in 15 minutes.';

    try {
      const ip = getClientIp(req);
      const email = sanitizeString(req.body?.email, 180).toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      const ipRate = await checkLoginRateLimit(`forgot-ip:${ip}`);
      const emailRate = await checkLoginRateLimit(`forgot-email:${email}`);
      if (!ipRate.allowed || !emailRate.allowed) {
        const retry = Math.max(ipRate.retryAfterSec, emailRate.retryAfterSec);
        res.status(429).json({
          error: `Too many password recovery requests. Please wait ${Math.ceil(retry / 60)} minute(s) before trying again.`,
        });
        return;
      }

      await recordFailedLogin(`forgot-ip:${ip}`);
      await recordFailedLogin(`forgot-email:${email}`);

      // Clean up expired tokens globally
      const nowIso = new Date().toISOString();
      await dbRun('DELETE FROM password_reset_tokens WHERE expires_at <= $1 OR used_at IS NOT NULL', [nowIso]);

      const userRow = await dbGet<{
        id: string;
        username: string;
        name: string;
        email: string;
      }>('SELECT id, username, name, email FROM admin_users WHERE lower(email) = lower($1) LIMIT 1', [email]);

      if (userRow) {
        // Invalidate any prior unused tokens for this user
        await dbRun('DELETE FROM password_reset_tokens WHERE user_id = $1', [userRow.id]);

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await dbRun(
          `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, requested_ip, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [tokenHash, userRow.id, expiresAt, ip, nowIso]
        );

        const resetUrl = `${getAppOrigin(req)}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;

        const emailResult = await sendPasswordResetEmail({
          to: userRow.email,
          adminName: userRow.name,
          resetUrl,
          expiresMinutes: 15,
          ipAddress: ip,
        });

        await sendAdminSecurityNotification({
          eventTitle: 'Password Recovery Requested',
          summary: `A password reset link was requested for administrator "${userRow.username}".`,
          fields: [
            { label: 'Administrator', value: `${userRow.name} (${userRow.username})` },
            { label: 'Registered Email', value: userRow.email },
            { label: 'Source IP', value: ip },
            { label: 'Token Expiry', value: '15 minutes (single-use, hashed in PostgreSQL)' },
            { label: 'Email Delivery', value: emailResult.sent ? 'Delivered via Resend' : `Not sent (${emailResult.error || 'unconfigured'})` },
          ],
        });

        await logAudit({
          adminUsername: userRow.username,
          adminName: userRow.name,
          action: 'password_reset_requested',
          contentType: 'auth',
          recordId: userRow.id,
          recordTitle: userRow.username,
          result: emailResult.sent ? 'success' : 'failure',
          details: emailResult.sent
            ? 'Password reset token generated (15-min expiry) and emailed to registered address.'
            : `Password reset token generated, but email delivery failed: ${emailResult.error || 'provider unconfigured'}.`,
          ipAddress: ip,
        });
      } else {
        await logAudit({
          adminUsername: 'anonymous',
          adminName: 'Unregistered Email',
          action: 'password_reset_requested',
          contentType: 'auth',
          recordId: 'unregistered',
          recordTitle: 'Password recovery check',
          result: 'failure',
          details: 'Password reset requested for an email address with no matching admin account (no account existence revealed).',
          ipAddress: ip,
        });
      }

      // Never reveal whether the email belongs to an administrator account
      res.json({ ok: true, message: genericMessage });
    } catch (err: any) {
      console.error('[Forgot Password Error]', err);
      res.status(500).json({ error: 'Unable to process password recovery request right now.' });
    }
  });

  app.get('/api/auth/reset-password/validate', async (req, res) => {
    try {
      const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
      if (!rawToken || rawToken.length < 32) {
        res.status(400).json({ valid: false, error: 'This password reset link is invalid or has expired.' });
        return;
      }

      const tokenHash = hashToken(rawToken);
      const row = await dbGet<{ expires_at: string; used_at: string | null }>(
        'SELECT expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
        [tokenHash]
      );

      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
        res.status(400).json({ valid: false, error: 'This password reset link is invalid or has expired.' });
        return;
      }

      res.json({ valid: true, expiresAt: row.expires_at });
    } catch (err: any) {
      console.error('[Validate Reset Token Error]', err);
      res.status(500).json({ valid: false, error: 'Unable to validate reset link.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rate = await checkLoginRateLimit(`reset-ip:${ip}`);
      if (!rate.allowed) {
        res.status(429).json({
          error: `Too many reset attempts. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`,
        });
        return;
      }

      const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

      if (!rawToken || rawToken.length < 32) {
        await recordFailedLogin(`reset-ip:${ip}`);
        res.status(400).json({ error: 'Invalid or expired password reset token.' });
        return;
      }

      const passwordError = validateStrongPassword(newPassword);
      if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
      }

      const tokenHash = hashToken(rawToken);
      const tokenRow = await dbGet<{
        token_hash: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>('SELECT token_hash, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1', [
        tokenHash,
      ]);

      if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        await recordFailedLogin(`reset-ip:${ip}`);
        if (tokenRow) {
          await dbRun('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
        }
        res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
        return;
      }

      const userRow = await dbGet<{ id: string; username: string; name: string; email: string }>(
        'SELECT id, username, name, email FROM admin_users WHERE id = $1',
        [tokenRow.user_id]
      );
      if (!userRow) {
        await dbRun('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
        res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const nextHash = hashPassword(newPassword);

      await dbRun('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [nextHash, userRow.id]);
      await dbRun('UPDATE password_reset_tokens SET used_at = $1 WHERE token_hash = $2', [nowIso, tokenHash]);
      await dbRun('DELETE FROM password_reset_tokens WHERE user_id = $1', [userRow.id]);
      await dbRun('DELETE FROM admin_sessions WHERE user_id = $1', [userRow.id]);
      await dbRun('DELETE FROM login_attempts WHERE identifier LIKE $1', [`%:${userRow.username.toLowerCase()}`]);
      await clearFailedLogins(`reset-ip:${ip}`);

      await logAudit({
        adminUsername: userRow.username,
        adminName: userRow.name,
        action: 'password_reset_completed',
        contentType: 'auth',
        recordId: userRow.id,
        recordTitle: userRow.username,
        result: 'success',
        details: 'Administrator password reset completed via single-use token. All prior sessions revoked.',
        ipAddress: ip,
      });

      await sendAdminSecurityNotification({
        eventTitle: 'Administrator Password Reset Completed',
        summary: `The password for administrator "${userRow.username}" was successfully reset using a single-use recovery link.`,
        fields: [
          { label: 'Administrator', value: `${userRow.name} (${userRow.username})` },
          { label: 'Email', value: userRow.email },
          { label: 'Source IP', value: ip },
          { label: 'Sessions', value: 'All previous sessions revoked' },
          { label: 'Timestamp (UTC)', value: nowIso },
        ],
      });

      res.json({ ok: true, message: 'Your password has been updated. You can now sign in with your new password.' });
    } catch (err: any) {
      console.error('[Reset Password Error]', err);
      res.status(500).json({ error: 'Unable to reset password right now.' });
    }
  });

  // ============================================================
  // ADMIN SIGNUP / ACCESS REQUESTS (SUPER_ADMIN APPROVAL REQUIRED)
  // ============================================================

  app.post('/api/auth/signup-request', async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rate = await checkLoginRateLimit(`signup-req:${ip}`);
      if (!rate.allowed) {
        res.status(429).json({
          error: `Too many access requests from this address. Please wait ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`,
        });
        return;
      }

      const fullName = sanitizeString(req.body?.fullName, 120);
      const email = sanitizeString(req.body?.email, 180).toLowerCase();
      const reason = sanitizeString(req.body?.reason, 1000);

      if (fullName.length < 2) {
        res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid work email address.' });
        return;
      }
      if (reason.length < 10) {
        res.status(400).json({ error: 'Please provide a brief reason for requesting administrator access (at least 10 characters).' });
        return;
      }

      await recordFailedLogin(`signup-req:${ip}`);

      const existingPending = await dbGet<{ id: string }>(
        "SELECT id FROM admin_access_requests WHERE lower(email) = lower($1) AND status = 'pending' LIMIT 1",
        [email]
      );
      if (existingPending) {
        res.status(409).json({
          error: 'An administrator access request for this email is already pending review.',
        });
        return;
      }

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      await dbRun(
        `INSERT INTO admin_access_requests (id, full_name, email, reason, status, requested_ip, created_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [id, fullName, email, reason, ip, nowIso]
      );

      const reviewUrl = `${getAppOrigin(req)}/admin/settings/`;
      const emailResult = await sendAdminSecurityNotification({
        eventTitle: 'New Administrator Access Request',
        summary: `${fullName} (${email}) has requested administrator access to RYZITE Control Centre. No account has been created automatically — a super_admin must approve or reject this request.`,
        fields: [
          { label: 'Applicant Name', value: fullName },
          { label: 'Applicant Email', value: email },
          { label: 'Reason for Access', value: reason },
          { label: 'Source IP', value: ip },
          { label: 'Submitted (UTC)', value: nowIso },
        ],
        actionUrl: reviewUrl,
        actionLabel: 'Review Request in Control Centre',
      });

      await logAudit({
        adminUsername: email,
        adminName: fullName,
        action: 'access_request_submitted',
        contentType: 'auth',
        recordId: id,
        recordTitle: `${fullName} <${email}>`,
        result: 'success',
        details: `Admin access request submitted (pending super_admin review). Notification email: ${emailResult.sent ? 'sent' : 'not sent'}.`,
        ipAddress: ip,
      });

      res.status(201).json({
        ok: true,
        message:
          'Your administrator access request has been submitted and sent to RYZITE super administrators for review. No account is created until approved.',
      });
    } catch (err: any) {
      console.error('[Signup Request Error]', err);
      res.status(500).json({ error: 'Unable to submit access request right now.' });
    }
  });

  app.get(
    '/api/admin/access-requests',
    requireAuth,
    requireRole('super_admin'),
    async (_req: AuthenticatedRequest, res) => {
      const rows = await dbAll<any>(
        `SELECT * FROM admin_access_requests
         ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC, created_at DESC`
      );
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          reason: r.reason,
          status: r.status,
          reviewedBy: r.reviewed_by || null,
          reviewedAt: r.reviewed_at || null,
          reviewNotes: r.review_notes || null,
          createdAdminId: r.created_admin_id || null,
          requestedIp: r.requested_ip,
          createdAt: r.created_at,
        })),
      });
    }
  );

  app.post(
    '/api/admin/access-requests/:id/approve',
    requireAuth,
    requireRole('super_admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const reviewer = req.adminUser!;
        const ip = getClientIp(req);

        const requestRow = await dbGet<any>('SELECT * FROM admin_access_requests WHERE id = $1', [id]);
        if (!requestRow) {
          res.status(404).json({ error: 'Access request not found.' });
          return;
        }
        if (requestRow.status !== 'pending') {
          res.status(400).json({ error: `This access request has already been ${requestRow.status}.` });
          return;
        }

        const username = sanitizeString(req.body?.username, 64);
        const roleInput = sanitizeString(req.body?.role || 'admin', 32);
        const reviewNotes = sanitizeString(req.body?.reviewNotes || '', 500);
        const role = roleInput === 'editor' ? 'editor' : 'admin';

        if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
          res.status(400).json({
            error: 'Username must be 3–64 characters using letters, numbers, ".", "_", or "-".',
          });
          return;
        }

        const dupUser = await dbGet(
          'SELECT id FROM admin_users WHERE lower(username) = lower($1) OR lower(email) = lower($2) LIMIT 1',
          [username, requestRow.email]
        );
        if (dupUser) {
          res.status(409).json({
            error: 'An administrator account with this username or email already exists.',
          });
          return;
        }

        const newAdminId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        // Random unguessable scrypt hash; user sets their own password via single-use 15-min link
        const unguessableHash = hashPassword(crypto.randomBytes(32).toString('hex'));

        await dbRun(
          `INSERT INTO admin_users (id, username, password_hash, name, email, role, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newAdminId, username, unguessableHash, requestRow.full_name, requestRow.email, role, nowIso]
        );

        await dbRun(
          `UPDATE admin_access_requests
           SET status = 'approved', reviewed_by = $1, reviewed_at = $2, review_notes = $3, created_admin_id = $4
           WHERE id = $5`,
          [reviewer.username, nowIso, reviewNotes || null, newAdminId, id]
        );

        // Generate single-use 15-minute setup token (hashed in PostgreSQL) so approved user sets their own password
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await dbRun(
          `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, requested_ip, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [tokenHash, newAdminId, expiresAt, ip, nowIso]
        );

        const setupUrl = `${getAppOrigin(req)}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;
        const inviteEmail = await sendPasswordResetEmail({
          to: requestRow.email,
          adminName: requestRow.full_name,
          resetUrl: setupUrl,
          expiresMinutes: 15,
          ipAddress: ip,
          isAccountSetup: true,
        });

        await sendAdminSecurityNotification({
          eventTitle: 'Administrator Access Request Approved',
          summary: `Super admin "${reviewer.username}" approved the access request for ${requestRow.full_name} (${requestRow.email}).`,
          fields: [
            { label: 'Approved By', value: `${reviewer.name} (${reviewer.username})` },
            { label: 'New Username', value: username },
            { label: 'Assigned Role', value: role },
            { label: 'Applicant Email', value: requestRow.email },
            { label: 'Setup Link Email', value: inviteEmail.sent ? 'Delivered via Resend (15-min expiry)' : `Not sent (${inviteEmail.error || 'unconfigured'})` },
            { label: 'Notes', value: reviewNotes || 'None' },
          ],
        });

        await logAudit({
          adminUsername: reviewer.username,
          adminName: reviewer.name,
          action: 'access_request_approved',
          contentType: 'auth',
          recordId: id,
          recordTitle: `${requestRow.full_name} (${username})`,
          result: 'success',
          details: `Approved access request as ${role} (${username}). Password setup link emailed: ${inviteEmail.sent ? 'yes' : 'no'}.`,
          ipAddress: ip,
        });

        res.json({
          ok: true,
          emailSent: inviteEmail.sent,
          emailError: inviteEmail.sent ? undefined : inviteEmail.error,
        });
      } catch (err: any) {
        console.error('[Approve Access Request Error]', err);
        res.status(500).json({ error: 'Unable to approve access request.' });
      }
    }
  );

  app.post(
    '/api/admin/access-requests/:id/reject',
    requireAuth,
    requireRole('super_admin'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const reviewer = req.adminUser!;
        const ip = getClientIp(req);

        const requestRow = await dbGet<any>('SELECT * FROM admin_access_requests WHERE id = $1', [id]);
        if (!requestRow) {
          res.status(404).json({ error: 'Access request not found.' });
          return;
        }
        if (requestRow.status !== 'pending') {
          res.status(400).json({ error: `This access request has already been ${requestRow.status}.` });
          return;
        }

        const reviewNotes = sanitizeString(req.body?.reviewNotes || '', 500);
        const nowIso = new Date().toISOString();

        await dbRun(
          `UPDATE admin_access_requests
           SET status = 'rejected', reviewed_by = $1, reviewed_at = $2, review_notes = $3
           WHERE id = $4`,
          [reviewer.username, nowIso, reviewNotes || null, id]
        );

        await sendAdminSecurityNotification({
          eventTitle: 'Administrator Access Request Rejected',
          summary: `Super admin "${reviewer.username}" rejected the access request from ${requestRow.full_name} (${requestRow.email}).`,
          fields: [
            { label: 'Reviewed By', value: `${reviewer.name} (${reviewer.username})` },
            { label: 'Applicant', value: `${requestRow.full_name} (${requestRow.email})` },
            { label: 'Notes', value: reviewNotes || 'None' },
            { label: 'Timestamp (UTC)', value: nowIso },
          ],
        });

        await logAudit({
          adminUsername: reviewer.username,
          adminName: reviewer.name,
          action: 'access_request_rejected',
          contentType: 'auth',
          recordId: id,
          recordTitle: `${requestRow.full_name} <${requestRow.email}>`,
          result: 'success',
          details: `Rejected access request.${reviewNotes ? ` Notes: ${reviewNotes}` : ''}`,
          ipAddress: ip,
        });

        res.json({ ok: true });
      } catch (err: any) {
        console.error('[Reject Access Request Error]', err);
        res.status(500).json({ error: 'Unable to reject access request.' });
      }
    }
  );

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
    const email = getEmailConfigStatus();
    res.json({
      sanity,
      ga4,
      database,
      email,
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

    const mediaStats = await dbGet<{ count: string | number; total_bytes: string | number }>(
      'SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM media_assets'
    );
    const mediaCount = Number(mediaStats?.count || 0);
    const mediaStorageBytes = Number(mediaStats?.total_bytes || 0);

    const missingAltRow = await dbGet<{ count: string | number }>(
      "SELECT COUNT(*) as count FROM media_assets WHERE mime_type LIKE 'image/%' AND trim(COALESCE(alt_text, '')) = ''"
    );
    const missingAltCount = Number(missingAltRow?.count || 0);

    const recentMediaRows = await dbAll<any>(
      'SELECT * FROM media_assets ORDER BY uploaded_at DESC LIMIT 6'
    );
    const recentMedia = recentMediaRows.map((r) => mapMediaRow(r));

    const recentDocs = (
      await dbAll<any>(
        'SELECT id, doc_type, status, data_json, updated_at, updated_by, published_at FROM cms_documents ORDER BY updated_at DESC LIMIT 8'
      )
    ).map((r) => {
      const parsed = JSON.parse(r.data_json);
      return {
        id: r.id,
        docType: r.doc_type,
        title: getRecordTitle(parsed),
        slug: parsed.slug || '',
        status: r.status,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        publishedAt: r.published_at || parsed.publishedAt || null,
      };
    });

    const recentPages = (
      await dbAll<any>(
        "SELECT id, status, data_json, updated_at, updated_by, published_at FROM cms_documents WHERE doc_type = 'page' ORDER BY updated_at DESC LIMIT 6"
      )
    ).map((r) => {
      const parsed = JSON.parse(r.data_json);
      return {
        id: r.id,
        title: parsed.title || r.id,
        slug: parsed.slug || '/',
        status: r.status,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
        publishedAt: r.published_at || parsed.publishedAt || null,
      };
    });

    const recentActivity = (
      await dbAll<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10')
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
    const seoAudit = await runSeoAudit();

    res.json({
      counts,
      mediaCount,
      mediaStorageBytes,
      missingAltCount,
      seoSummary: {
        errorCount: seoAudit.errorCount,
        warningCount: seoAudit.warningCount,
        moduleCounts: seoAudit.moduleCounts,
      },
      recentUpdates: recentDocs,
      recentPages,
      recentMedia,
      recentActivity,
      sanity,
      ga4,
    });
  });

  // ============================================================
  // PUBLIC READ-ONLY WEBSITE ENDPOINTS (PUBLISHED CONTENT ONLY)
  // ============================================================

  app.get('/api/public/site', async (_req, res) => {
    const settingsRow = await dbGet<{ value_json: string }>(
      'SELECT value_json FROM site_settings WHERE key = $1',
      ['global_seo']
    );
    const globalSeo: GlobalSeoSettings | null = settingsRow
      ? JSON.parse(settingsRow.value_json)
      : null;

    const [pages, services, solutions, portfolio, team, testimonials, articles] =
      await Promise.all([
        listPublishedDocuments<WebsitePage>('page'),
        listPublishedDocuments<any>('service'),
        listPublishedDocuments<any>('solution'),
        listPublishedDocuments<any>('project'),
        listPublishedDocuments<any>('team'),
        listPublishedDocuments<any>('testimonial'),
        listPublishedDocuments<any>('article'),
      ]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      globalSeo,
      pages,
      services: services.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      solutions: solutions.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      portfolio: portfolio.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      team: team.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      testimonials: testimonials.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      articles,
    });
  });

  app.get('/api/public/page', async (req, res) => {
    const rawSlug = sanitizeString(req.query.slug, 200) || '/';
    const normalizedSlug = rawSlug.startsWith('/') ? rawSlug : `/${rawSlug}`;

    const pages = await listPublishedDocuments<WebsitePage>('page');
    const page = pages.find((p) => {
      const pSlug = (p.slug || '/').startsWith('/') ? p.slug : `/${p.slug}`;
      return pSlug.toLowerCase() === normalizedSlug.toLowerCase();
    });

    if (!page) {
      res.status(404).json({ error: 'Published page not found.' });
      return;
    }

    const settingsRow = await dbGet<{ value_json: string }>(
      'SELECT value_json FROM site_settings WHERE key = $1',
      ['global_seo']
    );
    const globalSeo: GlobalSeoSettings | null = settingsRow
      ? JSON.parse(settingsRow.value_json)
      : null;

    const resolvedSeo = {
      title: page.seo?.metaTitle || globalSeo?.siteTitle || page.title,
      description: page.seo?.metaDescription || globalSeo?.siteDescription || '',
      canonicalUrl:
        page.seo?.canonicalUrl ||
        `${(globalSeo?.siteUrl || 'https://ryzite.lk').replace(/\/$/, '')}${normalizedSlug === '/' ? '/' : normalizedSlug}`,
      ogTitle: page.seo?.ogTitle || page.seo?.metaTitle || globalSeo?.siteTitle || page.title,
      ogDescription:
        page.seo?.ogDescription || page.seo?.metaDescription || globalSeo?.siteDescription || '',
      ogImage: page.seo?.ogImage || globalSeo?.defaultOgImage || '/assets/branding/ryzite-logo.png',
      noIndex: Boolean(page.seo?.noIndex),
    };

    res.setHeader('Cache-Control', 'no-store');
    res.json({ page, seo: resolvedSeo, globalSeo });
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
  // IMPORT CURRENT MAIN-SITE CONTENT (IDEMPOTENT, SUPER-ADMIN ONLY)

  app.post('/api/content/import-main-site', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (req.adminUser?.role !== 'super_admin') {
      res.status(403).json({ error: 'Only a super administrator can import main-site content.' });
      return;
    }

    const imported: Record<string, number> = { page: 0, service: 0, solution: 0, article: 0, media: 0 };
    const skipped: Record<string, number> = { page: 0, service: 0, solution: 0, article: 0, media: 0 };
    const now = new Date().toISOString();

    const importRecords = async (
      docType: 'page' | 'service' | 'solution' | 'article',
      records: any[],
      defaultStatus: 'draft' | 'published' = 'published'
    ) => {
      const existing = await listDocuments<any>(docType);
      const normalized = (value: unknown) => String(value || '').replace(/\/$/, '') || '/';
      const byId = new Map(existing.map((item) => [item.id, item]));
      const bySlug = new Map(existing.map((item) => [normalized(item.slug), item]));

      for (const record of records) {
        const existingById = byId.get(record.id);
        const existingBySlug = bySlug.get(normalized(record.slug));
        const status = record.status === 'draft' ? 'draft' : defaultStatus;

        // Replace only the two untouched starter records shipped with the original CMS.
        // Do not overwrite any content previously imported or edited by an administrator.
        const replaceStarter =
          docType === 'page' &&
          existingBySlug &&
          ['page-home', 'page-about'].includes(existingBySlug.id) &&
          !existingBySlug.source;

        if (existingById || (existingBySlug && !replaceStarter)) {
          skipped[docType] += 1;
          continue;
        }

        const payload = {
          ...record,
          ...(replaceStarter ? { id: existingBySlug.id } : {}),
          source: 'main-site',
          status,
          publishedAt: status === 'published' ? record.publishedAt || now : record.publishedAt || null,
          updatedAt: now,
          updatedBy: req.adminUser!.username,
        };
        await saveDocument(docType, payload, req.adminUser!.username);
        imported[docType] += 1;
      }
    };

    const pageRecords = mainSiteSeed.pages.map((page) => ({
      ...page,
      seo: {
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        canonicalUrl: `https://ryzite-main-site-nisla1234.vercel.app${page.slug === '/' ? '/' : page.slug}`,
        ogTitle: page.metaTitle,
        ogDescription: page.metaDescription,
        noIndex: false,
      },
    }));

    const solutionImages: Record<string, string> = {
      'business-website-design-and-development': 'website-development.jpeg',
      'online-store-development': 'online-store-development.jpeg',
      'custom-software-for-businesses': 'custom-software.jpeg',
      'mobile-app-development': 'mobile-app-development.jpeg',
      'customer-chatbots-and-assistants': 'customer-chatbots.jpeg',
      'business-workflow-automation': 'business-workflow-automation.jpeg',
      'ui-ux-design-for-websites-and-apps': 'ui-ux-design.jpeg',
      'software-and-api-integrations': 'software-api-integrations.jpeg',
      'website-care-and-maintenance': 'website-care-maintenance.jpeg',
    };

    const mediaIdByFile = new Map<string, string>(
      mainSiteSeed.media.map(([id, fileName]) => [fileName, id])
    );

    const makeOffering = (kind: 'service' | 'solution', item: readonly [string, string, string]) => {
      const [title, summary, featureText] = item;
      const slug = title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const metaTitle = `${title} | RYZITE`;
      const imageFile = kind === 'solution' ? solutionImages[slug] : undefined;
      const imageMediaId = imageFile ? mediaIdByFile.get(imageFile) : undefined;
      return {
        id: `main-site-${kind}-${slug}`,
        type: kind,
        title,
        slug,
        category: kind === 'service' ? 'Marketing Services' : 'Technology Solutions',
        summary,
        description: summary,
        iconName: kind === 'service' ? 'Megaphone' : 'Code2',
        imageMediaId: imageMediaId || undefined,
        imageUrl: imageMediaId
          ? `/api/media/${imageMediaId}/file?v=1`
          : '',
        imageAlt: imageFile ? `${title} — RYZITE technology solution` : '',
        features: featureText.split(';').map((value) => value.trim()).filter(Boolean),
        benefits: [],
        ctaText: 'Get a Quote',
        ctaUrl: '/contact/',
        displayOrder: 0,
        status: 'published',
        seo: { metaTitle, metaDescription: summary },
        source: 'main-site',
      };
    };

    await importRecords('page', pageRecords);
    await importRecords('service', mainSiteSeed.services.map((item, index) => ({ ...makeOffering('service', item), displayOrder: index + 1 })));
    await importRecords('solution', mainSiteSeed.solutions.map((item, index) => ({ ...makeOffering('solution', item), displayOrder: index + 1 })));
    await importRecords('article', mainSiteSeed.articles.map((article, index) => ({
      ...article,
      status: 'draft',
      displayOrder: index + 1,
      featuredImageUrl: '',
      featuredImageAlt: '',
      publishedAt: '',
      seo: {
        metaTitle: `${article.title} | RYZITE Insights`,
        metaDescription: article.excerpt,
        ogTitle: article.title,
        ogDescription: article.excerpt,
      },
    })), 'draft');

    for (const [id, originalName, mimeType, sizeBytes, url, altText] of mainSiteSeed.media) {
      const existing = await dbGet<{ id: string }>('SELECT id FROM media_assets WHERE id = $1', [id]);
      if (existing) {
        skipped.media += 1;
        continue;
      }
      await dbRun(
        `INSERT INTO media_assets (id, file_name, original_name, mime_type, size_bytes, url, alt_text, source, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(id) DO NOTHING`,
        [id, originalName, originalName, mimeType, sizeBytes, url, altText, 'main-site', req.adminUser!.username, now]
      );
      imported.media += 1;
    }

    const totalImported = Object.values(imported).reduce((sum, count) => sum + count, 0);
    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'import_main_site',
      contentType: 'cms',
      recordId: 'main-site-import',
      recordTitle: 'Main website content import',
      result: 'success',
      details: `Imported ${totalImported} main-site records. Added: ${JSON.stringify(imported)}. Preserved existing records: ${JSON.stringify(skipped)}.`,
      ipAddress: getClientIp(req),
    });

    res.json({
      ok: true,
      imported,
      skipped,
      unavailable: {
        portfolio: 'The live Our Work page explicitly says there are no approved project case studies yet.',
        team: 'The current main-site source does not publish team member profiles.',
        testimonial: 'The current main-site source does not publish verified client testimonials.',
      },
      note: 'Main-site pages, service and solution catalogues, editorial topic drafts, and repository media assets are now available in their matching Control Centre modules. Editorial ideas remain drafts. Portfolio, Team, and Testimonials are not fabricated. This is a CMS import; it does not yet deploy CMS edits to the static main website.',
    });
  });

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
    const unpublish = nextStatus === 'draft' && req.body?.unpublish !== false;
    const saved = await saveDocument(
      docType,
      {
        ...existing,
        status: nextStatus,
        publishedAt: nextStatus === 'published' ? new Date().toISOString() : unpublish ? null : existing.publishedAt,
      },
      req.adminUser!.username,
      {
        unpublish,
        revisionAction: nextStatus === 'published' ? 'publish' : 'unpublish',
        revisionSummary:
          nextStatus === 'published'
            ? `Published ${getRecordTitle(existing)}`
            : `Unpublished ${getRecordTitle(existing)}`,
      }
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: nextStatus === 'published' ? 'publish' : 'unpublish',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(saved),
      result: 'success',
      details: `${nextStatus === 'published' ? 'Published' : 'Unpublished (moved to draft)'}: ${getRecordTitle(saved)}.`,
      ipAddress: getClientIp(req),
    });

    res.json({ item: saved });
  });

  app.get('/api/content/:type/:id/revisions', requireAuth, async (req, res) => {
    const { type: docType, id } = req.params;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }
    const items = await listRevisions(docType, id, 25);
    res.json({ items });
  });

  app.post('/api/content/:type/:id/revisions/:revId/restore', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { type: docType, id, revId } = req.params;
    if (!ALLOWED_CONTENT_TYPES.has(docType)) {
      res.status(400).json({ error: 'Invalid content type.' });
      return;
    }
    const rev = await getRevisionById(revId);
    if (!rev || rev.docType !== docType || rev.docId !== id) {
      res.status(404).json({ error: 'Revision not found.' });
      return;
    }

    const publishImmediately = Boolean(req.body?.publish);
    const restored = await saveDocument(
      docType,
      {
        ...rev.data,
        id,
        status: publishImmediately ? 'published' : 'draft',
      },
      req.adminUser!.username,
      {
        revisionAction: 'restore',
        revisionSummary: `Restored revision from ${new Date(rev.createdAt).toLocaleString()} (${publishImmediately ? 'published' : 'draft'})`,
      }
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'restore_revision',
      contentType: docType,
      recordId: id,
      recordTitle: getRecordTitle(restored),
      result: 'success',
      details: `Restored revision ${revId.slice(0, 8)} as ${publishImmediately ? 'published' : 'draft'}.`,
      ipAddress: getClientIp(req),
    });

    res.json({ item: restored });
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

  // Public file delivery endpoint for DB-backed, local, and proxied main-site media assets
  app.get('/api/media/:id/file', async (req, res) => {
    const { id } = req.params;
    const row = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (!row) {
      res.status(404).json({ error: 'Media file not found.' });
      return;
    }

    const sendBinary = (buf: Buffer, mime: string, cacheControl = 'public, max-age=31536000, immutable') => {
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (mime === 'image/svg+xml') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
      res.send(buf);
    };

    // Tier 1: Sanity CDN
    if (row.source === 'sanity' && row.url && /^https?:\/\//i.test(row.url)) {
      res.redirect(302, row.url);
      return;
    }

    // Tier 2: PostgreSQL / SQLite stored binary (serverless-safe, fast, durable)
    if (row.content_data_url && typeof row.content_data_url === 'string') {
      const match = row.content_data_url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1] || row.mime_type || 'application/octet-stream';
        const buf = Buffer.from(match[2], 'base64');
        sendBinary(buf, mime);
        return;
      }
    }

    // Tier 3: Local uploads folder (non-serverless dev/VM)
    if (!IS_SERVERLESS && row.file_name) {
      const filePath = path.join(UPLOADS_DIR, row.file_name);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (row.mime_type === 'image/svg+xml') {
          res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        }
        res.sendFile(filePath);
        return;
      }
    }

    // Tier 4: Server-side authenticated proxy for main-site / external URLs with automatic DB caching
    const fetchUpstreamBinary = async (
      targetUrl: string,
      headers: Record<string, string> = {}
    ): Promise<{ buf: Buffer; mime: string } | null> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const upstream = await fetch(targetUrl, {
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!upstream.ok) return null;
        const ct = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        // Strictly reject HTML / text error or login pages masquerading as images
        const isBinaryAsset =
          ct.startsWith('image/') ||
          ct === 'application/pdf' ||
          (ct === 'application/octet-stream' && Boolean(row.mime_type && row.mime_type.startsWith('image/')));
        if (!isBinaryAsset) return null;

        const arrayBuf = await upstream.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return null;
        const mime = ct === 'application/octet-stream' ? row.mime_type || 'image/png' : ct;
        return { buf, mime };
      } catch {
        return null;
      }
    };

    if (typeof row.url === 'string' && /^https?:\/\//i.test(row.url)) {
      let fetched: { buf: Buffer; mime: string } | null = null;
      const ghToken = (process.env.GITHUB_TOKEN || process.env.GITHUB_MEDIA_TOKEN || '').trim();
      const mainSiteUrl = (process.env.MAIN_SITE_URL || '').trim().replace(/\/$/, '');
      const vercelBypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();

      // 4A: Private GitHub raw URL with server-side GITHUB_TOKEN
      if (!fetched && ghToken && row.url.includes('raw.githubusercontent.com')) {
        fetched = await fetchUpstreamBinary(row.url, {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/octet-stream',
          'User-Agent': 'RYZITE-CMS-Media-Proxy',
        });
      }

      // 4B: Main site deployment URL (deriving /images/... path after /public)
      if (!fetched && mainSiteUrl && row.url.includes('/public/')) {
        const relPath = row.url.slice(row.url.indexOf('/public/') + '/public'.length);
        const headers: Record<string, string> = { 'User-Agent': 'RYZITE-CMS-Media-Proxy' };
        if (vercelBypass) headers['x-vercel-protection-bypass'] = vercelBypass;
        fetched = await fetchUpstreamBinary(`${mainSiteUrl}${relPath}`, headers);
      }

      // 4C: Direct public URL fetch (if repo becomes public or URL is a public CDN)
      if (!fetched) {
        fetched = await fetchUpstreamBinary(row.url, { 'User-Agent': 'RYZITE-CMS-Media-Proxy' });
      }

      if (fetched) {
        // Persist into PostgreSQL/SQLite cache (<= 4MB) so Vercel serverless serves it instantly forever
        if (fetched.buf.length <= 4 * 1024 * 1024) {
          try {
            const dataUrl = `data:${fetched.mime};base64,${fetched.buf.toString('base64')}`;
            const dims = extractImageDimensions(fetched.buf, fetched.mime);
            await dbRun(
              `UPDATE media_assets
               SET content_data_url = $1,
                   size_bytes = $2,
                   width = COALESCE(width, $3),
                   height = COALESCE(height, $4)
               WHERE id = $5`,
              [dataUrl, fetched.buf.length, dims.width, dims.height, id]
            );
          } catch {
            // Non-fatal: still serve the fetched binary
          }
        }
        sendBinary(fetched.buf, fetched.mime);
        return;
      }
    }

    // Tier 5: Bundled RYZITE branding logo fallback (ships inside /public/assets/branding/)
    const lowerName = String(row.original_name || row.file_name || '').toLowerCase();
    if (
      lowerName === 'ryzite-logo.png' ||
      lowerName === 'ryzite-footer-logo.png' ||
      lowerName === 'original logo.png'
    ) {
      const bundledPaths = [
        path.resolve(process.cwd(), 'public', 'assets', 'branding', 'ryzite-logo.png'),
        path.resolve(process.cwd(), 'dist', 'assets', 'branding', 'ryzite-logo.png'),
      ];
      for (const candidate of bundledPaths) {
        if (fs.existsSync(candidate)) {
          const buf = fs.readFileSync(candidate);
          sendBinary(buf, 'image/png', 'public, max-age=86400');
          return;
        }
      }
    }

    res.status(404).json({
      error:
        'Image binary could not be retrieved from the upstream source. Configure GITHUB_TOKEN or MAIN_SITE_URL in Vercel environment variables, or use "Replace File" in Media Library to upload this asset directly.',
    });
  });

  app.get('/api/media', requireAuth, async (_req, res) => {
    const rows = await dbAll<any>('SELECT * FROM media_assets ORDER BY uploaded_at DESC');
    const usageMap = await computeMediaUsageMap(rows);
    const items: MediaAsset[] = rows.map((r) => mapMediaRow(r, usageMap));
    res.json({ items });
  });

  app.get('/api/media/:id/usage', requireAuth, async (req, res) => {
    const { id } = req.params;
    const row = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (!row) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }
    const usageMap = await computeMediaUsageMap([row]);
    const usedIn = usageMap.get(id) || [];
    res.json({ id, usageCount: usedIn.length, usedIn });
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

      const safetyErr = validateUploadSafety(req.file.buffer, req.file.mimetype);
      if (safetyErr) {
        res.status(400).json({ error: safetyErr });
        return;
      }

      const id = `media-${crypto.randomUUID().slice(0, 8)}`;
      const altText = sanitizeString(req.body?.altText, 300);
      const title =
        sanitizeString(req.body?.title, 180) ||
        req.file.originalname.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      const caption = sanitizeString(req.body?.caption, 400);
      const description = sanitizeString(req.body?.description, 1000);
      const category = sanitizeString(req.body?.category, 60) || 'general';
      const generatedName = safeFileName(req.file.originalname, req.file.mimetype);
      const sha256 = computeSha256(req.file.buffer);
      const dims = extractImageDimensions(req.file.buffer, req.file.mimetype);

      const duplicateRow = await dbGet<{ id: string; original_name: string }>(
        'SELECT id, original_name FROM media_assets WHERE sha256 = $1 LIMIT 1',
        [sha256]
      );

      let url = '';
      let source: 'sanity' | 'local' | 'database' = 'local';
      let contentDataUrl: string | null = null;

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
        // Store base64 data URI in DB for files <= 4MB so serverless/Vercel & local never break
        if (req.file.size <= 4 * 1024 * 1024) {
          contentDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        if (!IS_SERVERLESS) {
          fs.writeFileSync(path.join(UPLOADS_DIR, generatedName), req.file.buffer);
          url = `/api/media/${id}/file?v=1`;
          source = 'local';
        } else if (contentDataUrl) {
          url = `/api/media/${id}/file?v=1`;
          source = 'database';
        } else {
          res.status(400).json({
            error:
              'Files over 4 MB on serverless require SANITY_API_TOKEN in Environment Variables for CDN storage.',
          });
          return;
        }
      }

      const now = new Date().toISOString();
      await dbRun(
        `INSERT INTO media_assets (
          id, file_name, original_name, mime_type, size_bytes, url, alt_text,
          title, caption, description, category, focal_x, focal_y, width, height,
          sha256, version, content_data_url, source, uploaded_by, uploaded_at, updated_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 50, 50, $12, $13, $14, 1, $15, $16, $17, $18, $19, $20)`,
        [
          id,
          generatedName,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          url,
          altText,
          title,
          caption,
          description,
          category,
          dims.width,
          dims.height,
          sha256,
          contentDataUrl,
          source,
          req.adminUser!.username,
          now,
          now,
          req.adminUser!.username,
        ]
      );

      await logAudit({
        adminUsername: req.adminUser!.username,
        adminName: req.adminUser!.name,
        action: 'upload_media',
        contentType: 'media',
        recordId: id,
        recordTitle: title || req.file.originalname,
        result: 'success',
        details: `Uploaded ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB) via ${source}.`,
        ipAddress: getClientIp(req),
      });

      const created = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
      res.status(201).json({
        item: {
          ...mapMediaRow(created),
          duplicateOf: duplicateRow ? duplicateRow.original_name : null,
        },
        duplicateWarning: duplicateRow
          ? `An identical file ("${duplicateRow.original_name}") already exists in the Media Library.`
          : null,
      });
    });
  });

  app.put('/api/media/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const existing = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Media asset not found.' });
      return;
    }

    const altText =
      req.body?.altText !== undefined ? sanitizeString(req.body.altText, 300) : existing.alt_text || '';
    const title =
      req.body?.title !== undefined ? sanitizeString(req.body.title, 180) : existing.title || '';
    const caption =
      req.body?.caption !== undefined ? sanitizeString(req.body.caption, 400) : existing.caption || '';
    const description =
      req.body?.description !== undefined
        ? sanitizeString(req.body.description, 1000)
        : existing.description || '';
    const category =
      req.body?.category !== undefined
        ? sanitizeString(req.body.category, 60) || 'general'
        : existing.category || 'general';
    const originalName =
      req.body?.originalName !== undefined && sanitizeString(req.body.originalName, 180)
        ? sanitizeString(req.body.originalName, 180).replace(/[/\\<>:"|?*]/g, '')
        : existing.original_name;

    const focalX =
      typeof req.body?.focalPoint?.x === 'number'
        ? Math.max(0, Math.min(100, req.body.focalPoint.x))
        : typeof existing.focal_x === 'number'
          ? existing.focal_x
          : 50;
    const focalY =
      typeof req.body?.focalPoint?.y === 'number'
        ? Math.max(0, Math.min(100, req.body.focalPoint.y))
        : typeof existing.focal_y === 'number'
          ? existing.focal_y
          : 50;

    const now = new Date().toISOString();
    await dbRun(
      `UPDATE media_assets
       SET alt_text = $1, title = $2, caption = $3, description = $4, category = $5,
           original_name = $6, focal_x = $7, focal_y = $8, updated_at = $9, updated_by = $10
       WHERE id = $11`,
      [
        altText,
        title,
        caption,
        description,
        category,
        originalName,
        focalX,
        focalY,
        now,
        req.adminUser!.username,
        id,
      ]
    );

    await logAudit({
      adminUsername: req.adminUser!.username,
      adminName: req.adminUser!.name,
      action: 'update_media',
      contentType: 'media',
      recordId: id,
      recordTitle: title || originalName,
      result: 'success',
      details: `Updated metadata (title/alt/caption/category/focal point) for "${originalName}".`,
      ipAddress: getClientIp(req),
    });

    const updated = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
    const usageMap = await computeMediaUsageMap([updated]);
    res.json({ item: mapMediaRow(updated, usageMap) });
  });

  app.post('/api/media/:id/replace', requireAuth, (req: AuthenticatedRequest, res) => {
    mediaUpload.single('file')(req, res, async (err: any) => {
      if (err || !req.file) {
        res.status(400).json({ error: err?.message || 'Replacement file is required.' });
        return;
      }

      const safetyErr = validateUploadSafety(req.file.buffer, req.file.mimetype);
      if (safetyErr) {
        res.status(400).json({ error: safetyErr });
        return;
      }

      const { id } = req.params;
      const existing = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Media asset not found.' });
        return;
      }

      const nextVersion = Number(existing.version || 1) + 1;
      const generatedName = safeFileName(req.file.originalname, req.file.mimetype);
      const sha256 = computeSha256(req.file.buffer);
      const dims = extractImageDimensions(req.file.buffer, req.file.mimetype);
      let newUrl = '';
      let source: 'sanity' | 'local' | 'database' = 'local';
      let contentDataUrl: string | null = null;

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
        if (req.file.size <= 4 * 1024 * 1024) {
          contentDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        if (!IS_SERVERLESS) {
          if (existing.source === 'local' && existing.file_name) {
            const oldPath = path.join(UPLOADS_DIR, existing.file_name);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          fs.writeFileSync(path.join(UPLOADS_DIR, generatedName), req.file.buffer);
          newUrl = `/api/media/${id}/file?v=${nextVersion}`;
          source = 'local';
        } else if (contentDataUrl) {
          newUrl = `/api/media/${id}/file?v=${nextVersion}`;
          source = 'database';
        } else {
          res.status(400).json({
            error:
              'Files over 4 MB on serverless require SANITY_API_TOKEN in Environment Variables.',
          });
          return;
        }
      }

      const now = new Date().toISOString();
      await dbRun(
        `UPDATE media_assets
         SET file_name = $1, original_name = $2, mime_type = $3, size_bytes = $4, url = $5,
             source = $6, width = $7, height = $8, sha256 = $9, version = $10,
             content_data_url = $11, updated_at = $12, updated_by = $13
         WHERE id = $14`,
        [
          generatedName,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          newUrl,
          source,
          dims.width,
          dims.height,
          sha256,
          nextVersion,
          contentDataUrl,
          now,
          req.adminUser!.username,
          id,
        ]
      );

      // Propagate new versioned URL across all CMS documents and global SEO settings
      const updatedRefs = await propagateMediaUrlChange(id, existing.url, newUrl);

      await logAudit({
        adminUsername: req.adminUser!.username,
        adminName: req.adminUser!.name,
        action: 'replace_media',
        contentType: 'media',
        recordId: id,
        recordTitle: existing.title || req.file.originalname,
        result: 'success',
        details: `Replaced asset with ${req.file.originalname} (v${nextVersion}); propagated to ${updatedRefs} record(s).`,
        ipAddress: getClientIp(req),
      });

      const updated = await dbGet<any>('SELECT * FROM media_assets WHERE id = $1', [id]);
      const usageMap = await computeMediaUsageMap([updated]);
      res.json({ item: mapMediaRow(updated, usageMap), updatedRefs });
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
      recordTitle: existing.title || existing.original_name,
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
      defaultOgMediaId: sanitizeString(req.body?.defaultOgMediaId ?? current.defaultOgMediaId, 80) || undefined,
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
    const audit = await runSeoAudit();
    res.json(audit);
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
