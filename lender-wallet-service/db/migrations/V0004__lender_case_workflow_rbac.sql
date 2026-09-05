-- Lender-only case workflow.  No Broker table, session, customer PII, or
-- external-provider credential is stored in lender_db.

ALTER TABLE lender_operator_roles
  DROP CONSTRAINT IF EXISTS lender_operator_roles_code_check;

ALTER TABLE lender_operator_roles
  ADD CONSTRAINT lender_operator_roles_code_check CHECK (code IN (
    'LENDER_KYC_AML_REVIEWER',
    'LENDER_CREDIT_REVIEWER',
    'LENDER_CREDIT_APPROVER',
    'LENDER_CONTRACT_MAKER',
    'LENDER_CONTRACT_CHECKER',
    'LENDER_DISBURSEMENT_MAKER',
    'LENDER_DISBURSEMENT_CHECKER',
    'LENDER_SERVICING_ACCOUNTING',
    'LENDER_COMPLAINT_OFFICER',
    'LENDER_AUDITOR',
    'LENDER_WALLET_MAKER',
    'LENDER_WALLET_CHECKER',
    'LENDER_WALLET_ADMIN'
  ));

INSERT INTO lender_operator_roles (code, description) VALUES
  ('LENDER_KYC_AML_REVIEWER', 'Reviews identity, document, liveness evidence, and controlled compliance-screening references.'),
  ('LENDER_CREDIT_REVIEWER', 'Reviews the lender application package and records an initial credit conclusion.'),
  ('LENDER_CREDIT_APPROVER', 'Makes the final lender credit approval or rejection decision.'),
  ('LENDER_CONTRACT_MAKER', 'Prepares a contract evidence package for independent review.'),
  ('LENDER_CONTRACT_CHECKER', 'Reviews contract evidence and must differ from the contract maker.'),
  ('LENDER_DISBURSEMENT_MAKER', 'Prepares a manual disbursement instruction and beneficiary evidence reference.'),
  ('LENDER_DISBURSEMENT_CHECKER', 'Reviews a manual disbursement instruction and must differ from the maker.'),
  ('LENDER_SERVICING_ACCOUNTING', 'Records repayment evidence, servicing exceptions, and settlement conclusions.'),
  ('LENDER_COMPLAINT_OFFICER', 'Handles lender-responsible complaints only; cannot change credit or accounting decisions.'),
  ('LENDER_AUDITOR', 'Reads immutable lender audit records without any write permission.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE lender_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL UNIQUE CHECK (case_ref ~ '^lcase_[A-Za-z0-9_-]{8,96}$'),
  external_application_ref text NOT NULL UNIQUE CHECK (external_application_ref ~ '^[A-Za-z0-9._:-]{4,128}$'),
  case_type text NOT NULL CHECK (case_type IN ('LOAN', 'COMPLAINT')),
  stage text NOT NULL CHECK (stage IN (
    'KYC_AML_REVIEW', 'CREDIT_REVIEW', 'CREDIT_APPROVAL', 'CONTRACT_MAKER',
    'CONTRACT_CHECKER', 'DISBURSEMENT_MAKER', 'DISBURSEMENT_CHECKER',
    'SERVICING', 'COMPLAINT', 'CLOSED'
  )),
  status text NOT NULL CHECK (status IN (
    'OPEN', 'AWAITING_INFORMATION', 'NEEDS_REWORK', 'ACTIVE', 'REJECTED', 'SETTLED', 'CLOSED'
  )),
  applicant_evidence_ref text NOT NULL CHECK (
    applicant_evidence_ref ~ '^vault://lender/[A-Za-z0-9._/-]+$'
    AND length(applicant_evidence_ref) BETWEEN 18 AND 520
  ),
  contract_maker_ref text,
  disbursement_maker_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((case_type = 'COMPLAINT') = (stage = 'COMPLAINT' OR (stage = 'CLOSED' AND status = 'CLOSED')))
);

CREATE INDEX lender_cases_open_queue_idx
  ON lender_cases(stage, created_at ASC)
  WHERE status NOT IN ('REJECTED', 'SETTLED', 'CLOSED');

CREATE TABLE lender_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES lender_cases(id),
  event_ref text NOT NULL UNIQUE CHECK (event_ref ~ '^lcaseevt_[A-Za-z0-9_-]{8,128}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'CASE_CREATED', 'KYC_AML_PASSED', 'KYC_AML_MORE_INFO_REQUIRED', 'KYC_AML_REJECTED',
    'CREDIT_REVIEW_PASSED', 'CREDIT_MORE_INFO_REQUIRED', 'CREDIT_APPROVED', 'CREDIT_REJECTED',
    'CONTRACT_DRAFTED', 'CONTRACT_APPROVED', 'CONTRACT_REJECTED',
    'DISBURSEMENT_PREPARED', 'DISBURSEMENT_APPROVED', 'DISBURSEMENT_FAILED',
    'REPAYMENT_RECORDED', 'LOAN_SETTLED', 'SERVICING_EXCEPTION',
    'COMPLAINT_ACKNOWLEDGED', 'COMPLAINT_RESOLVED', 'COMPLAINT_CLOSED'
  )),
  actor_ref text NOT NULL,
  actor_role text NOT NULL REFERENCES lender_operator_roles(code),
  source_domain text NOT NULL CHECK (source_domain = 'LENDER'),
  evidence_reference text NOT NULL CHECK (
    evidence_reference ~ '^vault://lender/[A-Za-z0-9._/-]+$'
    AND length(evidence_reference) BETWEEN 18 AND 520
  ),
  reason_code text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_case_events_case_idx ON lender_case_events(case_id, created_at ASC);

CREATE TABLE lender_role_field_visibility (
  role_code text NOT NULL REFERENCES lender_operator_roles(code),
  resource_code text NOT NULL CHECK (resource_code IN (
    'CASE_SUMMARY', 'KYC_EVIDENCE', 'CREDIT_DECISION', 'CONTRACT_EVIDENCE',
    'DISBURSEMENT', 'SERVICING', 'COMPLAINT', 'AUDIT'
  )),
  field_code text NOT NULL CHECK (field_code ~ '^[A-Z0-9_]{2,80}$'),
  is_visible boolean NOT NULL,
  updated_by_ref text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, resource_code, field_code)
);

CREATE OR REPLACE FUNCTION guard_lender_case_projection_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lender case projection cannot be deleted';
  END IF;
  IF current_setting('payease.allow_lender_case_projection_update', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'lender case updates must be paired with an append-only case event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lender_case_events_append_only
  BEFORE UPDATE OR DELETE ON lender_case_events
  FOR EACH ROW EXECUTE FUNCTION deny_lender_wallet_append_only_mutation();

CREATE TRIGGER lender_cases_projection_guard
  BEFORE UPDATE OR DELETE ON lender_cases
  FOR EACH ROW EXECUTE FUNCTION guard_lender_case_projection_update();
