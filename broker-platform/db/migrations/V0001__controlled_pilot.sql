-- PayEase Broker V1 controlled-pilot schema.
-- PostgreSQL 16+. Run only against a local/staging broker database.
-- No cross-domain database references or production credentials are included.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_ref text UNIQUE,
  preferred_language text NOT NULL CHECK (preferred_language IN ('km', 'en', 'zh-CN')),
  phone_encrypted bytea,
  phone_consent_version text,
  phone_consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  employer_external_ref text,
  lender_external_ref text,
  requested_amount_minor bigint NOT NULL CHECK (requested_amount_minor BETWEEN 1000 AND 50000),
  currency char(3) NOT NULL CHECK (currency = 'USD'),
  tenor_days integer NOT NULL CHECK (tenor_days BETWEEN 7 AND 180),
  status text NOT NULL CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'BROKER_REVIEW', 'EMPLOYER_VERIFICATION',
    'LENDER_INITIAL_REVIEW', 'LENDER_FINAL_REVIEW', 'CONTRACT_PENDING',
    'CONTRACT_CONFIRMED', 'DISBURSEMENT_PENDING', 'DISBURSED',
    'REPAYMENT_ACTIVE', 'SETTLED', 'REJECTED', 'CLOSED'
  )),
  rejection_condition_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE application_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  from_status text,
  to_status text NOT NULL,
  actor_user_ref text NOT NULL,
  reason_code text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  stage text NOT NULL CHECK (stage IN (
    'BROKER_REVIEW', 'EMPLOYER_VERIFICATION', 'LENDER_INITIAL_REVIEW',
    'LENDER_FINAL_REVIEW', 'DISBURSEMENT_RELEASE', 'DISBURSEMENT_CONFIRMATION',
    'REPAYMENT_WRITE_OFF', 'REPAYMENT_CONFIRMATION'
  )),
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'RETURNED')),
  actor_user_ref text NOT NULL,
  actor_role text NOT NULL,
  reason_code text NOT NULL,
  internal_note_encrypted bytea,
  occurred_at timestamptz NOT NULL,
  UNIQUE (application_id, stage, actor_user_ref)
);

CREATE TABLE funds_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  evidence_type text NOT NULL CHECK (evidence_type IN ('DISBURSEMENT_RECEIPT', 'REPAYMENT_RECEIPT')),
  evidence_reference text NOT NULL,
  recorded_by_user_ref text NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (application_id, evidence_type, evidence_reference)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_user_ref text NOT NULL,
  payload_hash text NOT NULL,
  previous_event_hash text,
  event_hash text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX applications_status_created_at_idx ON applications(status, created_at DESC);
CREATE INDEX application_status_events_application_at_idx ON application_status_events(application_id, occurred_at);
CREATE INDEX approval_events_application_stage_idx ON approval_events(application_id, stage, occurred_at);
CREATE INDEX audit_events_entity_at_idx ON audit_events(entity_type, entity_id, occurred_at);

-- Append-only protection for event/audit tables. A migration role can be granted a
-- narrowly scoped exception outside this script for legally approved corrections.
CREATE OR REPLACE FUNCTION deny_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only event table: % operations are forbidden', TG_OP;
END;
$$;

CREATE TRIGGER application_status_events_append_only
  BEFORE UPDATE OR DELETE ON application_status_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
CREATE TRIGGER approval_events_append_only
  BEFORE UPDATE OR DELETE ON approval_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
CREATE TRIGGER funds_evidence_append_only
  BEFORE UPDATE OR DELETE ON funds_evidence
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
