-- Controlled-preview administrator RBAC and opaque server-side sessions.
-- No default password, user account, or token is stored in this migration.

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('OPS', 'BROKER', 'LENDER', 'EMPLOYER')),
  code text NOT NULL UNIQUE,
  display_name_zh text NOT NULL,
  display_name_en text NOT NULL,
  display_name_km text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('OPS', 'BROKER', 'LENDER', 'EMPLOYER')),
  code text NOT NULL UNIQUE,
  display_name_zh text NOT NULL,
  display_name_en text NOT NULL,
  display_name_km text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  code text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id),
  permission_code text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id),
  preferred_language text NOT NULL DEFAULT 'zh-CN' CHECK (preferred_language IN ('km', 'en', 'zh-CN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_account_roles (
  account_id uuid NOT NULL REFERENCES admin_accounts(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  PRIMARY KEY (account_id, role_id)
);

CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES admin_accounts(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_sessions_account_active_idx
  ON admin_sessions(account_id, expires_at)
  WHERE revoked_at IS NULL;
