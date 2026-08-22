-- Day 2 follow-up: tenant-scoped repayment method rules and V2 quote storage.

ALTER TABLE employer_payroll_rules
  ADD COLUMN allowed_repayment_methods text[] NOT NULL DEFAULT ARRAY['USER_MANUAL_PAYMENT']::text[],
  ADD COLUMN default_repayment_method text NOT NULL DEFAULT 'USER_MANUAL_PAYMENT'
    CHECK (
      default_repayment_method IN (
        'EMPLOYER_PAYROLL_DEDUCTION',
        'USER_DIRECT_DEBIT',
        'USER_MANUAL_PAYMENT'
      )
    );

ALTER TABLE employer_payroll_rules
  ADD CONSTRAINT employer_payroll_rules_allowed_methods_check
    CHECK (
      array_length(allowed_repayment_methods, 1) BETWEEN 1 AND 3
      AND allowed_repayment_methods <@ ARRAY[
        'EMPLOYER_PAYROLL_DEDUCTION',
        'USER_DIRECT_DEBIT',
        'USER_MANUAL_PAYMENT'
      ]::text[]
      AND default_repayment_method = ANY(allowed_repayment_methods)
    );

CREATE TABLE application_v2_quote_snapshots (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  principal_amount_minor bigint NOT NULL CHECK (principal_amount_minor >= 1000),
  actual_disbursement_amount_minor bigint NOT NULL
    CHECK (actual_disbursement_amount_minor >= 1000),
  lender_interest_minor bigint NOT NULL CHECK (lender_interest_minor >= 0),
  total_repayment_amount_minor bigint NOT NULL
    CHECK (total_repayment_amount_minor >= principal_amount_minor),
  brokerage_remuneration_receivable_minor bigint NOT NULL
    CHECK (brokerage_remuneration_receivable_minor >= 0),
  product_rule_version text NOT NULL,
  brokerage_remuneration_rule_version text NOT NULL,
  lender_interest_rule_version text NOT NULL,
  repayment_grace_days integer NOT NULL DEFAULT 3 CHECK (repayment_grace_days >= 0),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 1 AND 2),
  first_due_date date NOT NULL,
  created_by_user_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_v2_quote_snapshots_due_date_idx
  ON application_v2_quote_snapshots(first_due_date, created_at DESC);

INSERT INTO employer_payroll_rules (
  employer_tenant_id,
  rule_code,
  workflow_version,
  collection_currency,
  collection_day_of_month,
  collection_type,
  partial_collection_allowed,
  allowed_repayment_methods,
  default_repayment_method,
  published_by_user_ref
)
SELECT
  tenant.id,
  'EMPLOYER-PAYROLL-V2-TEMP-PRELAUNCH',
  'SALARY_LOAN_V2',
  'USD',
  15,
  'PRINCIPAL_ONLY',
  true,
  ARRAY['EMPLOYER_PAYROLL_DEDUCTION', 'USER_MANUAL_PAYMENT']::text[],
  'USER_MANUAL_PAYMENT',
  'migration-V0038'
FROM employer_tenants AS tenant
WHERE tenant.external_ref = 'TEMP_PRELAUNCH_TEST_FACTORY'
ON CONFLICT (rule_code) DO UPDATE
SET
  allowed_repayment_methods = EXCLUDED.allowed_repayment_methods,
  default_repayment_method = EXCLUDED.default_repayment_method,
  retired_at = NULL;

CREATE OR REPLACE FUNCTION enforce_application_status_transition()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF (
    (OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED', 'CLOSED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('BROKER_REVIEW', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'BROKER_REVIEW' AND NEW.status IN ('EMPLOYER_VERIFICATION', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'EMPLOYER_VERIFICATION' AND NEW.status IN ('EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'EMPLOYER_FINANCE_VERIFICATION' AND NEW.status IN ('LENDER_INITIAL_REVIEW', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'LENDER_INITIAL_REVIEW' AND NEW.status IN ('LENDER_FINAL_REVIEW', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'LENDER_FINAL_REVIEW' AND NEW.status IN ('CONTRACT_PENDING', 'REJECTED', 'CLOSED'))
    OR (OLD.status = 'CONTRACT_PENDING' AND NEW.status IN ('USER_CONTRACT_CONFIRMED', 'CLOSED'))
    OR (OLD.status = 'USER_CONTRACT_CONFIRMED' AND NEW.status IN ('CONTRACT_CONFIRMED', 'CLOSED'))
    OR (OLD.status = 'CONTRACT_CONFIRMED' AND NEW.status IN ('DISBURSEMENT_PENDING', 'CLOSED'))
    OR (OLD.status = 'DISBURSEMENT_PENDING' AND NEW.status IN ('DISBURSED', 'CLOSED'))
    OR (OLD.status = 'DISBURSED' AND NEW.status IN ('REPAYMENT_ACTIVE', 'SETTLED', 'CLOSED'))
    OR (OLD.status = 'REPAYMENT_ACTIVE' AND NEW.status IN ('SETTLED', 'CLOSED'))
    OR (OLD.status IN ('REJECTED', 'SETTLED', 'CLOSED') AND NEW.status = OLD.status)
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid application status transition: % -> %', OLD.status, NEW.status;
END;
$$;
