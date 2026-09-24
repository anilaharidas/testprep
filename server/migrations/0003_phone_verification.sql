-- Deferred phone verification: an account can now be created without OTP proof
-- (the "Verify later" path). NULL = unverified; existing accounts all went
-- through the old mandatory-OTP flow, so backfill them as verified.
ALTER TABLE account ADD COLUMN phone_verified_at TEXT;
UPDATE account SET phone_verified_at = created_at WHERE phone_verified_at IS NULL;
