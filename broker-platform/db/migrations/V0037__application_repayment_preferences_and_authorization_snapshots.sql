ALTER TABLE applications
  ALTER COLUMN workflow_version SET DEFAULT 'SALARY_LOAN_V2';

CREATE TABLE application_repayment_preferences (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  selected_repayment_method text NOT NULL CHECK (
    selected_repayment_method IN (
      'EMPLOYER_PAYROLL_DEDUCTION',
      'USER_DIRECT_DEBIT',
      'USER_MANUAL_PAYMENT'
    )
  ),
  available_repayment_methods text[] NOT NULL CHECK (
    array_length(available_repayment_methods, 1) BETWEEN 1 AND 3
  ),
  employer_payroll_rule_version text,
  collection_mode text NOT NULL CHECK (collection_mode = 'PRINCIPAL_ONLY'),
  collection_payee_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE application_authorization_snapshots (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  employer_verification_authorized boolean NOT NULL,
  service_agreement_authorized boolean NOT NULL,
  post_disbursement_brokerage_authorized boolean NOT NULL,
  payroll_deduction_authorized boolean NOT NULL DEFAULT false,
  direct_debit_authorized boolean NOT NULL DEFAULT false,
  employer_verification_authorization_ref text NOT NULL,
  service_agreement_authorization_ref text NOT NULL,
  post_disbursement_brokerage_authorization_ref text NOT NULL,
  payroll_deduction_authorization_ref text,
  direct_debit_authorization_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT (
      payroll_deduction_authorized = true
      AND direct_debit_authorized = true
    )
  )
);

CREATE INDEX application_repayment_preferences_method_idx
  ON application_repayment_preferences(selected_repayment_method, updated_at DESC);
