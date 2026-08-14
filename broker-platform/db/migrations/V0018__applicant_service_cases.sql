-- Applicant support and complaint intake.  Narrative text is encrypted by the
-- API before persistence; the broker database never stores a plaintext copy.
-- A broker may acknowledge and refer a complaint, while the licensed lender
-- retains final resolution responsibility.
CREATE TABLE applicant_service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no text NOT NULL UNIQUE CHECK (case_no ~ '^CASE-[0-9]{8}-[A-Z0-9]{8}$'),
  application_id uuid NOT NULL REFERENCES applications(id),
  user_id uuid NOT NULL REFERENCES users(id),
  case_type text NOT NULL CHECK (case_type IN ('SERVICE_QUERY', 'COMPLAINT')),
  status text NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'REFERRED_TO_LENDER', 'RESOLVED')) DEFAULT 'OPEN',
  message_encrypted bytea NOT NULL,
  message_key_version text NOT NULL,
  applicant_language text NOT NULL CHECK (applicant_language IN ('km', 'en', 'zh-CN')),
  referred_to_lender_at timestamptz,
  lender_resolution_reason_code text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX applicant_service_cases_application_created_idx
  ON applicant_service_cases(application_id, created_at DESC);
CREATE INDEX applicant_service_cases_open_queue_idx
  ON applicant_service_cases(status, created_at ASC)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'REFERRED_TO_LENDER');

CREATE OR REPLACE FUNCTION enforce_applicant_service_case_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.application_id <> OLD.application_id OR NEW.user_id <> OLD.user_id
     OR NEW.case_type <> OLD.case_type OR NEW.message_encrypted <> OLD.message_encrypted
     OR NEW.message_key_version <> OLD.message_key_version OR NEW.applicant_language <> OLD.applicant_language THEN
    RAISE EXCEPTION 'applicant service case immutable fields cannot be changed';
  END IF;
  IF NOT (
    (OLD.status = 'OPEN' AND NEW.status IN ('OPEN', 'ACKNOWLEDGED', 'REFERRED_TO_LENDER')) OR
    (OLD.status = 'ACKNOWLEDGED' AND NEW.status IN ('ACKNOWLEDGED', 'REFERRED_TO_LENDER')) OR
    (OLD.status = 'REFERRED_TO_LENDER' AND NEW.status IN ('REFERRED_TO_LENDER', 'RESOLVED')) OR
    (OLD.status = 'RESOLVED' AND NEW.status = 'RESOLVED')
  ) THEN
    RAISE EXCEPTION 'invalid applicant service case transition: % -> %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'REFERRED_TO_LENDER' AND NEW.referred_to_lender_at IS NULL THEN
    RAISE EXCEPTION 'lender referral timestamp is required';
  END IF;
  IF NEW.status = 'RESOLVED' AND (NEW.resolved_at IS NULL OR NEW.lender_resolution_reason_code IS NULL) THEN
    RAISE EXCEPTION 'lender resolution metadata is required';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER applicant_service_cases_state_guard
  BEFORE UPDATE ON applicant_service_cases
  FOR EACH ROW EXECUTE FUNCTION enforce_applicant_service_case_state();
