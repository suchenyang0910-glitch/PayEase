ALTER TABLE applicant_payment_proofs
  ADD COLUMN reviewed_by_user_ref text;

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

ALTER TABLE approval_cases
  DROP CONSTRAINT approval_cases_aggregate_type_check;

ALTER TABLE approval_cases
  ADD CONSTRAINT approval_cases_aggregate_type_check CHECK (aggregate_type IN (
    'APPLICATION',
    'DISBURSEMENT',
    'WRITE_OFF',
    'COMPLAINT',
    'CONTRACT_TEMPLATE',
    'PRODUCT_RULE',
    'REASSESSMENT_REQUEST'
  ));

ALTER TABLE approval_cases
  DROP CONSTRAINT approval_cases_workflow_definition_code_check;

ALTER TABLE approval_cases
  ADD CONSTRAINT approval_cases_workflow_definition_code_check CHECK (workflow_definition_code IN (
    'SALARY_LOAN_APPLICATION_V1',
    'DISBURSEMENT_APPROVAL_V1',
    'WRITE_OFF_APPROVAL_V1',
    'COMPLAINT_FINAL_REVIEW_V1',
    'REASSESSMENT_REVIEW_V1'
  ));

ALTER TABLE applicant_reassessment_requests
  ADD COLUMN approval_case_id uuid REFERENCES approval_cases(id);

CREATE UNIQUE INDEX applicant_reassessment_requests_approval_case_idx
  ON applicant_reassessment_requests(approval_case_id)
  WHERE approval_case_id IS NOT NULL;
