/**
 * Spec §06: "Registration and OTP state should not persist indefinitely — expire an
 * incomplete sign-up after a short window (e.g. 24h) so half-created accounts don't
 * block the number."
 *
 * An account only exists once registration fully completes, so an abandoned sign-up
 * never actually reserves a number. What we prune here is the transient state left
 * behind: spent/expired OTP challenges, used/expired verification tokens, and dead
 * sessions.
 *
 * Pages Functions have no Cron Trigger, so this runs opportunistically — called with
 * low probability on incoming requests (see worker/app.js) instead of on a timer.
 */
export async function sweep(db) {
  const otp = await db
    .prepare(
      `DELETE FROM otp_challenge
       WHERE (consumed_at IS NOT NULL AND consumed_at < datetime('now', '-1 day'))
          OR (expires_at < datetime('now', '-1 day')
              AND (locked_until IS NULL OR locked_until < datetime('now')))`,
    )
    .run();
  const tokens = await db
    .prepare(
      `DELETE FROM verification_token
       WHERE consumed_at IS NOT NULL OR expires_at < datetime('now')`,
    )
    .run();
  const sessions = await db.prepare(`DELETE FROM session WHERE expires_at < datetime('now')`).run();
  const adminSessions = await db
    .prepare(`DELETE FROM admin_session WHERE expires_at < datetime('now')`)
    .run();
  // "Verify later" accounts that never completed verification — same
  // don't-let-incomplete-state-linger principle as the rows above, and it's
  // what frees a squatted number back up for its real owner. ON DELETE CASCADE
  // on session/mcq_attempt/mcq_share_link cleans up the rest.
  const unverifiedAccounts = await db
    .prepare(
      `DELETE FROM account
       WHERE phone_verified_at IS NULL AND created_at < datetime('now', '-7 days')`,
    )
    .run();

  return {
    otp: otp.changes,
    tokens: tokens.changes,
    sessions: sessions.changes,
    adminSessions: adminSessions.changes,
    unverifiedAccounts: unverifiedAccounts.changes,
  };
}
