import { ApiError, randomToken } from '../util.js';

const SHARE_LINK_MAX_ATTEMPTS = 10;

/**
 * Mint a fresh share link for an account, pre-configured to one exact
 * grade/chapter/section/difficulty selection — the taker opens it and starts
 * that test directly, with no selection of their own. Good for
 * `SHARE_LINK_MAX_ATTEMPTS` completed tests.
 */
export async function createShareLink(db, accountId, selection) {
  const token = randomToken();
  const { grade, subject, chapterNo, chapter, sectionNumbers, difficulty } = selection || {};
  await db
    .prepare(
      `INSERT INTO mcq_share_link
         (token, account_id, max_attempts, grade, subject, chapter_no, chapter, section_numbers, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      token,
      accountId,
      SHARE_LINK_MAX_ATTEMPTS,
      grade ?? null,
      subject ?? null,
      chapterNo ?? null,
      chapter ?? null,
      sectionNumbers?.length ? JSON.stringify(sectionNumbers) : null,
      difficulty ?? null,
    );
  return token;
}

/** Resolve a share token to its link row (account_id, max/used attempts). */
export async function resolveShareLink(db, token) {
  const link = await db.prepare(`SELECT * FROM mcq_share_link WHERE token = ?`).get(token);
  if (!link) throw new ApiError(404, 'link_not_found', 'This practice link is no longer valid.');
  return link;
}

/**
 * A link's fixed quiz selection, or null for a legacy link minted before
 * selections were stored (the taker picks their own in that case).
 */
export function fixedSelectionFor(link) {
  if (!link.grade) return null;
  return {
    grade: link.grade,
    subject: link.subject,
    chapterNo: link.chapter_no,
    chapter: link.chapter,
    sectionNumbers: link.section_numbers ? JSON.parse(link.section_numbers) : [],
    difficulty: link.difficulty,
  };
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
