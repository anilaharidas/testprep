/**
 * Find your Telegram chat id.
 *
 *   1. Create a bot: message @BotFather -> /newbot -> copy the token.
 *   2. Put TELEGRAM_BOT_TOKEN=... in server/.env
 *   3. Open your new bot in Telegram and send it any message (e.g. "hi").
 *   4. Run:  node scripts/tg-chat-id.js
 *
 * Prints every chat that has messaged the bot recently. Put the id you want in
 * TELEGRAM_CHAT_ID (comma-separate for several).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from '../worker/config.js';

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

if (!config.telegram.botToken) {
  console.error('Set TELEGRAM_BOT_TOKEN in server/.env first.');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/getUpdates`);
const data = await res.json();

if (!data.ok) {
  console.error('Telegram error:', data.description);
  process.exit(1);
}

const chats = new Map();
for (const u of data.result) {
  const msg = u.message || u.channel_post || u.my_chat_member;
  const chat = msg?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.log('No messages yet. Send your bot a message in Telegram, then re-run.');
  process.exit(0);
}

console.log('\nChats that have contacted your bot:\n');
for (const chat of chats.values()) {
  const label =
    chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '?';
  console.log(`  ${chat.id}\t(${chat.type}) ${label}`);
}
console.log('\nAdd to server/.env:  TELEGRAM_CHAT_ID=<id>\n');
