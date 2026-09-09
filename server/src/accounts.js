import { db } from './db.js';
import { config } from './config.js';
import {
  ApiError,
  hash,
  verifyHash,
  randomToken,
  nowIso,
  isoIn,
  isPast,
} from './util.js';
import { consumeVerificationToken } from './otp/service.js';

const findByNumber = db.prepare(`SELECT * FROM account WHERE whatsapp_number = ?`);
const findById = db.prepare(`SELECT * FROM account WHERE id = ?`);

export const numberIsRegistered = (whatsappNumber) => !!findByNumber.get(whatsappNumber);

export function roleMeta(role) {
  const meta = config.roleCaps[role];
  if (!meta) throw new ApiError(400, 'bad_role', 'Role must be parent or teacher.');
  return meta;
}

function createSession(accountId) {
  const token = randomToken();
  db.prepare(`INSERT INTO session (token, account_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    accountId,
    isoIn(config.sessionTtlDays * 86400 * 1000),
  );
  return token;
}

export function sessionAccount(token) {
  if (!token) return null;
  const row = db
    .prepare(`SELECT s.expires_at, a.* FROM session s JOIN account a ON a.id = s.account_id WHERE s.token = ?`)
    .get(token);
  if (!row || isPast(row.expires_at)) return null;
  return row;
}

export function destroySession(token) {
  if (token) db.prepare(`DELETE FROM session WHERE token = ?`).run(token);
}

/** Finish sign-up: needs a register-purpose verification token for the number. */
export function register({ verificationToken, role, name, password }) {
  const meta = roleMeta(role);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) throw new ApiError(400, 'bad_name', 'Enter a name.');
  if (String(password || '').length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }

  const { whatsappNumber } = consumeVerificationToken({
    token: verificationToken,
    purpose: 'register',
  });

  if (numberIsRegistered(whatsappNumber)) {
    throw new ApiError(409, 'number_taken', 'This number already has an account. Please log in.');
  }

  const info = db
    .prepare(`INSERT INTO account (role, name, whatsapp_number, password_hash) VALUES (?, ?, ?, ?)`)
    .run(role, cleanName, whatsappNumber, hash(password));

  return { sessionToken: createSession(info.lastInsertRowid), accountId: info.lastInsertRowid };
}

export function login({ whatsappNumber, password }) {
  const account = findByNumber.get(whatsappNumber);
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
      db.prepare(
        `UPDATE account SET login_failed_attempts = ?, login_locked_until = ? WHERE id = ?`,
      ).run(attempts, lockedUntil, account.id);
      throw new ApiError(429, 'login_locked', 'Too many attempts. Try again later or reset your password.', {
        lockedUntil,
        forgotPassword: true,
      });
    }
    db.prepare(`UPDATE account SET login_failed_attempts = ? WHERE id = ?`).run(attempts, account.id);
    throw new ApiError(401, 'bad_password', 'Incorrect password.', {
      attemptsLeft: config.login.maxAttempts - attempts,
      forgotPassword: true,
    });
  }

  db.prepare(
    `UPDATE account SET login_failed_attempts = 0, login_locked_until = NULL WHERE id = ?`,
  ).run(account.id);

  return { sessionToken: createSession(account.id), accountId: account.id };
}

export function resetPassword({ verificationToken, password }) {
  if (String(password || '').length < 8) {
    throw new ApiError(400, 'weak_password', 'Password must be at least 8 characters.');
  }
  const { whatsappNumber } = consumeVerificationToken({
    token: verificationToken,
    purpose: 'reset',
  });
  const account = findByNumber.get(whatsappNumber);
  if (!account) throw new ApiError(404, 'no_account', 'No account found for this number.');

  db.prepare(
    `UPDATE account SET password_hash = ?, login_failed_attempts = 0, login_locked_until = NULL WHERE id = ?`,
  ).run(hash(password), account.id);

  // Log out other sessions after a password change.
  db.prepare(`DELETE FROM session WHERE account_id = ?`).run(account.id);
}

// ---- dependents -----------------------------------------------------------

const listDeps = db.prepare(`SELECT id, name, grade, created_at FROM dependent WHERE account_id = ? ORDER BY id`);

export function dependentsFor(accountId) {
  return listDeps.all(accountId);
}

export function accountView(account) {
  const meta = roleMeta(account.role);
  const dependents = dependentsFor(account.id);
  return {
    id: account.id,
    role: account.role,
    name: account.name,
    whatsappNumber: account.whatsapp_number,
    createdAt: account.created_at,
    dependentLabel: meta.dependentLabel,
    dependentLabelPlural: meta.dependentLabelPlural,
    cap: meta.cap,
    dependents,
    canAddDependent: dependents.length < meta.cap,
  };
}

export function addDependent(account, { name, grade }) {
  const meta = roleMeta(account.role);
  const cleanName = String(name || '').trim();
  if (cleanName.length < 1) throw new ApiError(400, 'bad_name', 'Enter a name.');
  if (!config.grades.includes(String(grade))) {
    throw new ApiError(400, 'bad_grade', 'Choose a grade.');
  }
  const count = listDeps.all(account.id).length;
  if (count >= meta.cap) {
    throw new ApiError(409, 'cap_reached', `Free plan supports up to ${meta.cap} ${meta.dependentLabelPlural}.`, {
      cap: meta.cap,
    });
  }
  db.prepare(`INSERT INTO dependent (account_id, name, grade) VALUES (?, ?, ?)`).run(
    account.id,
    cleanName,
    String(grade),
  );
  return accountView(findById.get(account.id));
}

export function removeDependent(account, dependentId) {
  const dep = db.prepare(`SELECT * FROM dependent WHERE id = ? AND account_id = ?`).get(dependentId, account.id);
  if (!dep) throw new ApiError(404, 'not_found', 'Not found.');
  db.prepare(`DELETE FROM dependent WHERE id = ?`).run(dependentId);
  return accountView(findById.get(account.id));
}
