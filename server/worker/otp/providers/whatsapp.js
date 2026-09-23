import { OtpProvider } from './base.js';
import { ApiError, nowIso } from '../../util.js';

const GRAPH = 'https://graph.facebook.com';

/**
 * WhatsApp Business Platform (Cloud API) provider.
 *
 * Delivers the code via a pre-approved AUTHENTICATION-category message template in
 * the client's WhatsApp Business Account. WhatsApp does not allow free-form OTP
 * text, so a template with a COPY_CODE or ONE_TAP button is mandatory — the send
 * payload carries the code twice (body parameter + button parameter).
 */
export class WhatsAppOtpProvider extends OtpProvider {
  get name() {
    return 'whatsapp';
  }

  #endpoint(cfg) {
    return `${GRAPH}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  }

  #payload(cfg, to, code) {
    const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
    if (cfg.includeButton) {
      components.push({
        type: 'button',
        sub_type: cfg.buttonSubType, // 'url' for COPY_CODE / ONE_TAP
        index: '0',
        parameters: [{ type: 'text', text: code }],
      });
    }
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: { name: cfg.templateName, language: { code: cfg.templateLang }, components },
    };
  }

  async send(config, { whatsappNumber, code, purpose }) {
    const cfg = config.whatsapp;
    const missing = ['phoneNumberId', 'token', 'templateName', 'templateLang'].filter((k) => !cfg[k]);
    if (missing.length) {
      throw new Error(
        `OTP_PROVIDER=whatsapp is missing config: ${missing
          .map((k) => `WHATSAPP_${k.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`)
          .join(', ')}`,
      );
    }

    // Graph API wants the number without a leading '+'.
    const to = String(whatsappNumber).replace(/^\+/, '');

    let res;
    try {
      res = await fetch(this.#endpoint(cfg), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.#payload(cfg, to, code)),
      });
    } catch (err) {
      throw new ApiError(502, 'otp_delivery_failed', 'Could not reach WhatsApp. Try again.', {
        cause: err.message,
      });
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const meta = data?.error || {};
      // eslint-disable-next-line no-console
      console.error('[whatsapp-otp] send failed', res.status, JSON.stringify(meta));
      throw new ApiError(502, 'otp_delivery_failed', 'Could not send the WhatsApp code. Try again.', {
        whatsappError: {
          status: res.status,
          code: meta.code,
          subcode: meta.error_subcode,
          message: meta.message,
          fbtrace_id: meta.fbtrace_id,
        },
      });
    }

    const providerRef = data?.messages?.[0]?.id || null;
    // eslint-disable-next-line no-console
    console.log(`[whatsapp-otp] ${purpose} template sent to ${to} (wamid: ${providerRef})`);
    return { deliveredAt: nowIso(), providerRef, devCode: null };
  }
}
