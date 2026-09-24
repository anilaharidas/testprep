-- Collapses the role/dependent-profile model entirely: no more Parent/Teacher
-- role, no pre-created child/student profiles. Practicing happens directly under
-- the account; shared-link attempts self-identify by name. This deletes existing
-- dependent profiles and attempt history -- acceptable, the app has only had test
-- data so far.
DROP TABLE IF EXISTS dependent_share_link;
DROP TABLE IF EXISTS mcq_attempt;
DROP TABLE IF EXISTS dependent;
ALTER TABLE account DROP COLUMN role;

CREATE TABLE mcq_share_link (
  token         TEXT PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  max_attempts  INTEGER NOT NULL DEFAULT 4,
  used_attempts INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_share_link_account ON mcq_share_link (account_id, created_at);

-- One row per completed test. share_link_token NULL = self-practice (taken by the
-- logged-in account itself); non-NULL = taken through a shared link, taker_name is
-- whatever the taker typed. results_json holds the full per-question
-- correct/selected detail so a past attempt can be reviewed later, not just right
-- after grading.
CREATE TABLE mcq_attempt (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  share_link_token TEXT REFERENCES mcq_share_link(token) ON DELETE SET NULL,
  taker_name       TEXT,
  grade            TEXT NOT NULL,
  subject          TEXT NOT NULL,
  chapter_no       TEXT,
  score            INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  results_json     TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mcq_attempt_account ON mcq_attempt (account_id, share_link_token, created_at);
