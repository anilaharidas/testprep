import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS account (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    role           TEXT    NOT NULL CHECK (role IN ('parent', 'teacher')),
    name           TEXT    NOT NULL,
    whatsapp_number TEXT   NOT NULL UNIQUE,
    password_hash  TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    login_failed_attempts INTEGER NOT NULL DEFAULT 0,
    login_locked_until    TEXT
  );

  CREATE TABLE IF NOT EXISTS dependent (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    grade      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otp_challenge (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_number TEXT NOT NULL,
    purpose      TEXT NOT NULL CHECK (purpose IN ('register', 'reset')),
    code_hash    TEXT NOT NULL,
    operator_code TEXT,             -- plaintext, only in manual-relay mode
    send_seq     INTEGER NOT NULL DEFAULT 0,  -- 0 fresh, +1 per resend
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TEXT NOT NULL,
    locked_until TEXT,
    consumed_at  TEXT,
    verified_at  TEXT,
    last_sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_otp_number_purpose ON otp_challenge (whatsapp_number, purpose);

  CREATE TABLE IF NOT EXISTS admin_session (
    token      TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Short-lived proof that a number passed OTP, used to finish sign-up or reset.
  CREATE TABLE IF NOT EXISTS verification_token (
    token        TEXT PRIMARY KEY,
    whatsapp_number TEXT NOT NULL,
    purpose      TEXT NOT NULL CHECK (purpose IN ('register', 'reset')),
    expires_at   TEXT NOT NULL,
    consumed_at  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session (
    token      TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Question bank, seeded from server/seed/cbse-mcq.csv (see src/mcq/seed.js).
  CREATE TABLE IF NOT EXISTS mcq_question (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    source_no      INTEGER,               -- original "Sl." from the CSV
    grade          TEXT    NOT NULL,
    subject        TEXT    NOT NULL,
    chapter_no     TEXT,
    chapter        TEXT    NOT NULL,
    section_number TEXT,
    section        TEXT,
    question       TEXT    NOT NULL,
    option_a       TEXT    NOT NULL,
    option_b       TEXT    NOT NULL,
    option_c       TEXT,
    option_d       TEXT,
    correct_option TEXT    NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    difficulty     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mcq_grade_subject ON mcq_question (grade, subject);
  CREATE INDEX IF NOT EXISTS idx_mcq_chapter ON mcq_question (grade, subject, chapter_no);

  -- One row per submitted practice quiz.
  CREATE TABLE IF NOT EXISTS mcq_attempt (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    dependent_id INTEGER NOT NULL REFERENCES dependent(id) ON DELETE CASCADE,
    grade        TEXT    NOT NULL,
    subject      TEXT    NOT NULL,
    chapter_no   TEXT,
    score        INTEGER NOT NULL,
    total        INTEGER NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mcq_attempt_dependent ON mcq_attempt (dependent_id, created_at);
`);

// Lightweight migrations for databases created before a column existed.
const otpCols = new Set(db.prepare(`PRAGMA table_info(otp_challenge)`).all().map((c) => c.name));
if (!otpCols.has('operator_code')) db.exec(`ALTER TABLE otp_challenge ADD COLUMN operator_code TEXT`);
if (!otpCols.has('verified_at')) db.exec(`ALTER TABLE otp_challenge ADD COLUMN verified_at TEXT`);
if (!otpCols.has('send_seq')) {
  db.exec(`ALTER TABLE otp_challenge ADD COLUMN send_seq INTEGER NOT NULL DEFAULT 0`);
}
