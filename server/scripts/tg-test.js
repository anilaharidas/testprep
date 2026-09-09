/**
 * Send a test OTP notification to the configured Telegram chat(s).
 *   node scripts/tg-test.js
 */
import '../src/config.js';
import { config } from '../src/config.js';
import { notifyOtpRequest } from '../src/notify/telegram.js';

if (!config.telegram.enabled) {
  console.error(
    'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in server/.env.',
  );
  process.exit(1);
}

console.log(`Sending test notification to ${config.telegram.chatIds.length} chat(s)…`);
notifyOtpRequest({ number: '+919000000000', code: '1234', purpose: 'register' });

// notifyOtpRequest is fire-and-forget; give the requests a moment to complete.
await new Promise((r) => setTimeout(r, 2500));
console.log('Done — check Telegram (errors, if any, are logged above).');
