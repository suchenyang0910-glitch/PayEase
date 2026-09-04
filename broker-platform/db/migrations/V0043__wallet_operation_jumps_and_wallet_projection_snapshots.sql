CREATE TABLE wallet_operation_jumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  jump_ref text NOT NULL UNIQUE CHECK (
    jump_ref ~ '^woj_[A-Za-z0-9]{24,64}$'
  ),
  operation_type text NOT NULL CHECK (
    operation_type IN ('WITHDRAWAL', 'REPAYMENT')
  ),
  jump_token_hash text NOT NULL UNIQUE CHECK (
    jump_token_hash ~ '^[a-f0-9]{64}$'
  ),
  target_host text NOT NULL CHECK (position('.' in target_host) > 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by_user_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (consumed_at IS NULL OR consumed_at >= created_at)
    AND (revoked_at IS NULL OR revoked_at >= created_at)
  )
);

CREATE INDEX wallet_operation_jumps_application_idx
  ON wallet_operation_jumps(application_id, created_at DESC);

CREATE INDEX wallet_operation_jumps_open_idx
  ON wallet_operation_jumps(application_id, operation_type, expires_at ASC)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE lender_wallet_projection_snapshots (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  external_wallet_ref text NOT NULL UNIQUE,
  wallet_status text NOT NULL CHECK (
    wallet_status IN (
      'WALLET_PENDING',
      'WALLET_AVAILABLE',
      'WITHDRAWAL_PROCESSING',
      'WITHDRAWAL_FAILED',
      'WITHDRAWN',
      'REPAYMENT_PENDING'
    )
  ),
  available_balance_minor bigint NOT NULL DEFAULT 0 CHECK (
    available_balance_minor >= 0
  ),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  last_callback_event_id text,
  last_projected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_wallet_projection_status_idx
  ON lender_wallet_projection_snapshots(wallet_status, updated_at DESC);
