import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const dataDir = path.join(__dirname, '..', 'data');

// Load .env if present (Node 22 built-in, no dependency).
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    /* ignore malformed .env */
  }
}

const num = (key, fallback) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== undefined && process.env[key] !== ''
    ? v
    : fallback;
};

export const config = {
  // API_PORT is preferred; PORT is honoured only when it isn't the Vite dev port
  // (some launchers inject PORT for the front-end).
  port: num('API_PORT', num('PORT', 4000) === 5173 ? 4000 : num('PORT', 4000)),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',

  // Provider: 'mock' | 'whatsapp' | 'manual'.
  //   manual  = the operator relays the code by hand (no API). Defaults strategy to
  //             'phone_formula' and length to 4.
  otpProvider: process.env.OTP_PROVIDER || 'mock',
  otp: {
    // 'random' (default) or 'phone_formula' (code derived from the number).
    strategy:
      process.env.OTP_STRATEGY ||
      (process.env.OTP_PROVIDER === 'manual' ? 'phone_formula' : 'random'),
    length: num('OTP_LENGTH', process.env.OTP_PROVIDER === 'manual' ? 4 : 6),
    ttlSeconds: num('OTP_TTL_SECONDS', 300),
    resendCooldownSeconds: num('OTP_RESEND_COOLDOWN_SECONDS', 45),
    maxAttempts: num('OTP_MAX_ATTEMPTS', 3),
    lockMinutes: num('OTP_LOCK_MINUTES', 30),
    // phone_formula: OTP = (N * mulA + addB) mod (10 ** length), N = national digits.
    formula: {
      mulA: num('OTP_FORMULA_MUL', 7919),
      addB: num('OTP_FORMULA_ADD', 104729),
    },
  },

  // OTP_PROVIDER=manual — operator relay.
  manual: {
    // Operator's WhatsApp number in E.164 digits, no '+' (e.g. 917510563991).
    operatorNumber: (process.env.OTP_MANUAL_OPERATOR_NUMBER || '917510563991').replace(/\D/g, ''),
    // Optional {number} placeholder is replaced with the requester's number. Left
    // out by default — WhatsApp already shows the operator who sent the message.
    requestMessage:
      process.env.OTP_MANUAL_REQUEST_MESSAGE ||
      'Hi, I requested an OTP for the Test Prep website.',
  },

  // Telegram push to the operator on each OTP request (manual mode). Enabled when
  // both a bot token and at least one chat id are present.
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatIds: (process.env.TELEGRAM_CHAT_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    get enabled() {
      return Boolean(this.botToken && this.chatIds.length);
    },
  },

  admin: {
    password: process.env.ADMIN_PASSWORD || 'change-me',
    // Secret path segment for the operator panel: /panel/<slug>. Auto-generated and
    // persisted to server/data/.admin-slug when not set here.
    panelSlug: process.env.ADMIN_PANEL_SLUG || '',
    sessionHours: num('ADMIN_SESSION_HOURS', 12),
  },

  // WhatsApp Business Platform (Cloud API) — used when OTP_PROVIDER=whatsapp.
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    token: process.env.WHATSAPP_TOKEN || '',
    // A pre-approved AUTHENTICATION-category template in the client's WABA.
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'otp_verification',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en_US',
    // Authentication templates require an OTP button (COPY_CODE / ONE_TAP); the
    // send payload repeats the code in a url-type button component. Set to false
    // only if your template genuinely has no button.
    includeButton: (process.env.WHATSAPP_TEMPLATE_HAS_BUTTON || 'true') !== 'false',
    buttonSubType: process.env.WHATSAPP_TEMPLATE_BUTTON_SUBTYPE || 'url',
  },

  login: {
    maxAttempts: num('LOGIN_MAX_ATTEMPTS', 5),
    lockMinutes: num('LOGIN_LOCK_MINUTES', 15),
  },

  verificationTokenTtlHours: num('VERIFICATION_TOKEN_TTL_HOURS', 24),
  sessionTtlDays: num('SESSION_TTL_DAYS', 30),

  // Grade list for the dependent dropdown (spec open question — default 6–12).
  grades: (process.env.GRADES || '6,7,8,9,10,11,12')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean),

  roleCaps: {
    parent: { dependentLabel: 'child', dependentLabelPlural: 'children', cap: 2 },
    teacher: { dependentLabel: 'student', dependentLabelPlural: 'students', cap: 5 },
  },
};

// Stable secret slug for the operator panel — from env, else generated once and
// persisted so the URL survives restarts.
if (!config.admin.panelSlug) {
  const slugFile = path.join(dataDir, '.admin-slug');
  try {
    config.admin.panelSlug = fs.readFileSync(slugFile, 'utf8').trim();
  } catch {
    config.admin.panelSlug = crypto.randomBytes(12).toString('hex');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(slugFile, config.admin.panelSlug);
    } catch {
      /* non-fatal: slug just won't persist */
    }
  }
}

config.otp.isManual = config.otpProvider === 'manual';
