-- A Telegram contact is separate from the applicant-entered profile phone.
-- It is populated only by an authenticated Bot webhook after Telegram confirms
-- that the shared contact belongs to the sender of a private-chat update.
ALTER TABLE users
  ADD COLUMN telegram_phone_encrypted bytea,
  ADD COLUMN telegram_phone_verified_at timestamptz,
  ADD COLUMN telegram_phone_verified_bot_id text;

ALTER TABLE users
  ADD CONSTRAINT users_telegram_phone_verification_complete CHECK (
    (telegram_phone_encrypted IS NULL
      AND telegram_phone_verified_at IS NULL
      AND telegram_phone_verified_bot_id IS NULL)
    OR
    (telegram_phone_encrypted IS NOT NULL
      AND telegram_phone_verified_at IS NOT NULL
      AND telegram_phone_verified_bot_id ~ '^[0-9]{5,20}$')
  );

CREATE INDEX users_telegram_phone_verified_at_idx
  ON users(telegram_phone_verified_at)
  WHERE telegram_phone_verified_at IS NOT NULL;
