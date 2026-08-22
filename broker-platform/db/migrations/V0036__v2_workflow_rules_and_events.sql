-- M0-02 additive schema for salary-loan V2.
-- This migration preserves all legacy V1 tables and routes.  It introduces
-- versioned workflow metadata, broker-local V2 workflow state, payment
-- allocation modeling, and append-only event tables for contract evidence,
-- pre-disbursement payments, and payroll collection.

ALTER TABLE applications
  ADD COLUMN workflow_version text NOT NULL DEFAULT 'LEGACY_V1'
    CHECK (workflow_version IN ('LEGACY_V1', 'SALARY_LOAN_V2')),
  ADD COLUMN legacy_status text,
  ADD COLUMN cutover_decision text
    CHECK (cutover_decision IN ('CONTINUE_LEGACY_FLOW', 'CUTOVER_TO_V2')),
  ADD COLUMN cutover_at timestamptz,
  ADD COLUMN cutover_actor_user_ref text,
  ADD COLUMN source_application_id uuid REFERENCES applications(id),
  ADD COLUMN successor_application_id uuid REFERENCES applications(id),
  ADD COLUMN lender_case_ref text;

CREATE INDEX applications_workflow_version_created_idx
  ON applications(workflow_version, created_at DESC);

CREATE TABLE broker_application_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES applications(id),
  broker_application_ref text NOT NULL UNIQUE,
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  broker_status text NOT NULL CHECK (broker_status IN (
    'DRAFT',
    'SUBMITTED',
    'BROKER_REVIEW',
    'EMPLOYER_VERIFICATION',
    'LENDER_PACKAGE_SENT',
    'LENDER_MORE_INFO_REQUIRED',
    'LENDER_DECISION_RECEIVED',
    'FINAL_CONTRACT_READY',
    'CONTRACT_EVIDENCE_COLLECTED',
    'PRE_DISBURSEMENT_PAYMENTS_PENDING',
    'PRE_DISBURSEMENT_PAYMENTS_IN_PROGRESS',
    'PRE_DISBURSEMENT_PAYMENTS_CONFIRMED',
    'READY_FOR_DISBURSEMENT',
    'DISBURSEMENT_PROCESSING',
    'DISBURSEMENT_EXCEPTION',
    'DISBURSED',
    'PAYROLL_COLLECTION_PENDING',
    'COLLECTION_RECONCILIATION_PENDING',
    'COLLECTION_EXCEPTION',
    'PAID_OFF',
    'REJECTED',
    'BROKER_CLOSED',
    'LENDER_CLOSED'
  )),
  payment_projection_status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (
    payment_projection_status IN (
      'NOT_STARTED',
      'PRE_DISBURSEMENT_PAYMENTS_IN_PROGRESS',
      'PRE_DISBURSEMENT_PAYMENTS_CONFIRMED'
    )
  ),
  contract_signature_captured boolean NOT NULL DEFAULT false,
  contract_video_captured boolean NOT NULL DEFAULT false,
  payroll_authorization_captured boolean NOT NULL DEFAULT false,
  contract_evidence_submitted boolean NOT NULL DEFAULT false,
  contract_evidence_submission_event_ref text,
  contract_evidence_acceptance_event_ref text,
  last_lender_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX broker_application_workflows_status_idx
  ON broker_application_workflows(broker_status, updated_at DESC);

CREATE TABLE broker_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_workflow_id uuid NOT NULL REFERENCES broker_application_workflows(id),
  event_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'APPLICATION_SUBMITTED',
    'BROKER_PRECHECK_STARTED',
    'BROKER_PRECHECK_PASSED',
    'EMPLOYER_VERIFICATION_STARTED',
    'EMPLOYER_VERIFIED',
    'APPLICATION_PACKAGE_SUBMITTED',
    'MORE_INFORMATION_REQUIRED',
    'DECISION_AVAILABLE',
    'FINAL_CONTRACT_READY',
    'FINAL_CONTRACT_SIGNATURE_CAPTURED',
    'FINAL_CONTRACT_VIDEO_CAPTURED',
    'PAYROLL_AUTH_CAPTURED',
    'CONTRACT_EVIDENCE_SUBMITTED',
    'CONTRACT_EVIDENCE_ACCEPTED',
    'BROKERAGE_REMUNERATION_PAYMENT_SUBMITTED',
    'BROKERAGE_REMUNERATION_PAYMENT_ACCEPTED',
    'LENDER_INTEREST_PAYMENT_ACCEPTED',
    'ALL_PRE_DISBURSEMENT_PAYMENTS_ACCEPTED',
    'READY_FOR_DISBURSEMENT',
    'DISBURSEMENT_STARTED',
    'DISBURSEMENT_FAILED',
    'DISBURSED',
    'PAYROLL_COLLECTION_SCHEDULED',
    'PAYROLL_COLLECTION_REPORTED',
    'PARTIALLY_COLLECTED_REPORTED',
    'NOT_COLLECTED_REPORTED',
    'LOAN_SETTLED',
    'DECISION_REJECTED',
    'BROKER_CASE_CLOSED',
    'LENDER_CASE_CLOSED'
  )),
  from_status text,
  to_status text,
  actor_user_ref text NOT NULL,
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER', 'SYSTEM')),
  reason_code text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_workflow_id, event_id)
);

CREATE INDEX broker_workflow_events_workflow_at_idx
  ON broker_workflow_events(broker_workflow_id, occurred_at DESC);

