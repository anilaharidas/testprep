import { config } from '../config.js';
import { MockOtpProvider } from './providers/mock.js';
import { WhatsAppOtpProvider } from './providers/whatsapp.js';
import { ManualOtpProvider } from './providers/manual.js';

const providers = {
  mock: () => new MockOtpProvider(),
  whatsapp: () => new WhatsAppOtpProvider(),
  manual: () => new ManualOtpProvider(),
};

const factory = providers[config.otpProvider];
if (!factory) {
  throw new Error(
    `Unknown OTP_PROVIDER "${config.otpProvider}". Known: ${Object.keys(providers).join(', ')}`,
  );
}

export const otpProvider = factory();

// eslint-disable-next-line no-console
console.log(`OTP provider: ${otpProvider.name} (strategy: ${config.otp.strategy})`);
