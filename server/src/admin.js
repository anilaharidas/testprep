import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { config } from './config.js';
import { ApiError, randomToken, nowIso, isoIn, isPast } from './util.js';

const ADMIN_COOKIE = 'tp_admin';

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: config.admin.sessionHours * 3600 * 1000,
};

const timingSafeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

function adminAccount(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT * FROM admin_session WHERE token = ?`).get(token);
  if (!row || isPast(row.expires_at)) return null;
  return row;
}

export function requireAdmin(req, res, next) {
  if (!adminAccount(req.cookies[ADMIN_COOKIE])) {
    return next(new ApiError(401, 'admin_unauthenticated', 'Sign in to the operator panel.'));
  }
  return next();
}

export const adminRouter = express.Router();

adminRouter.post('/login', (req, res, next) => {
  const { slug, password } = req.body || {};
  const slugOk = timingSafeEqual(slug || '', config.admin.panelSlug);
  const pwOk = timingSafeEqual(password || '', config.admin.password);
  if (!slugOk || !pwOk) {
    return next(new ApiError(401, 'admin_bad_credentials', 'Wrong panel link or password.'));
  }
  const token = randomToken();
  db.prepare(`INSERT INTO admin_session (token, expires_at) VALUES (?, ?)`).run(
    token,
    isoIn(config.admin.sessionHours * 3600 * 1000),
  );
  res.cookie(ADMIN_COOKIE, token, cookieOpts);
  return res.json({ ok: true });
});

adminRouter.post('/logout', (req, res) => {
  const token = req.cookies[ADMIN_COOKIE];
  if (token) db.prepare(`DELETE FROM admin_session WHERE token = ?`).run(token);
  res.clearCookie(ADMIN_COOKIE, { ...cookieOpts, maxAge: undefined });
  res.json({ ok: true });
});

adminRouter.get('/session', requireAdmin, (req, res) => {
  res.json({ ok: true, operatorNumber: config.manual.operatorNumber });
});

// Recent OTP requests, newest first — the operator relay queue.
adminRouter.get('/requests', requireAdmin, (req, res) => {
  const rows = db
    .prepare(`
      SELECT id, whatsapp_number, purpose, operator_code, attempts, expires_at,
             locked_until, consumed_at, verified_at, last_sent_at, created_at
      FROM otp_challenge
      WHERE last_sent_at > datetime('now', '-3 hours')
      ORDER BY id DESC
      LIMIT 100
    `)
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

  res.json({ ok: true, now: nowIso(), requests });
});
