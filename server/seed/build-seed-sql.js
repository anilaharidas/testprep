// Offline one-time seed builder: reads server/seed/cbse-mcq.csv, applies the exact
// same transforms the old Express server did at boot (server/src/mcq/seed.js) —
// subject alias normalization, [Source ...] stripping, chapter-title
// canonicalization, within-chapter dedup — and writes chunked INSERT statements to
// server/seed/sql/*.sql instead of running a better-sqlite3 transaction.
//
// D1 has no bulk "seed at boot" mechanism and no fs access from the Worker, so this
// runs locally (`node server/seed/build-seed-sql.js`) and the output is applied once
// with `wrangler d1 execute`, not on every deploy.
//
// Usage:
//   node server/seed/build-seed-sql.js
//   for f in server/seed/sql/*.sql; do
//     npx wrangler d1 execute testprep-db --local --file="$f"
//   done
//   # then again with --remote for production, after the D1 database is created

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, 'cbse-mcq.csv');
const OUT_DIR = path.join(__dirname, 'sql');
const ROWS_PER_FILE = 500; // keeps each `wrangler d1 execute` call small and fast
const ROWS_PER_INSERT = 20; // rows per INSERT statement — D1 rejects much larger single statements

const SUBJECT_ALIASES = { Maths: 'Mathematics' };

const clean = (s) => String(s ?? '').trim();
const orNull = (s) => (clean(s) ? clean(s) : null);

// ~12% of questions carry a trailing generator artifact like
// "[Source gegp203.pdf, case 13362]" — not meant for students. Strip it; the
// question/options/answer/difficulty are otherwise imported unchanged.
const stripSourceTag = (s) => clean(s).replace(/\s*\[Source[^\]]*\]\s*$/i, '');

// For matching only (never stored/shown): fold curly quotes to straight ones,
// collapse whitespace, lowercase.
const normalizeForMatch = (s) =>
  clean(s)
    .normalize('NFKC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase();

function loadRows() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlNumber(value) {
  return value === null || value === undefined ? 'NULL' : String(value);
}

const COLUMNS = [
  'source_no',
  'grade',
  'subject',
  'chapter_no',
  'chapter',
  'section_number',
  'section',
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_option',
  'difficulty',
];

function rowToTuple(r) {
  const vals = [
    sqlNumber(r.source_no),
    sqlString(r.grade),
    sqlString(r.subject),
    sqlString(r.chapter_no),
    sqlString(r.chapter),
    sqlString(r.section_number),
    sqlString(r.section),
    sqlString(r.question),
    sqlString(r.option_a),
    sqlString(r.option_b),
    sqlString(r.option_c),
    sqlString(r.option_d),
    sqlString(r.correct_option),
    sqlNumber(r.difficulty),
  ];
  return `(${vals.join(', ')})`;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Seed CSV not found at ${CSV_PATH}`);
  }
  const rows = loadRows();

  const allRecords = rows.map((row) => {
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

  // Canonicalize chapter-title spelling variants under the same (grade, subject, chapter_no).
  const canonicalChapter = new Map();
  for (const r of allRecords) {
    const key = [r.grade, r.subject, r.chapter_no, normalizeForMatch(r.chapter)].join('|');
    const existing = canonicalChapter.get(key);
    if (!existing || r.chapter.length > existing.length) canonicalChapter.set(key, r.chapter);
  }
  for (const r of allRecords) {
    r.chapter = canonicalChapter.get(
      [r.grade, r.subject, r.chapter_no, normalizeForMatch(r.chapter)].join('|'),
    );
  }

  // Collapse within-chapter repeats of the same question + answer set.
  const seen = new Set();
  const records = [];
  let dupes = 0;
  for (const r of allRecords) {
    const optionSet = [r.option_a, r.option_b, r.option_c, r.option_d]
      .filter(Boolean)
      .slice()
      .sort()
      .join('|');
    const key = [r.grade, r.subject, r.chapter_no, r.chapter, r.question, optionSet].join('|');
    if (seen.has(key)) {
      dupes += 1;
      continue;
    }
    seen.add(key);
    records.push(r);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let fileIndex = 0;
  for (let start = 0; start < records.length; start += ROWS_PER_FILE) {
    fileIndex += 1;
    const fileRecords = records.slice(start, start + ROWS_PER_FILE);
    const statements = [];
    for (let i = 0; i < fileRecords.length; i += ROWS_PER_INSERT) {
      const chunk = fileRecords.slice(i, i + ROWS_PER_INSERT);
      const values = chunk.map(rowToTuple).join(',\n');
      statements.push(`INSERT INTO mcq_question (${COLUMNS.join(', ')}) VALUES\n${values};`);
    }
    const fileName = `${String(fileIndex).padStart(4, '0')}.sql`;
    const body = start === 0
      ? `DELETE FROM mcq_question;\n\n${statements.join('\n\n')}\n`
      : `${statements.join('\n\n')}\n`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), body);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${records.length} rows (skipped ${dupes} duplicates) across ${fileIndex} file(s) in ${OUT_DIR}`,
  );
}

main();
