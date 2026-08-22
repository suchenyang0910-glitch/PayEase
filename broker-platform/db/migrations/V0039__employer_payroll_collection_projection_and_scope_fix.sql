-- Day 2 P0 fix: V2 collection scope must cover principal + lender interest,
-- while employer-finance execution must read a broker-local projection instead
-- of writing lender payroll states into applications.status.

ALTER TABLE application_repayment_preferences
  DROP CONSTRAINT IF EXISTS application_repayment_preferences_collection_mode_check;

UPDATE application_repayment_preferences
SET
  collection_mode = 'PRINCIPAL_AND_INTEREST',
  updated_at = now()
WHERE workflow_version = 'SALARY_LOAN_V2';

ALTER TABLE application_repayment_preferences
  ADD CONSTRAINT application_repayment_preferences_collection_mode_check
    CHECK (collection_mode = 'PRINCIPAL_AND_INTEREST');

ALTER TABLE employer_payroll_rules
  DROP CONSTRAINT IF EXISTS employer_payroll_rules_collection_type_check;

UPDATE employer_payroll_rules
SET
  collection_type = 'PRINCIPAL_AND_INTEREST'
WHERE workflow_version = 'SALARY_LOAN_V2';

ALTER TABLE employer_payroll_rules
  ADD CONSTRAINT employer_payroll_rules_collection_type_check
    CHECK (collection_type = 'PRINCIPAL_AND_INTEREST');

CREATE TABLE employer_payroll_collection_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  employer_tenant_id uuid NOT NULL REFERENCES employer_tenants(id),
  repayment_installment_no integer NOT NULL CHECK (repayment_installment_no BETWEEN 1 AND 2),
  selected_repayment_method text NOT NULL CHECK (
    selected_repayment_method = 'EMPLOYER_PAYROLL_DEDUCTION'
  ),
  collection_scope text NOT NULL CHECK (
    collection_scope = 'PRINCIPAL_AND_INTEREST'
  ),
  projection_status text NOT NULL DEFAULT 'SCHEDULED' CHECK (
    projection_status IN (
      'SCHEDULED',
      'PAYROLL_COLLECTION_PENDING',
      'COLLECTION_RECONCILIATION_PENDING',
      'RECONCILED',
      'COLLECTION_EXCEPTION'
    )
  ),
  scheduled_due_date date NOT NULL,
  scheduled_amount_minor bigint NOT NULL CHECK (scheduled_amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  lender_event_ref text NOT NULL,
  payroll_schedule_snapshot jsonb NOT NULL,
  reported_event_ref text,
  reported_by_user_ref text,
  reported_reason_code text,
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, repayment_installment_no)
);

CREATE INDEX employer_payroll_collection_instructions_queue_idx
  ON employer_payroll_collection_instructions(
    employer_tenant_id,
    projection_status,
    scheduled_due_date,
    repayment_installment_no
  );
