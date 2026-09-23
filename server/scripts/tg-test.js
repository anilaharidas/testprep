/**
 * Send a test OTP notification to the configured Telegram chat(s).
 *   node scripts/tg-test.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from '../worker/config.js';
import { notifyOtpRequest } from '../worker/notify/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    /* ignore malformed .env */
  }
}

const config = buildConfig(process.env);

if (!config.telegram.enabled) {
  console.error(
    'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in server/.env.',
  );
  process.exit(1);
}

console.log(`Sending test notification to ${config.telegram.chatIds.length} chat(s)…`);
await notifyOtpRequest(config, { number: '+919000000000', code: '1234', purpose: 'register' });
console.log('Done — check Telegram (errors, if any, are logged above).');
