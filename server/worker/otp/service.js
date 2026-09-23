import {
  ApiError,
  hash,
  verifyHash,
  numericCode,
  formulaCode,
  randomToken,
  nowIso,
  isoIn,
  isPast,
} from '../util.js';
import { getOtpProvider } from './index.js';

function addSeconds(iso, seconds) {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

async function activeChallenge(db, whatsappNumber, purpose) {
  return db
    .prepare(
      `SELECT * FROM otp_challenge
       WHERE whatsapp_number = ? AND purpose = ? AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(whatsappNumber, purpose);
}

/**
 * Create + deliver an OTP for a number/purpose, honouring the resend cooldown and
 * any active lock. Returns metadata the client needs to run the OTP screen.
 */
export async function sendOtp(ctx, { whatsappNumber, purpose }) {
  const { db, config } = ctx;
  const { otp } = config;
  const existing = await activeChallenge(db, whatsappNumber, purpose);

  // Resend cooldown. In manual mode nothing is actually sent by the server — the
  // user just needs to (re-)open WhatsApp — so a repeat click inside the window is
  // treated as idempotent: return the still-valid challenge unchanged rather than
  // erroring or minting a new code. Other modes keep the hard error so the user
  // knows a second message was not sent.
  if (existing && !existing.locked_until) {
    const retryAt = addSeconds(existing.last_sent_at, otp.resendCooldownSeconds);
    if (!isPast(retryAt) && !isPast(existing.expires_at)) {
      if (otp.isManual) {
        return {
          challengeId: existing.id,
          expiresAt: existing.expires_at,
          resendAvailableAt: retryAt,
          maxAttempts: otp.maxAttempts,
          devCode: null,
          reused: true,
        };
      }
      throw new ApiError(429, 'otp_cooldown', 'A code was just sent. Wait before resending.', {
        retryAt,
      });
    }
  }

  // A locked challenge: a resend is the documented way out (still cooldown-gated),
  // retiring the locked challenge and starting a clean one.
  if (existing && existing.locked_until && !isPast(existing.locked_until)) {
    const retryAt = addSeconds(existing.last_sent_at, otp.resendCooldownSeconds);
    if (!isPast(retryAt)) {
      throw new ApiError(429, 'otp_cooldown', 'Wait a moment before requesting a new code.', {
        retryAt,
      });
    }
  }

  // seq bumps on every resend so the code changes; a fresh flow starts at 0.
  const seq = existing ? existing.send_seq + 1 : 0;

  const code =
    otp.strategy === 'phone_formula'
      ? formulaCode(whatsappNumber, otp.formula, otp.length, { purpose, seq })
      : numericCode(otp.length);
  const expiresAt = isoIn(otp.ttlSeconds * 1000);

  // One live challenge per number+purpose: retire the previous one.
  if (existing) {
    await db.prepare(`UPDATE otp_challenge SET consumed_at = ? WHERE id = ?`).run(nowIso(), existing.id);
  }

  // In manual-relay mode the operator needs to read the code, so keep it in plain
  // text; every other mode stores only the hash.
  const operatorCode = otp.isManual ? code : null;

  const info = await db
    .prepare(
      `INSERT INTO otp_challenge
         (whatsapp_number, purpose, code_hash, operator_code, send_seq, expires_at, last_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(whatsappNumber, purpose, hash(code), operatorCode, seq, expiresAt, nowIso());

  let delivery;
  try {
    delivery = await getOtpProvider(config).send(ctx, { whatsappNumber, code, purpose });
  } catch (err) {
    // Delivery failed — drop the challenge so the user isn't stuck behind the
    // resend cooldown for a code that never arrived.
    await db.prepare(`DELETE FROM otp_challenge WHERE id = ?`).run(info.lastInsertRowid);
    throw err;
  }

  return {
    challengeId: info.lastInsertRowid,
    expiresAt,
    resendAvailableAt: addSeconds(nowIso(), otp.resendCooldownSeconds),
    maxAttempts: otp.maxAttempts,
    // Only the mock provider returns devCode.
    devCode: delivery.devCode ?? null,
  };
}

/**
 * Check a submitted code. On success, consume the challenge and mint a short-lived
 * verification token used to finish registration or password reset.
 */
export async function verifyOtp(ctx, { whatsappNumber, code, purpose }) {
  const { db, config } = ctx;
  const { otp } = config;
  const challenge = await activeChallenge(db, whatsappNumber, purpose);

  if (!challenge) {
    throw new ApiError(400, 'otp_not_found', 'Request a new code.');
  }
  if (challenge.locked_until && !isPast(challenge.locked_until)) {
    throw new ApiError(429, 'otp_locked', 'Too many wrong attempts. Try again later.', {
      lockedUntil: challenge.locked_until,
    });
  }
  if (isPast(challenge.expires_at)) {
    throw new ApiError(400, 'otp_expired', 'Code expired.', { canResend: true });
  }

  if (!verifyHash(String(code), challenge.code_hash)) {
    const attempts = challenge.attempts + 1;
    const attemptsLeft = Math.max(0, otp.maxAttempts - attempts);

    if (attempts >= otp.maxAttempts) {
      const lockedUntil = isoIn(otp.lockMinutes * 60 * 1000);
      await db
        .prepare(`UPDATE otp_challenge SET attempts = ?, locked_until = ? WHERE id = ?`)
        .run(attempts, lockedUntil, challenge.id);
      throw new ApiError(429, 'otp_locked', 'Too many wrong attempts.', { lockedUntil });
    }

    await db.prepare(`UPDATE otp_challenge SET attempts = ? WHERE id = ?`).run(attempts, challenge.id);
    throw new ApiError(400, 'otp_wrong', 'Incorrect code.', { attemptsLeft });
  }

  await db
    .prepare(`UPDATE otp_challenge SET consumed_at = ?, verified_at = ? WHERE id = ?`)
    .run(nowIso(), nowIso(), challenge.id);

  const token = randomToken();
  await db
    .prepare(
      `INSERT INTO verification_token (token, whatsapp_number, purpose, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(token, whatsappNumber, purpose, isoIn(config.verificationTokenTtlHours * 3600 * 1000));

  return { verificationToken: token };
}

/** Consume a verification token, asserting number + purpose. */
export async function consumeVerificationToken(ctx, { token, purpose }) {
  const { db } = ctx;
  const row = await db.prepare(`SELECT * FROM verification_token WHERE token = ?`).get(token);
  if (!row || row.purpose !== purpose || row.consumed_at || isPast(row.expires_at)) {
    throw new ApiError(400, 'verification_invalid', 'Verification expired. Start again.');
  }
  await db.prepare(`UPDATE verification_token SET consumed_at = ? WHERE token = ?`).run(nowIso(), token);
  return { whatsappNumber: row.whatsapp_number };
}
