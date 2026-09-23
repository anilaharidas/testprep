import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

import { buildConfig } from './config.js';
import { makeDb } from './db.js';
import { ApiError, normalizePhone } from './util.js';
import { sweep } from './maintenance.js';
import { sendOtp, verifyOtp } from './otp/service.js';
import { adminApp } from './admin.js';
import { mcqApp } from './mcq/routes.js';
import { requireAuth, SESSION_COOKIE } from './middleware.js';
import {
  register,
  login,
  resetPassword,
  numberIsRegistered,
  sessionAccount,
  destroySession,
  accountView,
  addDependent,
  removeDependent,
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
    c.set('ctx', { db, config });

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
      roles: Object.entries(config.roleCaps).map(([role, m]) => ({
        role,
        cap: m.cap,
        dependentLabel: m.dependentLabel,
        dependentLabelPlural: m.dependentLabelPlural,
      })),
      otpProvider: config.otpProvider,
      otpLength: config.otp.length,
      otpMode: config.otp.isManual ? 'manual' : 'auto',
      manualWhatsappUrl: config.otp.isManual ? manualRelayUrl(config) : null,
    });
  });

  app.route('/api/admin', adminApp);
  app.route('/api/mcq', mcqApp);

  // ---- OTP --------------------------------------------------------------

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
    const { verificationToken, role, name, password } = body || {};
    const { sessionToken } = await register(ctx, { verificationToken, role, name, password });
    setCookie(c, SESSION_COOKIE, sessionToken, cookieOpts(ctx.config));
    const account = await sessionAccount(ctx.db, sessionToken);
    return c.json({ ok: true, account: await accountView(ctx, account) });
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
    return c.json({ ok: true, account: await accountView(ctx, account) });
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

  // ---- account / dependents ------------------------------------------

  app.get('/api/me', requireAuth(), async (c) => {
    const ctx = c.get('ctx');
    return c.json({ ok: true, account: await accountView(ctx, c.get('account')) });
  });

  app.post('/api/dependents', requireAuth(), async (c) => {
    const ctx = c.get('ctx');
    const body = await c.req.json().catch(() => ({}));
    const account = await addDependent(ctx, c.get('account'), { name: body?.name, grade: body?.grade });
    return c.json({ ok: true, account });
  });

  app.delete('/api/dependents/:id', requireAuth(), async (c) => {
    const ctx = c.get('ctx');
    const account = await removeDependent(ctx, c.get('account'), Number(c.req.param('id')));
    return c.json({ ok: true, account });
  });

  return app;
}
