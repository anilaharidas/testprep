-- One standing, reusable link per dependent, letting a student open a public
-- practice-quiz screen directly without logging in as the parent/teacher.
-- "Regenerate" rotates the token (invalidates the old link) via an upsert on
-- dependent_id, kept to one row per dependent.
CREATE TABLE IF NOT EXISTS dependent_share_link (
  token        TEXT PRIMARY KEY,
  dependent_id INTEGER NOT NULL UNIQUE REFERENCES dependent(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
