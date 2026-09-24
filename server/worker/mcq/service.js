import { ApiError } from '../util.js';

const MAX_QUIZ_LEN = 150; // defensive cap; real per-section/difficulty counts run far lower

function toOptions(row) {
  const options = { A: row.option_a, B: row.option_b };
  if (row.option_c) options.C = row.option_c;
  if (row.option_d) options.D = row.option_d;
  return options;
}

// "1.1", "1.2", "1.10", "10.5.1" — plain string sort gets "1.10" before "1.2".
// Compare dot-separated numeric parts instead. "" / "0" (chapter intros) sort first.
function naturalCompare(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Subjects available for a grade, with how many questions each has. */
export async function subjectsForGrade(db, grade) {
  return db
    .prepare(
      `SELECT subject, count(*) AS count
       FROM mcq_question
       WHERE grade = ?
       GROUP BY subject
       ORDER BY subject`,
    )
    .all(grade);
}

/**
 * Chapters available for a grade + subject, in syllabus order: numbered
 * chapters first (1, 2, 3…), then non-numeric ones (appendices like "A1").
 * The CSV's own row order doesn't reliably follow chapter order, so this
 * can't just be ORDER BY id.
 */
export async function chaptersFor(db, grade, subject) {
  return db
    .prepare(
      `SELECT chapter_no AS chapterNo, chapter, count(*) AS count
       FROM mcq_question
       WHERE grade = ? AND subject = ?
       GROUP BY chapter_no, chapter
       ORDER BY (chapter_no GLOB '[0-9]*') DESC, CAST(chapter_no AS INTEGER), chapter_no`,
    )
    .all(grade, subject);
}

/**
 * Sections within one specific chapter (chapter_no + chapter title, see
 * buildQuiz). Grouped by section_number alone, not section_number+section —
 * the source data has some rows with a truncated section title under the
 * same number as rows with the full title. The label shown is the longest
 * (most complete) title on record for that number; every row under it is
 * still included when the section is selected — nothing is dropped.
 */
export async function sectionsFor(db, { grade, subject, chapterNo, chapter }) {
  const rows = await db
    .prepare(
      `SELECT section_number AS sectionNumber, section, count(*) AS count
       FROM mcq_question
       WHERE grade = ? AND subject = ? AND chapter_no = ? AND chapter = ?
       GROUP BY section_number, section`,
    )
    .all(grade, subject, chapterNo, chapter);

  const byNumber = new Map();
  for (const r of rows) {
    const key = r.sectionNumber ?? '';
    const existing = byNumber.get(key);
    if (!existing) {
      byNumber.set(key, { sectionNumber: r.sectionNumber, section: r.section, count: r.count });
    } else {
      existing.count += r.count;
      if ((r.section?.length || 0) > (existing.section?.length || 0)) existing.section = r.section;
    }
  }
  return [...byNumber.values()].sort((a, b) => naturalCompare(a.sectionNumber, b.sectionNumber));
}

/** Question count per difficulty level (1–5) for a chapter, optionally narrowed to sections. */
export async function difficultyBreakdown(db, { grade, subject, chapterNo, chapter, sectionNumbers }) {
  const params = [grade, subject, chapterNo, chapter];
  let where = 'grade = ? AND subject = ? AND chapter_no = ? AND chapter = ?';
  if (sectionNumbers?.length) {
    where += ` AND section_number IN (${sectionNumbers.map(() => '?').join(',')})`;
    params.push(...sectionNumbers);
  }
  const rows = await db
    .prepare(`SELECT difficulty AS level, count(*) AS count FROM mcq_question WHERE ${where} GROUP BY difficulty`)
    .all(...params);
  const byLevel = new Map(rows.map((r) => [r.level, r.count]));
  return [1, 2, 3, 4, 5].map((level) => ({ level, count: byLevel.get(level) || 0 }));
}

/**
 * Every question matching a subject + chapter + (optional) sections + one
 * difficulty level, deduped by question text, in random order. chapterNo
 * alone doesn't identify a chapter — the same grade+subject can have more
 * than one chapter numbered e.g. "1" (different books/terms) — so a chapter
 * is always chapterNo + chapter title together.
 */
export async function buildQuiz(db, { grade, subject, chapterNo, chapter, sectionNumbers, difficulty }) {
  if (!grade) throw new ApiError(400, 'bad_grade', 'Choose a grade.');
  if (!subject) throw new ApiError(400, 'bad_subject', 'Choose a subject.');
  if (!chapterNo || !chapter) throw new ApiError(400, 'bad_chapter', 'Choose a chapter.');
  const level = Number(difficulty);
  if (!(level >= 1 && level <= 5)) throw new ApiError(400, 'bad_difficulty', 'Choose a difficulty level.');

  const params = [grade, subject, chapterNo, chapter, level];
  let where = 'grade = ? AND subject = ? AND chapter_no = ? AND chapter = ? AND difficulty = ?';
  if (sectionNumbers?.length) {
    where += ` AND section_number IN (${sectionNumbers.map(() => '?').join(',')})`;
    params.push(...sectionNumbers);
  }

  const rows = await db
    .prepare(
      `SELECT id, chapter, section, question, option_a, option_b, option_c, option_d, difficulty
       FROM mcq_question
       WHERE ${where}
       ORDER BY RANDOM()`,
    )
    .all(...params);

  // Defensive: chapter is fixed here so import-time per-chapter dedup already
  // guarantees unique question text, but a stray repeat should never surface.
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    if (seen.has(r.question)) continue;
    seen.add(r.question);
    deduped.push(r);
    if (deduped.length >= MAX_QUIZ_LEN) break;
  }

  if (deduped.length === 0) {
    throw new ApiError(404, 'no_questions', 'No questions available for this selection.');
  }

  return {
    grade,
    subject,
    chapterNo,
    chapter,
    sectionNumbers: sectionNumbers || [],
    difficulty: level,
    questions: deduped.map((r) => ({
      id: r.id,
      question: r.question,
      chapter: r.chapter,
      section: r.section,
      difficulty: r.difficulty,
      options: toOptions(r),
    })),
  };
}

