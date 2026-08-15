-- HR confirms the employee against the factory's own personnel records. The
-- application stores only the outcome; the encrypted document and its HMAC
-- lookup value remain unavailable to the employer portal and audit views.
ALTER TABLE applications
  ADD COLUMN employment_identity_match_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN employment_identity_matched_at timestamptz,
  ADD COLUMN employment_identity_matched_by text,
  ADD CONSTRAINT applications_employment_identity_match_status_check CHECK (
    employment_identity_match_status IN ('PENDING', 'MATCHED', 'NOT_MATCHED')
  ),
  ADD CONSTRAINT applications_employment_identity_match_audit_check CHECK (
    (employment_identity_match_status = 'PENDING'
      AND employment_identity_matched_at IS NULL
      AND employment_identity_matched_by IS NULL)
    OR (employment_identity_match_status IN ('MATCHED', 'NOT_MATCHED')
      AND employment_identity_matched_at IS NOT NULL
      AND employment_identity_matched_by IS NOT NULL)
  );

ALTER TABLE manual_action_idempotency
  DROP CONSTRAINT manual_action_idempotency_action_name_check;

ALTER TABLE manual_action_idempotency
  ADD CONSTRAINT manual_action_idempotency_action_name_check CHECK (action_name IN (
    'BROKER_REVIEW', 'EMPLOYER_IDENTITY_MATCH', 'EMPLOYER_VERIFICATION',
    'EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW',
    'LENDER_FINAL_REVIEW', 'DISBURSEMENT_RELEASE',
    'DISBURSEMENT_CONFIRMATION', 'REPAYMENT_WRITE_OFF',
    'REPAYMENT_CONFIRMATION'
  ));
