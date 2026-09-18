import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, '..', '..', 'seed', 'cbse-mcq.csv');

// The source CSV labels grade-10 maths "Maths" and every other grade
// "Mathematics" — same subject, inconsistent spelling. Normalize on import so
// subject filters behave the same across grades.
const SUBJECT_ALIASES = { Maths: 'Mathematics' };

const clean = (s) => String(s ?? '').trim();
const orNull = (s) => (clean(s) ? clean(s) : null);

// ~12% of questions carry a trailing generator artifact like
// "[Source gegp203.pdf, case 13362]" — not meant for students. Strip it; the
// question/options/answer/difficulty are otherwise imported unchanged.
const stripSourceTag = (s) => clean(s).replace(/\s*\[Source[^\]]*\]\s*$/i, '');

function loadRows() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

const insertStmt = db.prepare(`
  INSERT INTO mcq_question
    (source_no, grade, subject, chapter_no, chapter, section_number, section,
     question, option_a, option_b, option_c, option_d, correct_option, difficulty)
  VALUES (@source_no, @grade, @subject, @chapter_no, @chapter, @section_number, @section,
          @question, @option_a, @option_b, @option_c, @option_d, @correct_option, @difficulty)
`);

/** Seed the question bank from server/seed/cbse-mcq.csv if the table is empty. */
export function seedMcqIfEmpty() {
  const { count } = db.prepare(`SELECT count(*) count FROM mcq_question`).get();
  if (count > 0) return { seeded: false, count };

  if (!fs.existsSync(CSV_PATH)) {
    // eslint-disable-next-line no-console
    console.warn(`[mcq] seed file not found at ${CSV_PATH} — question bank stays empty.`);
    return { seeded: false, count: 0 };
  }

  const rows = loadRows();
  const insertAll = db.transaction((records) => {
    for (const r of records) insertStmt.run(r);
  });

  const records = rows.map((row) => {
    const subject = SUBJECT_ALIASES[clean(row.Subject)] || clean(row.Subject);
    return {
      source_no: Number(row['Sl.']) || null,
      grade: clean(row.Grade),
      subject,
      chapter_no: orNull(row['Chapter No.']),
      chapter: clean(row.Chapter),
      section_number: orNull(row['Section Number']),
      section: orNull(row.Section),
      question: stripSourceTag(row.Question),
      option_a: clean(row['Option A']),
      option_b: clean(row['Option B']),
      option_c: orNull(row['Option C']),
      option_d: orNull(row['Option D']),
      correct_option: clean(row['Correct Option']).toUpperCase(),
      difficulty: Number(row.Difficulty) || 1,
    };
  });

  insertAll(records);
  // eslint-disable-next-line no-console
  console.log(`[mcq] seeded ${records.length} questions from ${path.basename(CSV_PATH)}`);
  return { seeded: true, count: records.length };
}
