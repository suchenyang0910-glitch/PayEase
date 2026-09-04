-- Controlled manual bank operations belong exclusively to lender_db.
-- This migration does not store bank-account numbers, payment passwords, OTPs,
-- or evidence files; evidence_reference points to the lender-controlled vault.

CREATE TABLE lender_wallet_manual_operation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funds_order_id uuid NOT NULL UNIQUE REFERENCES lender_wallet_funds_orders(id),
  status text NOT NULL CHECK (
    status IN (
      'REQUESTED',
      'MAKER_VERIFIED',
      'CHECKER_APPROVED',
      'BANK_TRANSFER_RECORDED',
      'SETTLED',
      'FAILED',
      'CANCELLED'
    )
  ),
  requested_by_ref text NOT NULL,
  maker_ref text,
  checker_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (maker_ref IS NULL OR checker_ref IS NULL OR maker_ref <> checker_ref)
);

CREATE INDEX lender_wallet_manual_operation_cases_open_idx
  ON lender_wallet_manual_operation_cases(created_at ASC)
  WHERE status IN ('REQUESTED', 'MAKER_VERIFIED', 'CHECKER_APPROVED', 'BANK_TRANSFER_RECORDED');

CREATE TABLE lender_wallet_manual_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES lender_wallet_manual_operation_cases(id),
  event_ref text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'REQUESTED',
      'MAKER_VERIFIED',
      'CHECKER_APPROVED',
      'BANK_TRANSFER_RECORDED',
      'SETTLED',
      'FAILED',
      'CANCELLED'
    )
  ),
  actor_ref text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('APPLICANT', 'MAKER', 'CHECKER', 'SYSTEM')),
  evidence_reference text,
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_wallet_manual_operation_events_operation_idx
  ON lender_wallet_manual_operation_events(operation_id, created_at ASC);

CREATE OR REPLACE FUNCTION guard_lender_wallet_manual_operation_projection_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'manual operation projection cannot be deleted';
  END IF;
  IF current_setting('payease.allow_manual_operation_projection_update', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'manual operation updates must go through transition_lender_wallet_manual_operation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION create_lender_wallet_manual_operation(
  p_funds_order_id uuid,
  p_requested_by_ref text,
  p_event_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS lender_wallet_manual_operation_cases
LANGUAGE plpgsql
AS $$
DECLARE
  created_operation lender_wallet_manual_operation_cases%ROWTYPE;
BEGIN
  PERFORM set_config('payease.allow_manual_operation_projection_update', 'on', true);
  INSERT INTO lender_wallet_manual_operation_cases
    (funds_order_id, status, requested_by_ref)
  VALUES
    (p_funds_order_id, 'REQUESTED', p_requested_by_ref)
  RETURNING * INTO created_operation;

  INSERT INTO lender_wallet_manual_operation_events
    (operation_id, event_ref, event_type, actor_ref, actor_role, metadata)
  VALUES
    (created_operation.id, p_event_ref, 'REQUESTED', p_requested_by_ref, 'APPLICANT',
     COALESCE(p_metadata, '{}'::jsonb));
  RETURN created_operation;
END;
$$;

CREATE OR REPLACE FUNCTION transition_lender_wallet_manual_operation(
  p_operation_id uuid,
  p_event_ref text,
  p_event_type text,
  p_actor_ref text,
  p_actor_role text,
  p_evidence_reference text DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS lender_wallet_manual_operation_cases
LANGUAGE plpgsql
AS $$
DECLARE
  current_operation lender_wallet_manual_operation_cases%ROWTYPE;
  next_status text;
  updated_operation lender_wallet_manual_operation_cases%ROWTYPE;
BEGIN
  SELECT * INTO current_operation
    FROM lender_wallet_manual_operation_cases
   WHERE id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'manual operation not found: %', p_operation_id;
  END IF;

  IF p_event_type NOT IN ('MAKER_VERIFIED', 'CHECKER_APPROVED', 'BANK_TRANSFER_RECORDED', 'SETTLED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'manual operation event type % is not allowed after creation', p_event_type;
  END IF;

  next_status := p_event_type;
  IF (current_operation.status = 'REQUESTED' AND next_status NOT IN ('MAKER_VERIFIED', 'CANCELLED'))
     OR (current_operation.status = 'MAKER_VERIFIED' AND next_status NOT IN ('CHECKER_APPROVED', 'CANCELLED'))
     OR (current_operation.status = 'CHECKER_APPROVED' AND next_status NOT IN ('BANK_TRANSFER_RECORDED', 'CANCELLED'))
     OR (current_operation.status = 'BANK_TRANSFER_RECORDED' AND next_status NOT IN ('SETTLED', 'FAILED'))
     OR current_operation.status IN ('SETTLED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'illegal manual operation transition: % -> %', current_operation.status, next_status;
  END IF;

  IF (p_event_type = 'MAKER_VERIFIED' AND p_actor_role <> 'MAKER')
     OR (p_event_type IN ('CHECKER_APPROVED', 'SETTLED', 'FAILED') AND p_actor_role <> 'CHECKER')
     OR (p_event_type = 'BANK_TRANSFER_RECORDED' AND p_actor_role <> 'MAKER') THEN
    RAISE EXCEPTION 'manual operation event % requires its assigned operator role', p_event_type;
  END IF;
  IF p_event_type = 'CHECKER_APPROVED' AND p_actor_ref = current_operation.maker_ref THEN
    RAISE EXCEPTION 'manual operation checker must differ from maker';
  END IF;
  IF p_event_type IN ('BANK_TRANSFER_RECORDED', 'SETTLED', 'FAILED') AND (p_evidence_reference IS NULL OR length(trim(p_evidence_reference)) = 0) THEN
    RAISE EXCEPTION 'manual operation event % requires evidence reference', p_event_type;
  END IF;

  INSERT INTO lender_wallet_manual_operation_events
    (operation_id, event_ref, event_type, actor_ref, actor_role, evidence_reference, reason_code, metadata)
  VALUES
    (current_operation.id, p_event_ref, p_event_type, p_actor_ref, p_actor_role,
     p_evidence_reference, p_reason_code, COALESCE(p_metadata, '{}'::jsonb));

  PERFORM set_config('payease.allow_manual_operation_projection_update', 'on', true);
  UPDATE lender_wallet_manual_operation_cases
     SET status = next_status,
         maker_ref = CASE WHEN p_event_type = 'MAKER_VERIFIED' THEN p_actor_ref ELSE maker_ref END,
         checker_ref = CASE WHEN p_event_type = 'CHECKER_APPROVED' THEN p_actor_ref ELSE checker_ref END,
         updated_at = now()
   WHERE id = current_operation.id
   RETURNING * INTO updated_operation;
  RETURN updated_operation;
END;
$$;

CREATE TRIGGER lender_wallet_manual_operation_cases_projection_guard
  BEFORE UPDATE OR DELETE ON lender_wallet_manual_operation_cases
  FOR EACH ROW
  EXECUTE FUNCTION guard_lender_wallet_manual_operation_projection_update();

CREATE TRIGGER lender_wallet_manual_operation_events_append_only
  BEFORE UPDATE OR DELETE ON lender_wallet_manual_operation_events
  FOR EACH ROW
  EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();
