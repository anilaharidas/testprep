import crypto from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { ApiError, randomToken, nowIso, isoIn, isPast } from './util.js';

const ADMIN_COOKIE = 'tp_admin';

function cookieOpts(config) {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProd,
    maxAge: config.admin.sessionHours * 3600, // Hono cookie maxAge is in seconds
    path: '/',
  };
}

const timingSafeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

async function adminAccount(db, token) {
  if (!token) return null;
  const row = await db.prepare(`SELECT * FROM admin_session WHERE token = ?`).get(token);
  if (!row || isPast(row.expires_at)) return null;
  return row;
}

export function requireAdmin() {
  return async (c, next) => {
    const { db } = c.get('ctx');
    if (!(await adminAccount(db, getCookie(c, ADMIN_COOKIE)))) {
      throw new ApiError(401, 'admin_unauthenticated', 'Sign in to the operator panel.');
    }
    await next();
  };
}

export const adminApp = new Hono();

adminApp.post('/login', async (c) => {
  const { db, config } = c.get('ctx');
  const body = await c.req.json().catch(() => ({}));
  const { slug, password } = body || {};
  const slugOk = timingSafeEqual(slug || '', config.admin.panelSlug);
  const pwOk = timingSafeEqual(password || '', config.admin.password);
  if (!slugOk || !pwOk) {
    throw new ApiError(401, 'admin_bad_credentials', 'Wrong panel link or password.');
  }
  const token = randomToken();
  await db
    .prepare(`INSERT INTO admin_session (token, expires_at) VALUES (?, ?)`)
    .run(token, isoIn(config.admin.sessionHours * 3600 * 1000));
  setCookie(c, ADMIN_COOKIE, token, cookieOpts(config));
  return c.json({ ok: true });
});

adminApp.post('/logout', async (c) => {
  const { db, config } = c.get('ctx');
  const token = getCookie(c, ADMIN_COOKIE);
  if (token) await db.prepare(`DELETE FROM admin_session WHERE token = ?`).run(token);
  deleteCookie(c, ADMIN_COOKIE, { path: '/', secure: config.isProd, sameSite: 'Lax' });
  return c.json({ ok: true });
});

adminApp.get('/session', requireAdmin(), (c) => {
  const { config } = c.get('ctx');
  return c.json({ ok: true, operatorNumber: config.manual.operatorNumber });
});

// Recent OTP requests, newest first — the operator relay queue.
adminApp.get('/requests', requireAdmin(), async (c) => {
  const { db } = c.get('ctx');
  const rows = await db
    .prepare(
      `SELECT id, whatsapp_number, purpose, operator_code, attempts, expires_at,
              locked_until, consumed_at, verified_at, last_sent_at, created_at
       FROM otp_challenge
       WHERE last_sent_at > datetime('now', '-3 hours')
       ORDER BY id DESC
       LIMIT 100`,
    )
    .all();

  const requests = rows.map((r) => {
    let status = 'pending';
    if (r.verified_at) status = 'verified';
    else if (r.locked_until && !isPast(r.locked_until)) status = 'locked';
    else if (r.consumed_at) status = 'superseded';
    else if (isPast(r.expires_at)) status = 'expired';
    return {
      id: r.id,
      number: r.whatsapp_number,
      purpose: r.purpose,
      code: r.operator_code, // null when not manual mode
      attempts: r.attempts,
      status,
      requestedAt: r.last_sent_at,
      expiresAt: r.expires_at,
    };
  });

  return c.json({ ok: true, now: nowIso(), requests });
});
