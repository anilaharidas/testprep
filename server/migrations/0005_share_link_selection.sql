-- Share links now carry a fixed quiz selection (grade/chapter/section/difficulty)
-- picked by the account holder before sharing, instead of leaving the taker to
-- pick their own. Nullable, additive columns — existing rows get NULL, which
-- the app treats as "legacy open link, taker picks their own selection" so
-- links minted before this migration keep working unchanged. Also bumps the
-- per-link attempt cap from 4 to 10 (set explicitly per-insert in app code,
-- not via this column default, so it applies only to newly-created links).

ALTER TABLE mcq_share_link ADD COLUMN grade TEXT;
ALTER TABLE mcq_share_link ADD COLUMN subject TEXT;
ALTER TABLE mcq_share_link ADD COLUMN chapter_no TEXT;
ALTER TABLE mcq_share_link ADD COLUMN chapter TEXT;
ALTER TABLE mcq_share_link ADD COLUMN section_numbers TEXT;
ALTER TABLE mcq_share_link ADD COLUMN difficulty INTEGER;