/**
 * Grade a submitted quiz and record the attempt. `questionIds` is the full
 * set of questions the quiz was built from (including ones left unanswered);
 * `answers` is a sparse {id: letter} map for whichever were answered.
 * Unanswered questions score 0, same as a wrong answer, and are reported with
 * their own 'unanswered' status so the review screen can tell the two apart.
 */
export async function gradeQuiz(
  db,
  { accountId, shareLinkToken = null, takerName = null, grade, subject, chapterNo, questionIds, answers },
) {
  const ids = (questionIds || []).map(Number).filter((n) => Number.isInteger(n));
  if (ids.length === 0) throw new ApiError(400, 'no_questions', 'No questions to grade.');

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT id, question, chapter, option_a, option_b, option_c, option_d, correct_option
       FROM mcq_question WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));

  let score = 0;
  const results = ids
    .map((id) => {
      const row = byId.get(id);
      if (!row) return null;
      const raw = answers ? answers[id] ?? answers[String(id)] : null;
      const selected = raw ? String(raw).toUpperCase() : null;
      const isCorrect = selected != null && selected === row.correct_option;
      if (isCorrect) score += 1;
      return {
        id: row.id,
        question: row.question,
        chapter: row.chapter,
        options: toOptions(row),
        selected,
        correct: row.correct_option,
        status: isCorrect ? 'correct' : selected ? 'incorrect' : 'unanswered',
      };
    })
    .filter(Boolean);

  await db
    .prepare(
      `INSERT INTO mcq_attempt
         (account_id, share_link_token, taker_name, grade, subject, chapter_no, score, total, results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(accountId, shareLinkToken, takerName, grade, subject, chapterNo || null, score, results.length, JSON.stringify(results));

  return { score, total: results.length, results };
}

/** The account's own practice history (self-taken, not via a share link). */
export async function selfAttempts(db, accountId) {
  return db
    .prepare(
      `SELECT id, grade, subject, chapter_no AS chapterNo, score, total, created_at AS createdAt
       FROM mcq_attempt
       WHERE account_id = ? AND share_link_token IS NULL
       ORDER BY id DESC
       LIMIT 20`,
    )
    .all(accountId);
}

/** Results from tests taken through any of the account's shared links. */
export async function shareResultsFor(db, accountId) {
  return db
    .prepare(
      `SELECT id, taker_name AS takerName, grade, subject, chapter_no AS chapterNo, score, total,
              created_at AS createdAt
       FROM mcq_attempt
       WHERE account_id = ? AND share_link_token IS NOT NULL
       ORDER BY id DESC
       LIMIT 100`,
    )
    .all(accountId);
}

/** Full per-question review for one attempt, owned by this account. */
export async function attemptDetail(db, accountId, attemptId) {
  const row = await db
    .prepare(
      `SELECT id, taker_name AS takerName, grade, subject, chapter_no AS chapterNo, score, total,
              results_json AS resultsJson, created_at AS createdAt
       FROM mcq_attempt
       WHERE id = ? AND account_id = ?`,
    )
    .get(attemptId, accountId);
  if (!row) throw new ApiError(404, 'not_found', 'Attempt not found.');
  const { resultsJson, ...rest } = row;
  return { ...rest, results: JSON.parse(resultsJson) };
}
