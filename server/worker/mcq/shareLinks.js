import { ApiError, randomToken } from '../util.js';

/** Mint a fresh share link for an account — good for `max_attempts` completed tests. */
export async function createShareLink(db, accountId) {
  const token = randomToken();
  await db.prepare(`INSERT INTO mcq_share_link (token, account_id) VALUES (?, ?)`).run(token, accountId);
  return token;
}

/** Resolve a share token to its link row (account_id, max/used attempts). */
export async function resolveShareLink(db, token) {
  const link = await db.prepare(`SELECT * FROM mcq_share_link WHERE token = ?`).get(token);
  if (!link) throw new ApiError(404, 'link_not_found', 'This practice link is no longer valid.');
  return link;
}

/**
 * Atomically claim one attempt slot — only succeeds while under the cap, so
 * concurrent submissions near the limit can't overshoot it. Returns false
 * (no rows changed) if the link is already exhausted.
 */
export async function consumeShareLinkAttempt(db, token) {
  const res = await db
    .prepare(`UPDATE mcq_share_link SET used_attempts = used_attempts + 1 WHERE token = ? AND used_attempts < max_attempts`)
    .run(token);
  return res.changes > 0;
}
