/**
 * Send one real WhatsApp authentication-template message, to prove the Cloud API
 * setup works before flipping the whole app to OTP_PROVIDER=whatsapp.
 *
 * Usage (from server/):
 *   node scripts/wa-test.js +919876543210
 *   node scripts/wa-test.js +919876543210 123456
 *
 * Reads WHATSAPP_* from server/.env. The recipient must have messaged the number
 * in the last 24h OR the number/template must be approved for the recipient's
 * region; a test number can only message pre-registered recipients.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from '../worker/config.js';
import { WhatsAppOtpProvider } from '../worker/otp/providers/whatsapp.js';

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

const to = process.argv[2];
const code = process.argv[3] || String(Math.floor(100000 + Math.random() * 900000));

if (!to) {
  console.error('Usage: node scripts/wa-test.js +<country><number> [code]');
  process.exit(1);
}

console.log('Config:', {
  apiVersion: config.whatsapp.apiVersion,
  phoneNumberId: config.whatsapp.phoneNumberId || '(missing)',
  template: `${config.whatsapp.templateName} / ${config.whatsapp.templateLang}`,
  tokenSet: Boolean(config.whatsapp.token),
});

try {
  const provider = new WhatsAppOtpProvider();
  const res = await provider.send({ config }, { whatsappNumber: to, code, purpose: 'register' });
  console.log(`\n✓ Sent code ${code} to ${to}`);
  console.log(res);
} catch (err) {
  console.error('\n✗ Send failed');
  console.error(err.message, err.extra || '');
  process.exit(1);
}
