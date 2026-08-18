ALTER TABLE users
  ADD COLUMN telegram_display_name text,
  ADD COLUMN telegram_username text,
  ADD COLUMN telegram_photo_url text;

ALTER TABLE users
  ADD CONSTRAINT users_telegram_display_name_length_chk
    CHECK (
      telegram_display_name IS NULL OR
      char_length(telegram_display_name) BETWEEN 1 AND 160
    ),
  ADD CONSTRAINT users_telegram_username_format_chk
    CHECK (
      telegram_username IS NULL OR
      telegram_username ~ '^[A-Za-z0-9_]{5,32}$'
    ),
  ADD CONSTRAINT users_telegram_photo_url_length_chk
    CHECK (
      telegram_photo_url IS NULL OR
      char_length(telegram_photo_url) BETWEEN 1 AND 2048
    );
