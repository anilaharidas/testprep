import { db } from './db.js';

/**
 * Spec §06: "Registration and OTP state should not persist indefinitely — expire an
 * incomplete sign-up after a short window (e.g. 24h) so half-created accounts don't
 * block the number."
 *
 * An account only exists once registration fully completes, so an abandoned sign-up
 * never actually reserves a number. What we prune here is the transient state left
 * behind: spent/expired OTP challenges, used/expired verification tokens, and dead
 * sessions.
 */
const stmts = {
  otp: db.prepare(`
    DELETE FROM otp_challenge
    WHERE (consumed_at IS NOT NULL AND consumed_at < datetime('now', '-1 day'))
       OR (expires_at < datetime('now', '-1 day')
           AND (locked_until IS NULL OR locked_until < datetime('now')))
  `),
  tokens: db.prepare(`
    DELETE FROM verification_token
    WHERE consumed_at IS NOT NULL OR expires_at < datetime('now')
  `),
  sessions: db.prepare(`DELETE FROM session WHERE expires_at < datetime('now')`),
  adminSessions: db.prepare(`DELETE FROM admin_session WHERE expires_at < datetime('now')`),
};

export function sweep() {
  const removed = {
    otp: stmts.otp.run().changes,
    tokens: stmts.tokens.run().changes,
    sessions: stmts.sessions.run().changes,
    adminSessions: stmts.adminSessions.run().changes,
  };
  return removed;
}

export function startMaintenance(intervalMs = 60 * 60 * 1000) {
  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  return timer;
}
