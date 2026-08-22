ALTER TABLE manual_action_idempotency
  DROP CONSTRAINT manual_action_idempotency_action_name_check;

ALTER TABLE manual_action_idempotency
  ADD CONSTRAINT manual_action_idempotency_action_name_check CHECK (action_name IN (
    'BROKER_REVIEW', 'EMPLOYER_IDENTITY_MATCH', 'EMPLOYER_VERIFICATION',
    'EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW',
    'LENDER_FINAL_REVIEW', 'DISBURSEMENT_RELEASE',
    'DISBURSEMENT_CONFIRMATION', 'REPAYMENT_WRITE_OFF',
    'REPAYMENT_CONFIRMATION', 'APPLICANT_PAYMENT_PROOF_UPLOAD',
    'APPLICANT_REASSESSMENT_REQUEST', 'APPLICANT_PAYMENT_PROOF_REVIEW',
    'REASSESSMENT_BROKER_REVIEW', 'REASSESSMENT_LENDER_REVIEW'
  ));

CREATE TABLE lender_collection_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  repayment_installment_no integer NOT NULL CHECK (
    repayment_installment_no BETWEEN 1 AND 2
  ),
  selected_repayment_method text NOT NULL CHECK (
    selected_repayment_method IN (
      'EMPLOYER_PAYROLL_DEDUCTION',
      'USER_DIRECT_DEBIT',
      'USER_MANUAL_PAYMENT'
    )
  ),
  source_type text NOT NULL CHECK (
    source_type IN (
      'EMPLOYER_PAYROLL_REPORT',
      'USER_DIRECT_DEBIT_REPORT',
      'USER_MANUAL_PAYMENT_PROOF',
      'REFUND_REVERSAL'
    )
  ),
  source_reference text NOT NULL,
  source_domain text NOT NULL CHECK (source_domain = 'BROKER'),
  collection_result text NOT NULL CHECK (
    collection_result IN (
      'COLLECTED',
      'PARTIALLY_COLLECTED',
      'NOT_COLLECTED',
      'DIRECT_DEBIT_FAILED',
      'AUTHORIZATION_EXPIRED',
      'REFUND_REVERSED'
    )
  ),
  reported_amount_minor bigint NOT NULL CHECK (reported_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  work_item_status text NOT NULL DEFAULT 'OPEN' CHECK (
    work_item_status IN ('OPEN', 'PROCESSING', 'CONFIRMED', 'EXCEPTION')
  ),
  exception_code text,
  evidence_reference text NOT NULL,
  assigned_to_user_ref text,
  confirmed_by_user_ref text,
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, source_type, source_reference),
  CONSTRAINT lender_collection_work_items_exception_check CHECK (
    (
      work_item_status = 'EXCEPTION'
      AND exception_code IN (
        'PARTIALLY_COLLECTED',
        'NOT_COLLECTED',
        'DIRECT_DEBIT_FAILED',
        'AUTHORIZATION_EXPIRED',
        'REFUND_REVERSED'
      )
    )
    OR (
      work_item_status IN ('OPEN', 'PROCESSING', 'CONFIRMED')
      AND exception_code IS NULL
    )
  )
);

CREATE INDEX lender_collection_work_items_status_created_idx
  ON lender_collection_work_items(work_item_status, created_at ASC);

CREATE INDEX lender_collection_work_items_application_installment_idx
  ON lender_collection_work_items(application_id, repayment_installment_no, created_at DESC);

CREATE TABLE lender_collection_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES lender_collection_work_items(id),
  application_id uuid NOT NULL REFERENCES applications(id),
  workflow_version text NOT NULL CHECK (workflow_version = 'SALARY_LOAN_V2'),
  repayment_installment_no integer NOT NULL CHECK (
    repayment_installment_no BETWEEN 1 AND 2
  ),
  selected_repayment_method text NOT NULL CHECK (
    selected_repayment_method IN (
      'EMPLOYER_PAYROLL_DEDUCTION',
      'USER_DIRECT_DEBIT',
      'USER_MANUAL_PAYMENT'
    )
  ),
  exception_type text NOT NULL CHECK (
    exception_type IN (
      'PARTIALLY_COLLECTED',
      'NOT_COLLECTED',
      'DIRECT_DEBIT_FAILED',
      'AUTHORIZATION_EXPIRED',
      'REFUND_REVERSED'
    )
  ),
  reason_code text NOT NULL,
  evidence_reference text NOT NULL,
  reported_amount_minor bigint NOT NULL CHECK (reported_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'RESOLVED', 'CLOSED')
  ),
  assigned_to_user_ref text,
  resolved_by_user_ref text,
  resolution_reason_code text,
  resolution_evidence_reference text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_item_id, exception_type),
  CONSTRAINT lender_collection_exceptions_resolution_check CHECK (
    (
      status = 'OPEN'
      AND resolved_by_user_ref IS NULL
      AND resolution_reason_code IS NULL
      AND resolution_evidence_reference IS NULL
      AND resolved_at IS NULL
    )
    OR (
      status IN ('RESOLVED', 'CLOSED')
      AND resolved_by_user_ref IS NOT NULL
      AND resolution_reason_code IS NOT NULL
      AND resolution_evidence_reference IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE INDEX lender_collection_exceptions_status_created_idx
  ON lender_collection_exceptions(status, created_at ASC);
