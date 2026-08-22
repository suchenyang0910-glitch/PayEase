-- PayEase lender-domain V2 workflow backbone.
-- This schema is intentionally lender-owned. It stores lender case state,
-- lender approval facts, contract-evidence receipt/acceptance, pre-disbursement
-- payment acceptances, disbursement, and payroll-collection reconciliation.
-- It must run against lender_db only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION deny_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only event table: % operations are forbidden', TG_OP;
END;
$$;

CREATE TABLE lender_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_ref text NOT NULL UNIQUE,
  broker_application_ref text NOT NULL,
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  local_status text NOT NULL CHECK (local_status IN (
    'LENDER_REVIEWING',
    'LENDER_MORE_INFO_REQUIRED',
    'DECISION_MADE',
    'FINAL_CONTRACT_READY',
    'CONTRACT_EVIDENCE_ACCEPTED',
    'LENDER_INTEREST_PAYMENT_REVIEWING',
    'LENDER_INTEREST_PAYMENT_ACCEPTED',
    'READY_FOR_DISBURSEMENT',
    'DISBURSEMENT_PROCESSING',
    'DISBURSEMENT_EXCEPTION',
    'DISBURSED',
    'PAYROLL_COLLECTION_PENDING',
    'COLLECTION_RECONCILIATION_PENDING',
    'COLLECTION_EXCEPTION',
    'PAID_OFF',
    'REJECTED',
    'LENDER_CLOSED'
  )),
  latest_broker_event_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_cases_status_idx
  ON lender_cases(local_status, updated_at DESC);

CREATE TABLE lender_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'LENDER_APPLICATION_RECEIVED',
    'MORE_INFORMATION_REQUIRED',
    'LENDER_SUPPLEMENT_RECEIVED',
    'LENDER_REVIEW_RESUMED',
    'DECISION_MADE',
    'FINAL_CONTRACT_READY',
    'CONTRACT_EVIDENCE_RECEIVED',
    'CONTRACT_EVIDENCE_ACCEPTED',
    'BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED',
    'LENDER_INTEREST_PAYMENT_SUBMITTED',
    'LENDER_INTEREST_PAYMENT_ACCEPTED',
    'READY_FOR_DISBURSEMENT',
    'DISBURSEMENT_STARTED',
    'DISBURSEMENT_FAILED',
    'DISBURSED',
    'PAYROLL_COLLECTION_SCHEDULED',
    'PAYROLL_COLLECTION_REPORTED',
    'PARTIALLY_COLLECTED_REPORTED',
    'NOT_COLLECTED_REPORTED',
    'EXCEPTIONAL_PRINCIPAL_PAYMENT_RECEIVED',
    'LOAN_SETTLED',
    'DECISION_REJECTED',
    'LENDER_CASE_CLOSED'
  )),
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER', 'EMPLOYER', 'SYSTEM')),
  actor_user_ref text NOT NULL,
  reason_code text,
  external_event_ref text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_case_id, event_id)
);

CREATE INDEX lender_case_events_case_at_idx
  ON lender_case_events(lender_case_id, occurred_at DESC);

CREATE TABLE lender_contract_evidence_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  broker_submission_event_ref text NOT NULL,
  package_ref text NOT NULL,
  package_hash text NOT NULL CHECK (package_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_case_id, broker_submission_event_ref),
  UNIQUE (lender_case_id, package_hash)
);

CREATE INDEX lender_contract_evidence_receipts_case_at_idx
  ON lender_contract_evidence_receipts(lender_case_id, received_at DESC);

CREATE TABLE lender_contract_evidence_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  lender_contract_evidence_receipt_id uuid NOT NULL REFERENCES lender_contract_evidence_receipts(id),
  accepted_event_ref text NOT NULL,
  accepted_at timestamptz NOT NULL,
  actor_user_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_contract_evidence_receipt_id),
  UNIQUE (lender_case_id, accepted_event_ref)
);

CREATE INDEX lender_contract_evidence_acceptances_case_at_idx
  ON lender_contract_evidence_acceptances(lender_case_id, accepted_at DESC);

CREATE TABLE lender_payment_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  payment_type text NOT NULL CHECK (payment_type IN (
    'BROKERAGE_REMUNERATION_PAYMENT_PROOF',
    'LENDER_INTEREST_PAYMENT_PROOF',
    'EXCEPTIONAL_PRINCIPAL_PAYMENT_PROOF'
  )),
  proof_ref text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  accepted_from_domain text NOT NULL CHECK (accepted_from_domain IN ('BROKER', 'LENDER')),
  accepted_event_ref text NOT NULL,
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_case_id, payment_type)
);

CREATE INDEX lender_payment_acceptances_case_idx
  ON lender_payment_acceptances(lender_case_id, payment_type);

CREATE TABLE lender_disbursement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  event_type text NOT NULL CHECK (event_type IN (
    'READY_FOR_DISBURSEMENT',
    'DISBURSEMENT_STARTED',
    'DISBURSEMENT_FAILED',
    'DISBURSED'
  )),
  actor_user_ref text NOT NULL,
  evidence_reference text,
  reason_code text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_disbursement_events_case_at_idx
  ON lender_disbursement_events(lender_case_id, occurred_at DESC);

CREATE TABLE lender_collection_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_case_id uuid NOT NULL REFERENCES lender_cases(id),
  event_type text NOT NULL CHECK (event_type IN (
    'PAYROLL_COLLECTION_SCHEDULED',
    'PAYROLL_COLLECTION_REPORTED',
    'PARTIALLY_COLLECTED_REPORTED',
    'NOT_COLLECTED_REPORTED',
    'EXCEPTIONAL_PRINCIPAL_PAYMENT_RECEIVED',
    'LOAN_SETTLED'
  )),
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER', 'EMPLOYER')),
  actor_user_ref text NOT NULL,
  payroll_run_date date,
  amount_minor bigint CHECK (amount_minor >= 0),
  currency char(3) CHECK (currency = 'USD'),
  evidence_reference text,
  reason_code text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lender_collection_reconciliation_case_at_idx
  ON lender_collection_reconciliation_events(lender_case_id, occurred_at DESC);

CREATE TRIGGER lender_case_events_append_only
  BEFORE UPDATE OR DELETE ON lender_case_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER lender_contract_evidence_receipts_append_only
  BEFORE UPDATE OR DELETE ON lender_contract_evidence_receipts
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER lender_contract_evidence_acceptances_append_only
  BEFORE UPDATE OR DELETE ON lender_contract_evidence_acceptances
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER lender_payment_acceptances_append_only
  BEFORE UPDATE OR DELETE ON lender_payment_acceptances
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER lender_disbursement_events_append_only
  BEFORE UPDATE OR DELETE ON lender_disbursement_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER lender_collection_reconciliation_events_append_only
  BEFORE UPDATE OR DELETE ON lender_collection_reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
