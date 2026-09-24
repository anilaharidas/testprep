import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

import { buildConfig } from './config.js';
import { makeDb } from './db.js';
import { ApiError, normalizePhone } from './util.js';
import { sweep } from './maintenance.js';
import { sendOtp, verifyOtp } from './otp/service.js';
import { adminApp } from './admin.js';
import { mcqApp } from './mcq/routes.js';
import { shareApp } from './mcq/shareRoutes.js';
import { requireAuth, SESSION_COOKIE } from './middleware.js';
import {
  register,
  registerUnverified,
  markPhoneVerified,
  login,
  resetPassword,
  numberIsRegistered,
  sessionAccount,
  destroySession,
  accountView,
} from './accounts.js';

// wa.me deep link the requester opens to ask the operator for their code.
function manualRelayUrl(config, whatsappNumber = '') {
  const text = config.manual.requestMessage.replace('{number}', whatsappNumber);
  return `https://wa.me/${config.manual.operatorNumber}?text=${encodeURIComponent(text)}`;
}

function requirePhone(body) {
  const phone = normalizePhone(body?.whatsappNumber);
  if (!phone) throw new ApiError(400, 'bad_number', 'Enter a valid WhatsApp number with country code.');
  return phone;
}

function cookieOpts(config) {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProd,
    maxAge: config.sessionTtlDays * 86400, // Hono cookie maxAge is in seconds
    path: '/',
  };
}

