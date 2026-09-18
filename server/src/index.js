import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './config.js';
import './db.js';
import { startMaintenance } from './maintenance.js';
import { ApiError, normalizePhone } from './util.js';
import { sendOtp, verifyOtp } from './otp/service.js';
import { adminRouter } from './admin.js';
import { mcqRouter } from './mcq/routes.js';
import { seedMcqIfEmpty } from './mcq/seed.js';
import { requireAuth, wrap, SESSION_COOKIE } from './middleware.js';
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
function manualRelayUrl(whatsappNumber = '') {
  const text = config.manual.requestMessage.replace('{number}', whatsappNumber);
  return `https://wa.me/${config.manual.operatorNumber}?text=${encodeURIComponent(text)}`;
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: config.clientOrigin, credentials: true }));

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: config.sessionTtlDays * 86400 * 1000,
};

function requirePhone(req) {
  const phone = normalizePhone(req.body?.whatsappNumber);
  if (!phone) throw new ApiError(400, 'bad_number', 'Enter a valid WhatsApp number with country code.');
  return phone;
}

// ---- meta ---------------------------------------------------------------

app.get('/api/config', (req, res) => {
  res.json({
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
    // Static wa.me link so the client can (re-)open the operator chat instantly,
    // without waiting on /otp/send (keeps the click inside the user gesture).
    manualWhatsappUrl: config.otp.isManual ? manualRelayUrl() : null,
  });
});

app.use('/api/admin', adminRouter);
app.use('/api/mcq', mcqRouter);

// ---- OTP --------------------------------------------------------------

app.post(
  '/api/otp/send',
  wrap(async (req, res) => {
    const whatsappNumber = requirePhone(req);
    const purpose = req.body?.purpose === 'reset' ? 'reset' : 'register';

    if (purpose === 'register' && numberIsRegistered(whatsappNumber)) {
      throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.', {
        login: true,
      });
    }
    if (purpose === 'reset' && !numberIsRegistered(whatsappNumber)) {
      throw new ApiError(404, 'no_account', 'No account found for this number.', { register: true });
    }

    const result = await sendOtp({ whatsappNumber, purpose });
    const manual = config.otp.isManual
      ? { manual: true, whatsappUrl: manualRelayUrl(whatsappNumber) }
      : {};
    res.json({ ok: true, purpose, whatsappNumber, ...result, ...manual });
  }),
);

app.post(
  '/api/otp/verify',
  wrap((req, res) => {
    const whatsappNumber = requirePhone(req);
    const purpose = req.body?.purpose === 'reset' ? 'reset' : 'register';
    const code = String(req.body?.code || '').trim();
    const result = verifyOtp({ whatsappNumber, code, purpose });
    res.json({ ok: true, purpose, whatsappNumber, ...result });
  }),
);

// ---- registration / login / reset -----------------------------------

app.post(
  '/api/register',
  wrap((req, res) => {
    const { verificationToken, role, name, password } = req.body || {};
    const { sessionToken } = register({ verificationToken, role, name, password });
    res.cookie(SESSION_COOKIE, sessionToken, cookieOpts);
    res.json({ ok: true, account: accountView(sessionAccount(sessionToken)) });
  }),
);

app.post(
  '/api/login',
  wrap((req, res) => {
    const whatsappNumber = requirePhone(req);
    const { sessionToken } = login({ whatsappNumber, password: String(req.body?.password || '') });
    res.cookie(SESSION_COOKIE, sessionToken, cookieOpts);
    res.json({ ok: true, account: accountView(sessionAccount(sessionToken)) });
  }),
);

app.post(
  '/api/password-reset',
  wrap((req, res) => {
    const { verificationToken, password } = req.body || {};
    resetPassword({ verificationToken, password });
    res.json({ ok: true });
  }),
);

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOpts, maxAge: undefined });
  res.json({ ok: true });
});

// ---- account / dependents ------------------------------------------

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, account: accountView(req.account) });
});

app.post(
  '/api/dependents',
  requireAuth,
  wrap((req, res) => {
    const account = addDependent(req.account, {
      name: req.body?.name,
      grade: req.body?.grade,
    });
    res.json({ ok: true, account });
  }),
);

app.delete(
  '/api/dependents/:id',
  requireAuth,
  wrap((req, res) => {
    const account = removeDependent(req.account, Number(req.params.id));
    res.json({ ok: true, account });
  }),
);

// ---- errors ---------------------------------------------------------

app.use((req, res) => res.status(404).json({ ok: false, code: 'not_found', message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ ok: false, code: err.code, message: err.message, ...err.extra });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ ok: false, code: 'number_taken', message: 'This number already has an account.' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ ok: false, code: 'server_error', message: 'Something went wrong.' });
});

startMaintenance();
const mcqSeed = seedMcqIfEmpty();

app.listen(config.port, () => {
  /* eslint-disable no-console */
  console.log(`API on http://localhost:${config.port}  (OTP provider: ${config.otpProvider})`);
  console.log(`MCQ bank: ${mcqSeed.count} questions${mcqSeed.seeded ? ' (just seeded)' : ''}`);
  if (config.otp.isManual) {
    console.log(`Operator panel: ${config.clientOrigin}/panel/${config.admin.panelSlug}`);
    if (config.admin.password === 'change-me') {
      console.log('  ⚠  ADMIN_PASSWORD is still "change-me" — set it in server/.env');
    }
    console.log(
      config.telegram.enabled
        ? `Telegram push: on (${config.telegram.chatIds.length} chat${config.telegram.chatIds.length === 1 ? '' : 's'})`
        : 'Telegram push: off (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)',
    );
  }
  /* eslint-enable no-console */
});
