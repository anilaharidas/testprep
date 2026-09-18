import { db } from '../db.js';
import { ApiError } from '../util.js';
import { getOwnedDependent } from '../accounts.js';

const MIN_COUNT = 1;
const MAX_COUNT = 30;
const DEFAULT_COUNT = 10;

function toOptions(row) {
  const options = { A: row.option_a, B: row.option_b };
  if (row.option_c) options.C = row.option_c;
  if (row.option_d) options.D = row.option_d;
  return options;
}

/** Subjects available for a grade, with how many questions each has. */
export function subjectsForGrade(grade) {
  return db
    .prepare(`
      SELECT subject, count(*) AS count
      FROM mcq_question
      WHERE grade = ?
      GROUP BY subject
      ORDER BY subject
    `)
    .all(grade);
}

/**
 * Chapters available for a grade + subject, in syllabus order: numbered
 * chapters first (1, 2, 3…), then non-numeric ones (appendices like "A1").
 * The CSV's own row order doesn't reliably follow chapter order, so this
 * can't just be ORDER BY id.
 */
export function chaptersFor(grade, subject) {
  return db
    .prepare(`
      SELECT chapter_no AS chapterNo, chapter, count(*) AS count
      FROM mcq_question
      WHERE grade = ? AND subject = ?
      GROUP BY chapter_no, chapter
      ORDER BY (chapter_no GLOB '[0-9]*') DESC, CAST(chapter_no AS INTEGER), chapter_no
    `)
    .all(grade, subject);
}

/**
 * Pick a random set of questions for a dependent's grade, without answers.
 * chapterNo alone doesn't identify a chapter — the same grade+subject can have
 * more than one chapter numbered e.g. "1" (different books/terms), so a
 * chapter-scoped quiz must also match the chapter title.
 */
export function buildQuiz({ account, dependentId, subject, chapterNo, chapter, count }) {
  const dependent = getOwnedDependent(account, dependentId);
  if (!subject) throw new ApiError(400, 'bad_subject', 'Choose a subject.');

  const n = Math.min(Math.max(Number(count) || DEFAULT_COUNT, MIN_COUNT), MAX_COUNT);
  const params = [dependent.grade, subject];
  let where = 'grade = ? AND subject = ?';
  if (chapterNo && chapter) {
    where += ' AND chapter_no = ? AND chapter = ?';
    params.push(chapterNo, chapter);
  } else if (chapterNo) {
    where += ' AND chapter_no = ?';
    params.push(chapterNo);
  }

  // Import-time dedup collapses repeats within a chapter, but the same question
  // can (rarely) live in two different chapters — invisible to that dedup, and
  // "All chapters" quizzes can draw both. Over-fetch and drop duplicate question
  // text here so no quiz ever shows the same question twice, however it arises.
  const candidates = db
    .prepare(`
      SELECT id, chapter, section, question, option_a, option_b, option_c, option_d, difficulty
      FROM mcq_question
      WHERE ${where}
      ORDER BY RANDOM()
      LIMIT ?
    `)
    .all(...params, n * 3);

  const seenQuestions = new Set();
  const rows = [];
  for (const r of candidates) {
    if (rows.length >= n) break;
    if (seenQuestions.has(r.question)) continue;
    seenQuestions.add(r.question);
    rows.push(r);
  }

  if (rows.length === 0) {
    throw new ApiError(404, 'no_questions', 'No questions available for this selection.');
  }

  return {
    dependentId: dependent.id,
    dependentName: dependent.name,
    grade: dependent.grade,
    subject,
    chapterNo: chapterNo || null,
    chapter: chapter || null,
    questions: rows.map((r) => ({
      id: r.id,
      question: r.question,
      chapter: r.chapter,
      section: r.section,
      difficulty: r.difficulty,
      options: toOptions(r),
    })),
  };
}

/** Grade a submitted quiz, record the attempt, and return per-question results. */
export function gradeQuiz({ account, dependentId, subject, chapterNo, answers }) {
  const dependent = getOwnedDependent(account, dependentId);
  const entries = Object.entries(answers || {}).filter(([id]) => Number.isInteger(Number(id)));
  if (entries.length === 0) throw new ApiError(400, 'no_answers', 'No answers submitted.');

  const ids = entries.map(([id]) => Number(id));
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT id, question, chapter, option_a, option_b, option_c, option_d, correct_option
      FROM mcq_question WHERE id IN (${placeholders})
    `)
    .all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));

  let score = 0;
  const results = entries
    .map(([idStr, rawSelected]) => {
      const row = byId.get(Number(idStr));
      if (!row) return null;
      const selected = String(rawSelected || '').toUpperCase() || null;
      const isCorrect = selected === row.correct_option;
      if (isCorrect) score += 1;
      return {
        id: row.id,
        question: row.question,
        chapter: row.chapter,
        options: toOptions(row),
        selected,
        correct: row.correct_option,
        isCorrect,
      };
    })
    .filter(Boolean);

  db.prepare(`
    INSERT INTO mcq_attempt (account_id, dependent_id, grade, subject, chapter_no, score, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(account.id, dependent.id, dependent.grade, subject, chapterNo || null, score, results.length);

  return { score, total: results.length, results };
}

/** Recent practice history for a dependent. */
export function attemptsFor(account, dependentId) {
  const dependent = getOwnedDependent(account, dependentId);
  return db
    .prepare(`
      SELECT id, subject, chapter_no AS chapterNo, score, total, created_at AS createdAt
      FROM mcq_attempt
      WHERE dependent_id = ?
      ORDER BY id DESC
      LIMIT 20
    `)
    .all(dependent.id);
}
