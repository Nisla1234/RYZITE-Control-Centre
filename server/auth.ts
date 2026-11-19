import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from './db.ts';
import type { AdminRole, AdminUser } from '../src/types/cms.ts';

export const SESSION_COOKIE_NAME = 'ryzite_session';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export interface AuthenticatedRequest extends Request {
  adminUser?: AdminUser;
  sessionTokenHash?: string;
}

export function getClientIp(req: Request): string {
  const fwd =
    req.headers['x-forwarded-for'] ||
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-nf-client-connection-ip'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function hashToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'ryzite-dev-session-secret-change-in-production';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export async function checkLoginRateLimit(
  identifier: string
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const cutoff = Date.now() - WINDOW_MS;
  await dbRun('DELETE FROM login_attempts WHERE attempted_at < $1', [cutoff]);

  const rows = await dbAll<{ attempted_at: string | number }>(
    'SELECT attempted_at FROM login_attempts WHERE identifier = $1 AND attempted_at >= $2 ORDER BY attempted_at ASC',
    [identifier, cutoff]
  );

  if (rows.length >= MAX_FAILED_ATTEMPTS) {
    const oldest = Number(rows[0].attempted_at);
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function recordFailedLogin(identifier: string): Promise<void> {
  await dbRun('INSERT INTO login_attempts (identifier, attempted_at) VALUES ($1, $2)', [
    identifier,
    Date.now(),
  ]);
}

export async function clearFailedLogins(identifier: string): Promise<void> {
  await dbRun('DELETE FROM login_attempts WHERE identifier = $1', [identifier]);
}

export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent: string,
  ttlHours = 24
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await dbRun(
    `INSERT INTO admin_sessions (token_hash, user_id, ip_address, user_agent, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tokenHash, userId, ipAddress, userAgent.slice(0, 240), expiresAt.toISOString(), now.toISOString()]
  );

  await dbRun('UPDATE admin_users SET last_login_at = $1 WHERE id = $2', [now.toISOString(), userId]);

  return { rawToken, expiresAt };
}

export async function revokeSession(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await dbRun('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
}

function isHttpsRequest(req: Request): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return (
    req.secure ||
    fwdProto === 'https' ||
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL) ||
    process.env.NETLIFY === 'true'
  );
}

function isCrossSiteRequest(req: Request): boolean {
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  return secFetchSite === 'cross-site' || secFetchDest === 'iframe';
}

function getCookieOptions(req: Request, expiresAt?: Date) {
  const https = isHttpsRequest(req);
  const crossSite = https && isCrossSiteRequest(req);
  return {
    httpOnly: true,
    secure: https,
    sameSite: crossSite ? ('none' as const) : ('lax' as const),
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
    ...(crossSite ? { partitioned: true } : {}),
  } as any;
}

export function setSessionCookie(req: Request, res: Response, rawToken: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, getCookieOptions(req, expiresAt));
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req));
}

export async function getSessionTtlHours(): Promise<number> {
  const row = await dbGet<{ value_json: string }>('SELECT value_json FROM site_settings WHERE key = $1', [
    'global_seo',
  ]);
  if (row) {
    try {
      const parsed = JSON.parse(row.value_json);
      if (parsed.sessionTimeoutHours && Number(parsed.sessionTimeoutHours) >= 1) {
        return Math.min(168, Number(parsed.sessionTimeoutHours));
      }
    } catch {
      // ignore
    }
  }
  return Number(process.env.SESSION_TTL_HOURS || 24);
}

export function extractSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === 'string') {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }
  return null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const rawToken = extractSessionToken(req);
    if (!rawToken) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }

    const tokenHash = hashToken(rawToken);
    const row = await dbGet<{
      expires_at: string;
      id: string;
      username: string;
      name: string;
      email: string;
      role: AdminRole;
      avatar_url: string | null;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT s.expires_at, u.id, u.username, u.name, u.email, u.role, u.avatar_url, u.last_login_at, u.created_at
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [tokenHash]
    );

    if (!row) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
      return;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await dbRun('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash]);
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
      return;
    }

    req.adminUser = {
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role,
      avatarUrl: row.avatar_url || null,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    };
    req.sessionTokenHash = tokenHash;
    next();
  } catch (err: any) {
    console.error('[Auth Middleware Error]', err);
    res.status(503).json({ error: err?.message || 'Authentication service unavailable.' });
  }
}

export function requireRole(...roles: AdminRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.adminUser || !roles.includes(req.adminUser.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this operation.' });
      return;
    }
    next();
  };
}
