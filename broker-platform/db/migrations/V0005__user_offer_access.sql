-- A public user view must never rely on a guessable Telegram reference.
-- The opaque token is returned once at application creation; only its hash is retained.
ALTER TABLE applications
  ADD COLUMN applicant_access_token_hash text UNIQUE,
  ADD COLUMN approved_amount_minor bigint CHECK (approved_amount_minor BETWEEN 1000 AND 50000);
