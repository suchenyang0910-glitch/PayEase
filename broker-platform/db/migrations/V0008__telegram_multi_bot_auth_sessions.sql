-- Raw Bot tokens and OIDC client secrets remain VPS-local secrets.  This table
-- records only the trusted Bot ID and hashed, short-lived session/replay values.
CREATE TABLE telegram_auth_sessions (
  token_hash text PRIMARY KEY,
  telegram_user_ref text NOT NULL,
  authenticated_bot_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX telegram_auth_sessions_user_expiry_idx
  ON telegram_auth_sessions(telegram_user_ref, expires_at DESC);

CREATE TABLE telegram_initdata_replay_guards (
  initdata_hash text PRIMARY KEY,
  authenticated_bot_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
