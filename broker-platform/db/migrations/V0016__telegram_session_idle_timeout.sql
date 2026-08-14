-- An absolute TTL alone does not protect a Telegram Mini App left open on an
-- unattended device. Authentication refreshes this timestamp only after a
-- valid request; five minutes of inactivity requires fresh signed initData.
ALTER TABLE telegram_auth_sessions
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX telegram_auth_sessions_idle_expiry_idx
  ON telegram_auth_sessions(token_hash, last_seen_at, expires_at)
  WHERE revoked_at IS NULL;
