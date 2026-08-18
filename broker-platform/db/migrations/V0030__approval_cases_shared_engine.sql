-- Formal shared approval-case backbone for the authorized full build.
-- Existing application-specific approval_events remain intact; these generic
-- tables let the four portals converge on one versioned workflow contract.

CREATE TABLE approval_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL CHECK (aggregate_type IN (
    'APPLICATION',
    'DISBURSEMENT',
    'WRITE_OFF',
    'COMPLAINT',
    'CONTRACT_TEMPLATE',
    'PRODUCT_RULE'
  )),
  aggregate_id uuid NOT NULL,
  workflow_definition_code text NOT NULL CHECK (workflow_definition_code IN (
    'SALARY_LOAN_APPLICATION_V1',
    'DISBURSEMENT_APPROVAL_V1',
    'WRITE_OFF_APPROVAL_V1',
    'COMPLAINT_FINAL_REVIEW_V1'
  )),
  workflow_definition_version integer NOT NULL CHECK (workflow_definition_version >= 1),
  current_step text NOT NULL CHECK (current_step IN (
    'BROKER_REVIEW',
    'EMPLOYER_VERIFICATION',
    'LENDER_KYC_REVIEW',
    'CREDIT_MAKER_REVIEW',
    'CREDIT_CHECKER_REVIEW',
    'OFFER_READY',
    'DISBURSEMENT_MAKER_REVIEW',
    'DISBURSEMENT_CHECKER_REVIEW',
    'MANUAL_DISBURSEMENT_EXECUTION',
    'WRITE_OFF_MAKER_REVIEW',
    'WRITE_OFF_CHECKER_REVIEW',
    'RECONCILIATION',
    'COMPLAINT_FINAL_REVIEW'
  )),
  status text NOT NULL CHECK (status IN (
    'PENDING',
    'RETURNED',
    'REJECTED',
    'CANCELLED',
    'COMPLETED'
  )),
  assigned_department_code text,
  assigned_role_code text,
  assignee_user_ref text,
  current_round integer NOT NULL DEFAULT 1 CHECK (current_round >= 1),
  strategy_requires_checker boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id)
);

CREATE TABLE approval_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_case_id uuid NOT NULL REFERENCES approval_cases(id),
  step text NOT NULL CHECK (step IN (
    'BROKER_REVIEW',
    'EMPLOYER_VERIFICATION',
    'LENDER_KYC_REVIEW',
    'CREDIT_MAKER_REVIEW',
    'CREDIT_CHECKER_REVIEW',
    'OFFER_READY',
    'DISBURSEMENT_MAKER_REVIEW',
    'DISBURSEMENT_CHECKER_REVIEW',
    'MANUAL_DISBURSEMENT_EXECUTION',
    'WRITE_OFF_MAKER_REVIEW',
    'WRITE_OFF_CHECKER_REVIEW',
    'RECONCILIATION',
    'COMPLAINT_FINAL_REVIEW'
  )),
  action text NOT NULL CHECK (action IN (
    'APPROVE',
    'REJECT',
    'RETURN',
    'REQUEST_SUPPLEMENT',
    'ESCALATE',
    'CANCEL'
  )),
  actor_user_ref text NOT NULL,
  actor_role text NOT NULL,
  reason_code text,
  reason_note_encrypted bytea,
  input_snapshot_hash text NOT NULL CHECK (input_snapshot_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  audit_event_id uuid REFERENCES audit_events(id),
  current_round integer NOT NULL CHECK (current_round >= 1),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_case_events_reason_required_check CHECK (
    (action IN ('REJECT', 'RETURN', 'REQUEST_SUPPLEMENT', 'ESCALATE', 'CANCEL') AND reason_code IS NOT NULL)
    OR (action = 'APPROVE')
  ),
  UNIQUE (approval_case_id, idempotency_key)
);

CREATE INDEX approval_cases_status_step_queue_idx
  ON approval_cases(status, current_step, assigned_role_code, created_at DESC);

CREATE INDEX approval_case_events_case_step_idx
  ON approval_case_events(approval_case_id, step, occurred_at DESC);

CREATE INDEX approval_case_events_audit_idx
  ON approval_case_events(audit_event_id, occurred_at DESC);

CREATE TRIGGER approval_case_events_append_only
  BEFORE UPDATE OR DELETE ON approval_case_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
