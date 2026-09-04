CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE lender_wallet_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token_hash text NOT NULL UNIQUE CHECK (
    session_token_hash ~ '^[a-f0-9]{64}$'
  ),
  application_no text NOT NULL,
  jump_ref text NOT NULL CHECK (
    jump_ref ~ '^woj_[A-Za-z0-9]{24,64}$'
  ),
  operation_type text NOT NULL CHECK (
    operation_type IN ('WITHDRAWAL', 'REPAYMENT')
  ),
  external_wallet_ref text,
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
  available_balance_minor bigint NOT NULL CHECK (
    available_balance_minor >= 0
  ),
  currency text NOT NULL CHECK (currency = 'USD'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX lender_wallet_sessions_active_idx
  ON lender_wallet_sessions(expires_at ASC)
  WHERE revoked_at IS NULL;

CREATE TABLE lender_wallet_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL,
  external_wallet_ref text NOT NULL,
  entry_type text NOT NULL CHECK (
    entry_type IN ('CREDIT', 'DEBIT', 'AUTH_HOLD', 'AUTH_RELEASE')
  ),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  balance_after_minor bigint CHECK (balance_after_minor >= 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  source_reference text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lender_wallet_funds_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL,
  external_wallet_ref text NOT NULL,
  order_ref text NOT NULL UNIQUE,
  order_type text NOT NULL CHECK (
    order_type IN ('WITHDRAWAL', 'REPAYMENT')
  ),
  status text NOT NULL CHECK (
    status IN (
      'PENDING_AUTH',
      'AUTHORIZED',
      'PROCESSING',
      'SETTLED',
      'FAILED',
      'CANCELLED'
    )
  ),
  requested_amount_minor bigint NOT NULL CHECK (
    requested_amount_minor >= 0
  ),
  settled_amount_minor bigint CHECK (settled_amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lender_wallet_funds_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES lender_wallet_funds_orders(id),
  event_ref text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'ORDER_CREATED',
      'AUTHORIZATION_REQUESTED',
      'AUTHORIZED',
      'PROCESSING',
      'SETTLED',
      'FAILED',
      'CANCELLED'
    )
  ),
  actor_ref text NOT NULL,
  external_callback_ref text,
  amount_minor bigint CHECK (amount_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_wallet_funds_order_events_order_idx
  ON lender_wallet_funds_order_events(order_id, created_at ASC);

-- Lender-owned repayment snapshots are the sole source for a repayment amount.
-- They are populated by the lender's contract/accounting service, never by Broker.
CREATE TABLE lender_wallet_repayment_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL,
  external_wallet_ref text NOT NULL,
  payable_amount_minor bigint NOT NULL CHECK (payable_amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  accounting_snapshot_ref text NOT NULL UNIQUE,
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_wallet_repayment_snapshots_current_idx
  ON lender_wallet_repayment_snapshots(application_no, effective_at DESC, created_at DESC);

CREATE TABLE channel_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider ~ '^[A-Za-z0-9._-]{2,64}$'),
  callback_ref text NOT NULL CHECK (length(callback_ref) BETWEEN 8 AND 128),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 12 AND 128),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  order_ref text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, callback_ref),
  UNIQUE (provider, nonce)
);

CREATE TABLE wallet_operation_result_outbox (
  event_id text PRIMARY KEY,
  event_type text NOT NULL CHECK (
    event_type IN ('AUTHORIZED', 'PROCESSING', 'SETTLED', 'FAILED')
  ),
  external_application_ref text NOT NULL,
  order_ref text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  signature_key_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_operation_result_dispatch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES wallet_operation_result_outbox(event_id),
  delivery_status text NOT NULL CHECK (delivery_status IN ('DISPATCHED', 'FAILED')),
  http_status_code integer,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (delivery_status = 'DISPATCHED' AND http_status_code IS NOT NULL)
    OR delivery_status = 'FAILED'
  )
);

CREATE INDEX wallet_operation_result_outbox_pending_idx
  ON wallet_operation_result_outbox(created_at ASC);

CREATE TABLE lender_wallet_event_outbox (
  event_id text PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type = 'WALLET_CREDIT_CONFIRMED'),
  external_application_ref text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (
    payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  signature_key_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_wallet_event_outbox_status_idx
  ON lender_wallet_event_outbox(created_at ASC);

CREATE TABLE lender_wallet_event_dispatch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES lender_wallet_event_outbox(event_id),
  delivery_status text NOT NULL CHECK (
    delivery_status IN ('DISPATCHED', 'FAILED')
  ),
  http_status_code integer,
  error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (delivery_status = 'DISPATCHED' AND http_status_code IS NOT NULL)
    OR (delivery_status = 'FAILED')
  )
);

CREATE INDEX lender_wallet_event_dispatch_attempts_event_idx
  ON lender_wallet_event_dispatch_attempts(event_id, attempted_at DESC);

