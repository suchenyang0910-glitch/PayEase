ALTER TABLE domain_event_outbox
  DROP CONSTRAINT domain_event_outbox_event_type_check;

ALTER TABLE domain_event_outbox
  ADD CONSTRAINT domain_event_outbox_event_type_check CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED', 'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED', 'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED', 'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED', 'WALLET_CREDIT_CONFIRMED',
      'WALLET_OPERATION_RESULT', 'COLLECTION_ACCEPTED', 'COLLECTION_EXCEPTION'
    )
  );

ALTER TABLE domain_event_inbox
  DROP CONSTRAINT domain_event_inbox_event_type_check;

ALTER TABLE domain_event_inbox
  ADD CONSTRAINT domain_event_inbox_event_type_check CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED', 'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED', 'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED', 'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED', 'WALLET_CREDIT_CONFIRMED',
      'WALLET_OPERATION_RESULT', 'COLLECTION_ACCEPTED', 'COLLECTION_EXCEPTION'
    )
  );

CREATE TABLE lender_wallet_operation_projection_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  order_ref text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('WITHDRAWAL', 'REPAYMENT')),
  operation_status text NOT NULL CHECK (
    operation_status IN ('AUTHORIZED', 'PROCESSING', 'SETTLED', 'FAILED')
  ),
  requested_amount_minor bigint NOT NULL CHECK (requested_amount_minor >= 0),
  settled_amount_minor bigint CHECK (settled_amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  last_callback_event_id text NOT NULL UNIQUE,
  last_projected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, order_ref)
);
