-- Bind newly issued applicant sessions to the browser context that completed
-- Telegram authentication. Existing sessions remain NULL only for their
-- already-enforced, short absolute lifetime during this rolling deployment.
ALTER TABLE telegram_auth_sessions
  ADD COLUMN client_user_agent_hash text
  CHECK (
    client_user_agent_hash IS NULL
    OR client_user_agent_hash ~ '^[0-9a-f]{64}$'
  );
