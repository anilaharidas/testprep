import { config } from '../config.js';

const API = 'https://api.telegram.org';

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function callTelegram(method, body) {
  const res = await fetch(`${API}/bot${config.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`telegram ${method}: ${data.description || res.status}`);
  }
  return data.result;
}

/**
 * Push an OTP request to the operator's Telegram. Fire-and-forget — never throws
 * into the request path; a Telegram outage must not break sign-up (the operator
 * panel is still the source of truth).
 */
export function notifyOtpRequest({ number, code, purpose }) {
  if (!config.telegram.enabled) return;

  const digits = String(number).replace(/\D/g, '');
  const replyText = `Your Test Prep verification code is ${code}. It expires in 5 minutes. Do not share it.`;
  const replyUrl = `https://wa.me/${digits}?text=${encodeURIComponent(replyText)}`;
  const panelUrl = `${config.clientOrigin}/panel/${config.admin.panelSlug}`;

  // Telegram inline-button URLs must be real public http(s) URLs — it rejects
  // localhost. In local dev, fall back to putting the panel link in the text.
  const panelButtonOk = /^https:\/\//.test(panelUrl) && !/localhost|127\.0\.0\.1/.test(panelUrl);

  const text =
    `🔐 <b>OTP request</b> · ${escapeHtml(purpose)}\n` +
    `Number: <code>${escapeHtml(number)}</code>\n` +
    `Code: <b>${escapeHtml(code)}</b>` +
    (panelButtonOk ? '' : `\nPanel: ${escapeHtml(panelUrl)}`);

  const inline_keyboard = [[{ text: '💬 Reply on WhatsApp', url: replyUrl }]];
  if (panelButtonOk) inline_keyboard.push([{ text: '📋 Open operator panel', url: panelUrl }]);
  const reply_markup = { inline_keyboard };

  for (const chatId of config.telegram.chatIds) {
    callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[telegram] notify failed for chat ${chatId}:`, err.message);
    });
  }
}

export { callTelegram };
