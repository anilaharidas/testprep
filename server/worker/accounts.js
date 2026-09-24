import { ApiError, hash, verifyHash, randomToken, nowIso, isoIn, isPast } from './util.js';
import { consumeVerificationToken } from './otp/service.js';

export async function numberIsRegistered(db, whatsappNumber) {
  return !!(await db.prepare(`SELECT id FROM account WHERE whatsapp_number = ?`).get(whatsappNumber));
}

export function roleMeta(config, role) {
  const meta = config.roleCaps[role];
  if (!meta) throw new ApiError(400, 'bad_role', 'Role must be parent or teacher.');
  return meta;
}

async function createSession(db, config, accountId) {
  const token = randomToken();
  await db
    .prepare(`INSERT INTO session (token, account_id, expires_at) VALUES (?, ?, ?)`)
    .run(token, accountId, isoIn(config.sessionTtlDays * 86400 * 1000));
  return token;
}

export async function sessionAccount(db, token) {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT s.expires_at, a.* FROM session s JOIN account a ON a.id = s.account_id WHERE s.token = ?`,
    )
    .get(token);
  if (!row || isPast(row.expires_at)) return null;
  return row;
}

export async function destroySession(db, token) {
  if (token) await db.prepare(`DELETE FROM session WHERE token = ?`).run(token);
}

/** Finish sign-up: needs a register-purpose verification token for the number. */
export async function register(ctx, { verificationToken, role, name, password }) {
  const { db, config } = ctx;
  const meta = roleMeta(config, role);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new ApiError(400, 'bad_name', 'Enter a name.');
  if (String(password || '').length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }

  const { whatsappNumber } = await consumeVerificationToken(ctx, {
    token: verificationToken,
    purpose: 'register',
  });

  if (await numberIsRegistered(db, whatsappNumber)) {
    throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.');
  }

  const info = await db
    .prepare(
      `INSERT INTO account (role, name, whatsapp_number, password_hash, phone_verified_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(role, cleanName, whatsappNumber, hash(password), nowIso());

  const accountId = info.lastInsertRowid;
  return { sessionToken: await createSession(db, config, accountId), accountId };
}

/**
 * "Verify later" path: creates the account directly from a phone number, no
 * verification token required. `phone_verified_at` stays NULL (the column
 * default) until the owner completes verification later via
 * markPhoneVerified — see /api/verify-phone/send + /confirm in app.js.
 */
export async function registerUnverified(ctx, { role, name, password, whatsappNumber }) {
  const { db, config } = ctx;
  const meta = roleMeta(config, role);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new ApiError(400, 'bad_name', 'Enter a name.');
  if (String(password || '').length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }

  if (await numberIsRegistered(db, whatsappNumber)) {
    throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.');
  }

  const info = await db
    .prepare(`INSERT INTO account (role, name, whatsapp_number, password_hash) VALUES (?, ?, ?, ?)`)
    .run(role, cleanName, whatsappNumber, hash(password));

  const accountId = info.lastInsertRowid;
  return { sessionToken: await createSession(db, config, accountId), accountId };
}

/** Mark an account's phone verified (via /api/verify-phone/confirm); returns the fresh row. */
export async function markPhoneVerified(db, accountId) {
  await db.prepare(`UPDATE account SET phone_verified_at = ? WHERE id = ?`).run(nowIso(), accountId);
  return db.prepare(`SELECT * FROM account WHERE id = ?`).get(accountId);
}

export async function login(ctx, { whatsappNumber, password }) {
  const { db, config } = ctx;
  const account = await db.prepare(`SELECT * FROM account WHERE whatsapp_number = ?`).get(whatsappNumber);
  if (!account) {
    throw new ApiError(404, 'no_account', 'No account found for this number.', { register: true });
  }
  if (account.login_locked_until && !isPast(account.login_locked_until)) {
    throw new ApiError(429, 'login_locked', 'Too many attempts. Try again later or reset your password.', {
      lockedUntil: account.login_locked_until,
      forgotPassword: true,
    });
  }

  if (!verifyHash(String(password || ''), account.password_hash)) {
    const attempts = account.login_failed_attempts + 1;
    if (attempts >= config.login.maxAttempts) {
      const lockedUntil = isoIn(config.login.lockMinutes * 60 * 1000);
      await db
        .prepare(`UPDATE account SET login_failed_attempts = ?, login_locked_until = ? WHERE id = ?`)
        .run(attempts, lockedUntil, account.id);
      throw new ApiError(429, 'login_locked', 'Too many attempts. Try again later or reset your password.', {
        lockedUntil,
        forgotPassword: true,
      });
    }
    await db.prepare(`UPDATE account SET login_failed_attempts = ? WHERE id = ?`).run(attempts, account.id);
    throw new ApiError(401, 'bad_password', 'Incorrect password.', {
      attemptsLeft: config.login.maxAttempts - attempts,
      forgotPassword: true,
    });
  }

  await db
    .prepare(`UPDATE account SET login_failed_attempts = 0, login_locked_until = NULL WHERE id = ?`)
    .run(account.id);

  return { sessionToken: await createSession(db, config, account.id), accountId: account.id };
}

export async function resetPassword(ctx, { verificationToken, password }) {
  const { db } = ctx;
  if (String(password || '').length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }
  const { whatsappNumber } = await consumeVerificationToken(ctx, {
    token: verificationToken,
    purpose: 'reset',
  });
  const account = await db.prepare(`SELECT * FROM account WHERE whatsapp_number = ?`).get(whatsappNumber);
  if (!account) throw new ApiError(404, 'no_account', 'No account found for this number.');

  await db
    .prepare(`UPDATE account SET password_hash = ?, login_failed_attempts = 0, login_locked_until = NULL WHERE id = ?`)
    .run(hash(password), account.id);

  // Log out other sessions after a password change.
  await db.prepare(`DELETE FROM session WHERE account_id = ?`).run(account.id);
}

// ---- dependents -----------------------------------------------------------

export async function dependentsFor(db, accountId) {
  return db
    .prepare(`SELECT id, name, grade, created_at FROM dependent WHERE account_id = ? ORDER BY id`)
    .all(accountId);
}

export async function accountView(ctx, account) {
  const { db, config } = ctx;
  const meta = roleMeta(config, account.role);
  const dependents = await dependentsFor(db, account.id);
  return {
    id: account.id,
    role: account.role,
    name: account.name,
    whatsappNumber: account.whatsapp_number,
    createdAt: account.created_at,
    phoneVerified: Boolean(account.phone_verified_at),
    dependentLabel: meta.dependentLabel,
    dependentLabelPlural: meta.dependentLabelPlural,
    cap: meta.cap,
    dependents,
    canAddDependent: dependents.length < meta.cap,
  };
}

export async function addDependent(ctx, account, { name, grade }) {
  const { db, config } = ctx;
  const meta = roleMeta(config, account.role);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 1) throw new ApiError(400, 'bad_name', 'Enter a name.');
  if (!config.grades.includes(String(grade))) {
    throw new ApiError(400, 'bad_grade', 'Choose a grade.');
  }
  const existing = await dependentsFor(db, account.id);
  if (existing.length >= meta.cap) {
    throw new ApiError(409, 'cap_reached', `Free plan supports up to ${meta.cap} ${meta.dependentLabelPlural}.`, {
      cap: meta.cap,
    });
  }
  await db
    .prepare(`INSERT INTO dependent (account_id, name, grade) VALUES (?, ?, ?)`)
    .run(account.id, cleanName, String(grade));
  const fresh = await db.prepare(`SELECT * FROM account WHERE id = ?`).get(account.id);
  return accountView(ctx, fresh);
}

export async function removeDependent(ctx, account, dependentId) {
  const { db } = ctx;
  const dep = await getOwnedDependent(db, account, dependentId);
  await db.prepare(`DELETE FROM dependent WHERE id = ?`).run(dep.id);
  const fresh = await db.prepare(`SELECT * FROM account WHERE id = ?`).get(account.id);
  return accountView(ctx, fresh);
}

/** A dependent row, asserting it belongs to this account. */
export async function getOwnedDependent(db, account, dependentId) {
  const dep = await db
    .prepare(`SELECT * FROM dependent WHERE id = ? AND account_id = ?`)
    .get(dependentId, account.id);
  if (!dep) throw new ApiError(404, 'not_found', 'Dependent not found.');
  return dep;
}
