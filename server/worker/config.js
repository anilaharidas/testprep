// Builds the app config from a Worker's `env` (Pages env vars / secrets) instead of
// process.env — there is no process.env in the Workers runtime, and env only arrives
// per-request via the fetch handler, so config is built fresh per-request rather than
// cached as a module-level singleton.
export function buildConfig(env) {
  const num = (key, fallback) => {
    const v = Number(env[key]);
    return Number.isFinite(v) && env[key] !== undefined && env[key] !== '' ? v : fallback;
  };

  const config = {
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    isProd: (env.NODE_ENV || 'production') === 'production',

    // Provider: 'mock' | 'whatsapp' | 'manual'.
    otpProvider: env.OTP_PROVIDER || 'mock',
    otp: {
      strategy: env.OTP_STRATEGY || (env.OTP_PROVIDER === 'manual' ? 'phone_formula' : 'random'),
      length: num('OTP_LENGTH', env.OTP_PROVIDER === 'manual' ? 4 : 6),
      ttlSeconds: num('OTP_TTL_SECONDS', 300),
      resendCooldownSeconds: num('OTP_RESEND_COOLDOWN_SECONDS', 45),
      maxAttempts: num('OTP_MAX_ATTEMPTS', 3),
      lockMinutes: num('OTP_LOCK_MINUTES', 30),
      formula: {
        mulA: num('OTP_FORMULA_MUL', 7919),
        addB: num('OTP_FORMULA_ADD', 104729),
        purposeStep: num('OTP_FORMULA_PURPOSE_STEP', 2749),
        resendStep: num('OTP_FORMULA_RESEND_STEP', 3517),
      },
    },

    // OTP_PROVIDER=manual — operator relay.
    manual: {
      operatorNumber: (env.OTP_MANUAL_OPERATOR_NUMBER || '917510563991').replace(/\D/g, ''),
      requestMessage:
        env.OTP_MANUAL_REQUEST_MESSAGE || 'Hi, I requested an OTP for the Test Prep website.',
    },

    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      chatIds: (env.TELEGRAM_CHAT_ID || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      get enabled() {
        return Boolean(this.botToken && this.chatIds.length);
      },
    },

    admin: {
      password: env.ADMIN_PASSWORD || 'change-me',
      // Must be set explicitly (Pages env var/secret) — no filesystem to
      // auto-generate-and-persist a slug the way the old Express server did.
      panelSlug: env.ADMIN_PANEL_SLUG || '',
      sessionHours: num('ADMIN_SESSION_HOURS', 12),
    },

    whatsapp: {
      apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      token: env.WHATSAPP_TOKEN || '',
      templateName: env.WHATSAPP_TEMPLATE_NAME || 'otp_verification',
      templateLang: env.WHATSAPP_TEMPLATE_LANG || 'en_US',
      includeButton: (env.WHATSAPP_TEMPLATE_HAS_BUTTON || 'true') !== 'false',
      buttonSubType: env.WHATSAPP_TEMPLATE_BUTTON_SUBTYPE || 'url',
    },

    login: {
      maxAttempts: num('LOGIN_MAX_ATTEMPTS', 5),
      lockMinutes: num('LOGIN_LOCK_MINUTES', 15),
    },

    verificationTokenTtlHours: num('VERIFICATION_TOKEN_TTL_HOURS', 24),
    sessionTtlDays: num('SESSION_TTL_DAYS', 30),

    grades: (env.GRADES || '6,7,8,9,10')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
  };

  config.otp.isManual = config.otpProvider === 'manual';
  return config;
}
