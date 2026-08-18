-- Applicant manual repayment proof uploads and reassessment requests. The
-- browser submits to controlled local endpoints; real external storage or
-- connectors remain environment-gated and are not hard-coded here.

ALTER TABLE manual_action_idempotency
  DROP CONSTRAINT manual_action_idempotency_action_name_check;

ALTER TABLE manual_action_idempotency
  ADD CONSTRAINT manual_action_idempotency_action_name_check CHECK (action_name IN (
    'BROKER_REVIEW', 'EMPLOYER_IDENTITY_MATCH', 'EMPLOYER_VERIFICATION',
    'EMPLOYER_FINANCE_VERIFICATION', 'LENDER_INITIAL_REVIEW',
    'LENDER_FINAL_REVIEW', 'DISBURSEMENT_RELEASE',
    'DISBURSEMENT_CONFIRMATION', 'REPAYMENT_WRITE_OFF',
    'REPAYMENT_CONFIRMATION', 'APPLICANT_PAYMENT_PROOF_UPLOAD',
    'APPLICANT_REASSESSMENT_REQUEST'
  ));

CREATE TABLE applicant_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_no text NOT NULL UNIQUE CHECK (proof_no ~ '^PRF-[0-9]{8}-[A-Z0-9]{8}$'),
  application_id uuid NOT NULL REFERENCES applications(id),
  user_id uuid NOT NULL REFERENCES users(id),
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 160),
  content_type text NOT NULL CHECK (content_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
  )),
  file_size_bytes integer NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 2097152),
  file_content_encrypted bytea NOT NULL,
  file_key_version text NOT NULL,
  transfer_reference text,
  status text NOT NULL DEFAULT 'UNDER_REVIEW' CHECK (status IN (
    'UNDER_REVIEW', 'NEEDS_MORE', 'RECONCILED', 'EXCEPTION'
  )),
  review_reason_code text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX applicant_payment_proofs_application_submitted_idx
  ON applicant_payment_proofs(application_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION enforce_applicant_payment_proof_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proof_no <> OLD.proof_no OR NEW.application_id <> OLD.application_id
     OR NEW.user_id <> OLD.user_id OR NEW.file_name <> OLD.file_name
     OR NEW.content_type <> OLD.content_type
     OR NEW.file_size_bytes <> OLD.file_size_bytes
     OR NEW.file_content_encrypted <> OLD.file_content_encrypted
     OR NEW.file_key_version <> OLD.file_key_version
     OR COALESCE(NEW.transfer_reference, '') <> COALESCE(OLD.transfer_reference, '') THEN
    RAISE EXCEPTION 'applicant payment proof immutable fields cannot be changed';
  END IF;
  IF NOT (
    (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('UNDER_REVIEW', 'NEEDS_MORE', 'RECONCILED', 'EXCEPTION')) OR
    (OLD.status = 'NEEDS_MORE' AND NEW.status = 'NEEDS_MORE') OR
    (OLD.status = 'RECONCILED' AND NEW.status = 'RECONCILED') OR
    (OLD.status = 'EXCEPTION' AND NEW.status = 'EXCEPTION')
  ) THEN
    RAISE EXCEPTION 'invalid applicant payment proof transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status IN ('RECONCILED', 'EXCEPTION') AND NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'reviewed_at is required once payment proof review is complete';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER applicant_payment_proofs_state_guard
  BEFORE UPDATE ON applicant_payment_proofs
  FOR EACH ROW EXECUTE FUNCTION enforce_applicant_payment_proof_state();

CREATE TABLE applicant_reassessment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no text NOT NULL UNIQUE CHECK (request_no ~ '^REA-[0-9]{8}-[A-Z0-9]{8}$'),
  application_id uuid NOT NULL REFERENCES applications(id),
  user_id uuid NOT NULL REFERENCES users(id),
  address_changed boolean NOT NULL DEFAULT false,
  employer_updated boolean NOT NULL DEFAULT false,
  wealth_proof_declared boolean NOT NULL DEFAULT false,
  note_encrypted bytea,
  note_key_version text,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
    'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CLOSED'
  )),
  decision_reason_code text,
  reviewed_by_user_ref text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicant_reassessment_requests_note_pair_check CHECK (
    (note_encrypted IS NULL AND note_key_version IS NULL)
    OR (note_encrypted IS NOT NULL AND note_key_version IS NOT NULL)
  )
);

CREATE INDEX applicant_reassessment_requests_application_created_idx
  ON applicant_reassessment_requests(application_id, created_at DESC);

CREATE UNIQUE INDEX applicant_reassessment_requests_open_once_idx
  ON applicant_reassessment_requests(application_id)
  WHERE status IN ('SUBMITTED', 'UNDER_REVIEW');

CREATE OR REPLACE FUNCTION enforce_applicant_reassessment_request_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_no <> OLD.request_no OR NEW.application_id <> OLD.application_id
     OR NEW.user_id <> OLD.user_id OR NEW.address_changed <> OLD.address_changed
     OR NEW.employer_updated <> OLD.employer_updated
     OR NEW.wealth_proof_declared <> OLD.wealth_proof_declared
     OR COALESCE(NEW.note_encrypted, '\x'::bytea) <> COALESCE(OLD.note_encrypted, '\x'::bytea)
     OR COALESCE(NEW.note_key_version, '') <> COALESCE(OLD.note_key_version, '') THEN
    RAISE EXCEPTION 'applicant reassessment immutable fields cannot be changed';
  END IF;
  IF NOT (
    (OLD.status = 'SUBMITTED' AND NEW.status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CLOSED')) OR
    (OLD.status = 'UNDER_REVIEW' AND NEW.status IN ('UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CLOSED')) OR
    (OLD.status = 'APPROVED' AND NEW.status = 'APPROVED') OR
    (OLD.status = 'DECLINED' AND NEW.status = 'DECLINED') OR
    (OLD.status = 'CLOSED' AND NEW.status = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'invalid applicant reassessment transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status IN ('APPROVED', 'DECLINED', 'CLOSED')
     AND (NEW.reviewed_at IS NULL OR NEW.reviewed_by_user_ref IS NULL) THEN
    RAISE EXCEPTION 'review metadata is required once reassessment review is complete';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER applicant_reassessment_requests_state_guard
  BEFORE UPDATE ON applicant_reassessment_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_applicant_reassessment_request_state();
