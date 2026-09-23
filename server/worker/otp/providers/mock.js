import { OtpProvider } from './base.js';
import { nowIso } from '../../util.js';

/**
 * Development provider: does not contact WhatsApp. It logs the code to the server
 * console and hands it back so the client can show a "dev mode" banner.
 */
export class MockOtpProvider extends OtpProvider {
  get name() {
    return 'mock';
  }

  async send(config, { whatsappNumber, code, purpose }) {
    // eslint-disable-next-line no-console
    console.log(
      `\n  [mock-otp] ${purpose} code for ${whatsappNumber}: ${code}  (would be sent over WhatsApp)\n`,
    );
    return { deliveredAt: nowIso(), providerRef: `mock-${Date.now()}`, devCode: code };
  }
}
