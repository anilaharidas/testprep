import { ApiError, randomToken } from '../util.js';

/** Existing standing link for a dependent, or create one if none exists yet. */
export async function getOrCreateShareToken(db, dependentId) {
  const existing = await db
    .prepare(`SELECT token FROM dependent_share_link WHERE dependent_id = ?`)
    .get(dependentId);
  if (existing) return existing.token;

  const token = randomToken();
  await db
    .prepare(`INSERT INTO dependent_share_link (token, dependent_id) VALUES (?, ?)`)
    .run(token, dependentId);
  return token;
}

/** Rotate a dependent's link — invalidates the old one, mints a new token. */
export async function regenerateShareToken(db, dependentId) {
  const token = randomToken();
  const updated = await db
    .prepare(`UPDATE dependent_share_link SET token = ? WHERE dependent_id = ?`)
    .run(token, dependentId);
  if (updated.changes === 0) {
    await db
      .prepare(`INSERT INTO dependent_share_link (token, dependent_id) VALUES (?, ?)`)
      .run(token, dependentId);
  }
  return token;
}

/** Resolve a share token to its dependent + the owning account's id. */
export async function resolveShareToken(db, token) {
  const row = await db
    .prepare(
      `SELECT d.*
       FROM dependent_share_link l
       JOIN dependent d ON d.id = l.dependent_id
       WHERE l.token = ?`,
    )
    .get(token);
  if (!row) throw new ApiError(404, 'link_not_found', 'This practice link is no longer valid.');
  const { account_id: accountId, ...dependent } = row;
  return { dependent, accountId };
}
