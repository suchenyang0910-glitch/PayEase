-- User confirmation is distinct from the lender's subsequent contract record.
-- It is a Telegram-session confirmation record, not a legal conclusion about
-- electronic-signature enforceability.
ALTER TABLE applications DROP CONSTRAINT applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check CHECK (status IN (
  'DRAFT', 'SUBMITTED', 'BROKER_REVIEW', 'EMPLOYER_VERIFICATION',
  'EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW', 'LENDER_FINAL_REVIEW',
  'CONTRACT_PENDING', 'USER_CONTRACT_CONFIRMED', 'CONTRACT_CONFIRMED',
  'DISBURSEMENT_PENDING', 'DISBURSED', 'REPAYMENT_ACTIVE', 'SETTLED',
  'REJECTED', 'CLOSED'
));