export function createApp() {
  const app = new Hono();

  // Same-origin (Pages serves client + API from one domain), so no CORS needed —
  // unlike the old Express server, which had to allow a separate Vite dev origin.
  app.use('*', async (c, next) => {
    const config = buildConfig(c.env);
    const db = makeDb(c.env);
    const waitUntil = (p) => c.executionCtx.waitUntil(Promise.resolve(p).catch(() => {}));
    c.set('ctx', { db, config, waitUntil });

    // No Cron Trigger on Pages Functions — sweep expired OTP/session state
    // opportunistically instead of on a timer.
    if (Math.random() < 1 / 50) {
      c.executionCtx.waitUntil(sweep(db).catch(() => {}));
    }

    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ ok: false, code: err.code, message: err.message, ...err.extra }, err.status);
    }
    if (err?.message && /UNIQUE constraint failed/i.test(err.message)) {
      return c.json({ ok: false, code: 'number_taken', message: 'This number already has an account.' }, 409);
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return c.json({ ok: false, code: 'server_error', message: 'Something went wrong.' }, 500);
  });

  app.notFound((c) => c.json({ ok: false, code: 'not_found', message: 'Not found' }, 404));

  // ---- meta ---------------------------------------------------------------

  app.get('/api/config', (c) => {
    const { config } = c.get('ctx');
    return c.json({
      grades: config.grades,
      otpProvider: config.otpProvider,
      otpLength: config.otp.length,
      otpMode: config.otp.isManual ? 'manual' : 'auto',
      manualWhatsappUrl: config.otp.isManual ? manualRelayUrl(config) : null,
    });
  });

  app.route('/api/admin', adminApp);
  app.route('/api/mcq', mcqApp);
  app.route('/api/share/:token', shareApp);

  // ---- OTP --------------------------------------------------------------

  // Availability check only — no OTP challenge created, no operator ping. Lets
  // the client find out up front whether a number is free/registered before
  // committing to "Verify now" (which does send a real code) or offering
  // "Verify later" (which shouldn't generate any OTP activity at all).
  app.post('/api/check-number', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const whatsappNumber = requirePhone(body);
    const purpose = body?.purpose === 'reset' ? 'reset' : 'register';

    if (purpose === 'register' && (await numberIsRegistered(ctx.db, whatsappNumber))) {
      throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.', {
        login: true,
      });
    }
    if (purpose === 'reset' && !(await numberIsRegistered(ctx.db, whatsappNumber))) {
      throw new ApiError(404, 'no_account', 'No account found for this number.', { register: true });
    }
    return c.json({ ok: true, whatsappNumber });
  });

  app.post('/api/otp/send', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const whatsappNumber = requirePhone(body);
    const purpose = body?.purpose === 'reset' ? 'reset' : 'register';

    if (purpose === 'register' && (await numberIsRegistered(ctx.db, whatsappNumber))) {
      throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.', {
        login: true,
      });
    }
    if (purpose === 'reset' && !(await numberIsRegistered(ctx.db, whatsappNumber))) {
      throw new ApiError(404, 'no_account', 'No account found for this number.', { register: true });
    }

    const result = await sendOtp(ctx, { whatsappNumber, purpose });
    const manual = ctx.config.otp.isManual
      ? { manual: true, whatsappUrl: manualRelayUrl(ctx.config, whatsappNumber) }
      : {};
    return c.json({ ok: true, purpose, whatsappNumber, ...result, ...manual });
  });

  app.post('/api/otp/verify', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const whatsappNumber = requirePhone(body);
    const purpose = body?.purpose === 'reset' ? 'reset' : 'register';
    const code = String(body?.code || '').trim();
    const result = await verifyOtp(ctx, { whatsappNumber, code, purpose });
    return c.json({ ok: true, purpose, whatsappNumber, ...result });
  });

  // ---- registration / login / reset -----------------------------------

  app.post('/api/register', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const { verificationToken, name, password } = body || {};
    const { sessionToken } = await register(ctx, { verificationToken, name, password });
    setCookie(c, SESSION_COOKIE, sessionToken, cookieOpts(ctx.config));
    const account = await sessionAccount(ctx.db, sessionToken);
    return c.json({ ok: true, account: accountView(account) });
  });

  app.post('/api/register-unverified', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const whatsappNumber = requirePhone(body);
    const { name, password } = body || {};
    const { sessionToken } = await registerUnverified(ctx, { name, password, whatsappNumber });
    setCookie(c, SESSION_COOKIE, sessionToken, cookieOpts(ctx.config));
    const account = await sessionAccount(ctx.db, sessionToken);
    return c.json({ ok: true, account: accountView(account) });
  });

  app.post('/api/login', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const whatsappNumber = requirePhone(body);
    const { sessionToken } = await login(ctx, {
      whatsappNumber,
      password: String(body?.password || ''),
    });
    setCookie(c, SESSION_COOKIE, sessionToken, cookieOpts(ctx.config));
    const account = await sessionAccount(ctx.db, sessionToken);
    return c.json({ ok: true, account: accountView(account) });
  });

  app.post('/api/password-reset', async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const { verificationToken, password } = body || {};
    await resetPassword(ctx, { verificationToken, password });
    return c.json({ ok: true });
  });

  app.post('/api/logout', async (c) => {
    const ctx = c.get('ctx');
    await destroySession(ctx.db, getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: ctx.config.isProd, sameSite: 'Lax' });
    return c.json({ ok: true });
  });

  // ---- account ----------------------------------------------------------

  app.get('/api/me', requireAuth(), async (c) => {
    return c.json({ ok: true, account: accountView(c.get('account')) });
  });

  // ---- deferred phone verification -------------------------------------

  app.post('/api/verify-phone/send', requireAuth(), async (c) => {
    const ctx = c.get('ctx');
    const account = c.get('account');
    if (account.phone_verified_at) {
      throw new ApiError(409, 'already_verified', 'This number is already verified.');
    }
    const result = await sendOtp(ctx, { whatsappNumber: account.whatsapp_number, purpose: 'register' });
    const manual = ctx.config.otp.isManual
      ? { manual: true, whatsappUrl: manualRelayUrl(ctx.config, account.whatsapp_number) }
      : {};
    return c.json({ ok: true, whatsappNumber: account.whatsapp_number, ...result, ...manual });
  });

  app.post('/api/verify-phone/confirm', requireAuth(), async (c) => {
    const ctx = c.get('ctx');
    const account = c.get('account');
    const body = await c.req.json().catch(() => ({}));
    const code = String(body?.code || '').trim();
    await verifyOtp(ctx, { whatsappNumber: account.whatsapp_number, code, purpose: 'register' });
    const fresh = await markPhoneVerified(ctx.db, account.id);
    return c.json({ ok: true, account: accountView(fresh) });
  });

  return app;
}
