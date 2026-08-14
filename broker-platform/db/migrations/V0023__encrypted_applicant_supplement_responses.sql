-- Text-only applicant responses to a broker's supplement request. The message
-- is encrypted by the API and never copied into audit payloads or logs.
CREATE TABLE applicant_supplement_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_no text NOT NULL UNIQUE CHECK (response_no ~ '^SUP-[0-9]{8}-[A-Z0-9]{8}$'),
  application_id uuid NOT NULL REFERENCES applications(id),
  user_id uuid NOT NULL REFERENCES users(id),
  message_encrypted bytea NOT NULL,
  message_key_version text NOT NULL,
  applicant_language text NOT NULL CHECK (applicant_language IN ('km', 'en', 'zh-CN')),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX applicant_supplement_responses_application_submitted_idx
  ON applicant_supplement_responses(application_id, submitted_at DESC);

REVOKE UPDATE, DELETE ON applicant_supplement_responses FROM PUBLIC;