ALTER TABLE applicant_payment_proofs
  ADD COLUMN workflow_version text NOT NULL DEFAULT 'LEGACY_V1'
    CHECK (workflow_version IN ('LEGACY_V1', 'SALARY_LOAN_V2')),
  ADD COLUMN proof_type text
    CHECK (proof_type IN (
      'BROKERAGE_REMUNERATION_PAYMENT_PROOF',
      'LENDER_INTEREST_PAYMENT_PROOF',
      'EXCEPTIONAL_PRINCIPAL_PAYMENT_PROOF'
    ));

CREATE TABLE payment_proof_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id uuid NOT NULL REFERENCES applicant_payment_proofs(id),
  proof_ref text NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN (
    'BROKERAGE_REMUNERATION_PAYMENT_PROOF',
    'LENDER_INTEREST_PAYMENT_PROOF',
    'EXCEPTIONAL_PRINCIPAL_PAYMENT_PROOF'
  )),
  payee_domain text NOT NULL CHECK (payee_domain IN ('BROKER', 'LENDER')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  review_status text NOT NULL CHECK (review_status IN (
    'PENDING',
    'REVIEWING',
    'ACCEPTED',
    'REJECTED'
  )),
  external_event_ref text,
  accepted_by_domain text CHECK (accepted_by_domain IN ('BROKER', 'LENDER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proof_id, payment_type)
);

CREATE INDEX payment_proof_allocations_proof_idx
  ON payment_proof_allocations(proof_id, payment_type);

CREATE TABLE product_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE,
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  min_principal_amount_minor bigint NOT NULL CHECK (min_principal_amount_minor >= 1000),
  max_principal_amount_minor bigint NOT NULL CHECK (max_principal_amount_minor <= 50000),
  allowed_tenor_days integer[] NOT NULL CHECK (allowed_tenor_days = ARRAY[15, 30]),
  rounding_mode text NOT NULL CHECK (rounding_mode IN ('HALF_EVEN', 'HALF_UP', 'DOWN')),
  published_by_user_ref text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE TABLE fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_rule_id uuid NOT NULL REFERENCES product_rules(id),
  fee_rule_code text NOT NULL UNIQUE,
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  fee_type text NOT NULL CHECK (fee_type IN (
    'FINANCING_BROKERAGE_REMUNERATION',
    'LENDER_INTEREST'
  )),
  monthly_rate_bps integer NOT NULL CHECK (monthly_rate_bps BETWEEN 0 AND 10000),
  payment_timing text NOT NULL CHECK (payment_timing = 'PRE_DISBURSEMENT'),
  payee_domain text NOT NULL CHECK (payee_domain IN ('BROKER', 'LENDER')),
  published_by_user_ref text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE TABLE contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code text NOT NULL,
  contract_type text NOT NULL CHECK (contract_type IN (
    'BROKER_SERVICE_AGREEMENT',
    'LENDER_FINAL_CONTRACT',
    'PAYROLL_DEDUCTION_AUTHORIZATION',
    'CONFIRMATION_VIDEO_SCRIPT'
  )),
  owning_domain text NOT NULL CHECK (owning_domain IN ('BROKER', 'LENDER')),
  language text NOT NULL CHECK (language IN ('km', 'en', 'zh-CN')),
  version_label text NOT NULL,
  document_hash text NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz NOT NULL,
  created_by_user_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_code, language, version_label)
);

CREATE TABLE employer_payroll_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_tenant_id uuid NOT NULL REFERENCES employer_tenants(id),
  rule_code text NOT NULL UNIQUE,
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  collection_currency char(3) NOT NULL CHECK (collection_currency = 'USD'),
  collection_day_of_month integer NOT NULL CHECK (collection_day_of_month BETWEEN 1 AND 31),
  collection_type text NOT NULL CHECK (collection_type = 'PRINCIPAL_ONLY'),
  partial_collection_allowed boolean NOT NULL DEFAULT true,
  published_by_user_ref text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE TABLE contract_evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  event_type text NOT NULL CHECK (event_type IN (
    'FINAL_CONTRACT_SIGNATURE_CAPTURED',
    'FINAL_CONTRACT_VIDEO_CAPTURED',
    'PAYROLL_AUTH_CAPTURED',
    'CONTRACT_EVIDENCE_SUBMITTED',
    'CONTRACT_EVIDENCE_ACCEPTED'
  )),
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER')),
  actor_user_ref text NOT NULL,
  external_event_id text,
  evidence_reference text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contract_evidence_events_application_at_idx
  ON contract_evidence_events(application_id, occurred_at DESC);

CREATE TABLE pre_disbursement_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  proof_id uuid REFERENCES applicant_payment_proofs(id),
  payment_type text NOT NULL CHECK (payment_type IN (
    'BROKERAGE_REMUNERATION_PAYMENT_PROOF',
    'LENDER_INTEREST_PAYMENT_PROOF'
  )),
  event_type text NOT NULL CHECK (event_type IN (
    'PAYMENT_SUBMITTED',
    'PAYMENT_ACCEPTED',
    'PAYMENT_REJECTED'
  )),
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER')),
  actor_user_ref text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pre_disbursement_payment_events_application_at_idx
  ON pre_disbursement_payment_events(application_id, occurred_at DESC);

CREATE TABLE payroll_collection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
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

CREATE INDEX payroll_collection_events_application_at_idx
  ON payroll_collection_events(application_id, occurred_at DESC);

CREATE TRIGGER broker_workflow_events_append_only
  BEFORE UPDATE OR DELETE ON broker_workflow_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER contract_evidence_events_append_only
  BEFORE UPDATE OR DELETE ON contract_evidence_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER pre_disbursement_payment_events_append_only
  BEFORE UPDATE OR DELETE ON pre_disbursement_payment_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TRIGGER payroll_collection_events_append_only
  BEFORE UPDATE OR DELETE ON payroll_collection_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
