import { OtpProvider } from './base.js';
import { nowIso } from '../../util.js';
import { notifyOtpRequest } from '../../notify/telegram.js';

/**
 * Manual relay: no message is sent by the server. The requester opens WhatsApp to
 * the operator (link built in the /otp/send route), and the operator reads the code
 * from the operator panel (/panel/<slug>) and replies by hand.
 */
export class ManualOtpProvider extends OtpProvider {
  get name() {
    return 'manual';
  }

  async send(ctx, { whatsappNumber, code, purpose }) {
    const { config, waitUntil } = ctx;
    // eslint-disable-next-line no-console
    console.log(
      `[manual-otp] ${purpose} request from ${whatsappNumber} — code ${code} — ` +
        `relay it from /panel/${config.admin.panelSlug}`,
    );
    waitUntil(notifyOtpRequest(config, { number: whatsappNumber, code, purpose }));
    return { deliveredAt: nowIso(), providerRef: null, devCode: null };
  }
}
