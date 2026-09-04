-- Independent lender-side operator identity. No Broker account, session, or
-- role table is referenced by lender_db.

CREATE TABLE lender_operator_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_name text NOT NULL UNIQUE CHECK (login_name ~ '^[a-z0-9._-]{3,64}$'),
  password_hash text NOT NULL,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('zh-CN', 'en', 'km')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lender_operator_roles (
  code text PRIMARY KEY CHECK (code IN (
    'LENDER_WALLET_MAKER',
    'LENDER_WALLET_CHECKER',
    'LENDER_WALLET_ADMIN'
  )),
  description text NOT NULL
);

INSERT INTO lender_operator_roles (code, description) VALUES
  ('LENDER_WALLET_MAKER', 'May verify approved operations and record a manual bank action.'),
  ('LENDER_WALLET_CHECKER', 'May approve a maker request and confirm settlement or failure.'),
  ('LENDER_WALLET_ADMIN', 'May provision lender-domain operator accounts and roles.');

CREATE TABLE lender_operator_account_roles (
  account_id uuid NOT NULL REFERENCES lender_operator_accounts(id),
  role_code text NOT NULL REFERENCES lender_operator_roles(code),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, role_code)
);

CREATE TABLE lender_operator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid NOT NULL REFERENCES lender_operator_accounts(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX lender_operator_sessions_active_idx
  ON lender_operator_sessions(expires_at ASC)
  WHERE revoked_at IS NULL;

CREATE TABLE lender_operator_auth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_ref text NOT NULL,
  event_name text NOT NULL,
  subject_ref text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER lender_operator_auth_audit_events_append_only
  BEFORE UPDATE OR DELETE ON lender_operator_auth_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();
