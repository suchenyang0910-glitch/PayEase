-- Manual financial actions may be retried after an operator loses the HTTP
-- response. Keep the authoritative result inside the same transaction as the
-- ledger-changing action, so a retry can never be mistaken for the next
-- disbursement or repayment installment.
CREATE TABLE manual_action_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  action_name text NOT NULL CHECK (action_name IN (
    'DISBURSEMENT_RELEASE', 'DISBURSEMENT_CONFIRMATION',
    'REPAYMENT_WRITE_OFF', 'REPAYMENT_CONFIRMATION'
  )),
  actor_user_ref text NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, action_name, actor_user_ref, idempotency_key)
);

CREATE INDEX manual_action_idempotency_application_action_idx
  ON manual_action_idempotency(application_id, action_name, completed_at DESC);

CREATE TRIGGER manual_action_idempotency_append_only
  BEFORE UPDATE OR DELETE ON manual_action_idempotency
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
