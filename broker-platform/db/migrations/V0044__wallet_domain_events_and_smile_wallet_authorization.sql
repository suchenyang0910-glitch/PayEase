ALTER TABLE domain_event_outbox
  DROP CONSTRAINT domain_event_outbox_event_type_check;

ALTER TABLE domain_event_outbox
  ADD CONSTRAINT domain_event_outbox_event_type_check CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED',
      'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED',
      'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED',
      'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED',
      'WALLET_CREDIT_CONFIRMED',
      'COLLECTION_ACCEPTED',
      'COLLECTION_EXCEPTION'
    )
  );

ALTER TABLE domain_event_inbox
  DROP CONSTRAINT domain_event_inbox_event_type_check;

ALTER TABLE domain_event_inbox
  ADD CONSTRAINT domain_event_inbox_event_type_check CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED',
      'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED',
      'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED',
      'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED',
      'WALLET_CREDIT_CONFIRMED',
      'COLLECTION_ACCEPTED',
      'COLLECTION_EXCEPTION'
    )
  );

ALTER TABLE application_repayment_preferences
  DROP CONSTRAINT IF EXISTS application_repayment_preferences_selected_repayment_method_check;

ALTER TABLE application_repayment_preferences
  DROP CONSTRAINT IF EXISTS application_repayment_preferences_selected_repayment_method_che;

ALTER TABLE application_repayment_preferences
  DROP CONSTRAINT IF EXISTS application_repayment_preferenc_selected_repayment_method_check;

ALTER TABLE application_repayment_preferences
  ADD CONSTRAINT application_repayment_preference_method_check CHECK (
    selected_repayment_method IN (
      'SMILE_WALLET_AUTHORIZATION',
      'EMPLOYER_PAYROLL_DEDUCTION',
      'USER_DIRECT_DEBIT',
      'USER_MANUAL_PAYMENT'
    )
  );
