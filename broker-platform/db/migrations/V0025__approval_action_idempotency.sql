-- A broker, employer verifier, or credit reviewer can lose the HTTP response
-- after their decision has committed. Treat retries as the original decision
-- rather than presenting a misleading state-conflict to the operator.
ALTER TABLE manual_action_idempotency
  DROP CONSTRAINT manual_action_idempotency_action_name_check;

ALTER TABLE manual_action_idempotency
  ADD CONSTRAINT manual_action_idempotency_action_name_check CHECK (action_name IN (
    'BROKER_REVIEW', 'EMPLOYER_VERIFICATION',
    'EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW',
    'LENDER_FINAL_REVIEW', 'DISBURSEMENT_RELEASE',
    'DISBURSEMENT_CONFIRMATION', 'REPAYMENT_WRITE_OFF',
    'REPAYMENT_CONFIRMATION'
  ));