CREATE TABLE lender_wallet_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_ref text NOT NULL,
  event_name text NOT NULL,
  application_no text,
  subject_ref text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION deny_lender_wallet_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only wallet fact table does not allow %', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION guard_lender_wallet_funds_order_projection_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'funds order projection is append-only from the application perspective';
  END IF;
  IF current_setting('payease.allow_funds_order_projection_update', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'funds order projection updates must go through transition_lender_wallet_funds_order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_lender_wallet_funds_order(
  p_application_no text,
  p_external_wallet_ref text,
  p_order_ref text,
  p_order_type text,
  p_requested_amount_minor bigint,
  p_currency text,
  p_idempotency_key text,
  p_actor_ref text,
  p_event_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS lender_wallet_funds_orders
LANGUAGE plpgsql
AS $$
DECLARE
  created_order lender_wallet_funds_orders%ROWTYPE;
BEGIN
  PERFORM set_config('payease.allow_funds_order_projection_update', 'on', true);

  INSERT INTO lender_wallet_funds_orders
    (application_no, external_wallet_ref, order_ref, order_type, status,
     requested_amount_minor, currency, idempotency_key, metadata)
  VALUES
    (p_application_no, p_external_wallet_ref, p_order_ref, p_order_type, 'PENDING_AUTH',
     p_requested_amount_minor, p_currency, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO created_order;

  INSERT INTO lender_wallet_funds_order_events
    (order_id, event_ref, event_type, actor_ref, amount_minor, metadata)
  VALUES
    (created_order.id, p_event_ref, 'ORDER_CREATED', p_actor_ref, p_requested_amount_minor,
     COALESCE(p_metadata, '{}'::jsonb));

  RETURN created_order;
END;
$$;

CREATE OR REPLACE FUNCTION transition_lender_wallet_funds_order(
  p_order_ref text,
  p_event_ref text,
  p_event_type text,
  p_actor_ref text,
  p_next_status text,
  p_external_callback_ref text DEFAULT NULL,
  p_amount_minor bigint DEFAULT NULL,
  p_settled_amount_minor bigint DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS lender_wallet_funds_orders
LANGUAGE plpgsql
AS $$
DECLARE
  current_order lender_wallet_funds_orders%ROWTYPE;
  updated_order lender_wallet_funds_orders%ROWTYPE;
BEGIN
  SELECT *
    INTO current_order
    FROM lender_wallet_funds_orders
   WHERE order_ref = p_order_ref
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'funds order not found: %', p_order_ref;
  END IF;

  IF (current_order.status = 'PENDING_AUTH' AND p_next_status NOT IN ('PENDING_AUTH', 'AUTHORIZED', 'FAILED', 'CANCELLED'))
     OR (current_order.status = 'AUTHORIZED' AND p_next_status NOT IN ('PROCESSING', 'FAILED', 'CANCELLED'))
     OR (current_order.status = 'PROCESSING' AND p_next_status NOT IN ('SETTLED', 'FAILED'))
     OR (current_order.status IN ('SETTLED', 'FAILED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'illegal funds order transition: % -> %', current_order.status, p_next_status;
  END IF;

  IF p_event_type NOT IN (
       'AUTHORIZATION_REQUESTED',
       'AUTHORIZED',
       'PROCESSING',
       'SETTLED',
       'FAILED',
       'CANCELLED'
     ) THEN
    RAISE EXCEPTION 'event type % is not allowed for post-create transitions', p_event_type;
  END IF;

  IF (p_event_type = 'AUTHORIZATION_REQUESTED' AND p_next_status <> 'PENDING_AUTH')
     OR (p_event_type = 'AUTHORIZED' AND p_next_status <> 'AUTHORIZED')
     OR (p_event_type = 'PROCESSING' AND p_next_status <> 'PROCESSING')
     OR (p_event_type = 'SETTLED' AND p_next_status <> 'SETTLED')
     OR (p_event_type = 'FAILED' AND p_next_status <> 'FAILED')
     OR (p_event_type = 'CANCELLED' AND p_next_status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'event type % is inconsistent with target status %', p_event_type, p_next_status;
  END IF;

  INSERT INTO lender_wallet_funds_order_events
    (order_id, event_ref, event_type, actor_ref, external_callback_ref, amount_minor, metadata)
  VALUES
    (current_order.id, p_event_ref, p_event_type, p_actor_ref, p_external_callback_ref, p_amount_minor,
     COALESCE(p_metadata, '{}'::jsonb));

  PERFORM set_config('payease.allow_funds_order_projection_update', 'on', true);

  UPDATE lender_wallet_funds_orders
     SET status = p_next_status,
         settled_amount_minor = CASE
           WHEN p_next_status = 'SETTLED' THEN COALESCE(p_settled_amount_minor, settled_amount_minor)
           WHEN p_settled_amount_minor IS NOT NULL THEN p_settled_amount_minor
           ELSE settled_amount_minor
         END,
         metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
         updated_at = now()
   WHERE id = current_order.id
   RETURNING * INTO updated_order;

  RETURN updated_order;
END;
$$;

CREATE TRIGGER lender_wallet_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_wallet_funds_orders_projection_guard
  BEFORE UPDATE OR DELETE ON lender_wallet_funds_orders
  FOR EACH ROW
  EXECUTE FUNCTION guard_lender_wallet_funds_order_projection_update();

CREATE TRIGGER lender_wallet_event_outbox_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_event_outbox
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_wallet_event_dispatch_attempts_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_event_dispatch_attempts
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_wallet_funds_order_events_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_funds_order_events
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_wallet_repayment_snapshots_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_repayment_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER channel_callback_receipts_append_only
  BEFORE UPDATE OR DELETE ON channel_callback_receipts
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER wallet_operation_result_outbox_append_only
  BEFORE UPDATE OR DELETE ON wallet_operation_result_outbox
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER wallet_operation_result_dispatch_attempts_append_only
  BEFORE UPDATE OR DELETE ON wallet_operation_result_dispatch_attempts
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_wallet_audit_events_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();
