import { MockOtpProvider } from './providers/mock.js';
import { WhatsAppOtpProvider } from './providers/whatsapp.js';
import { ManualOtpProvider } from './providers/manual.js';

const providers = {
  mock: () => new MockOtpProvider(),
  whatsapp: () => new WhatsAppOtpProvider(),
  manual: () => new ManualOtpProvider(),
};

/** Built per-request from the request's config — no module-level singleton. */
export function getOtpProvider(config) {
  const factory = providers[config.otpProvider];
  if (!factory) {
    throw new Error(
      `Unknown OTP_PROVIDER "${config.otpProvider}". Known: ${Object.keys(providers).join(', ')}`,
    );
  }
  return factory();
}
