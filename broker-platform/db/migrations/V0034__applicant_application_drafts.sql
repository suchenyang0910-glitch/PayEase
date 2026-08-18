CREATE TABLE applicant_application_drafts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  draft_version smallint NOT NULL CHECK (draft_version = 1),
  stage text NOT NULL CHECK (stage IN ('welcome', 'details')),
  form_step text NOT NULL CHECK (form_step IN (
    'profile', 'contacts', 'payout', 'supplements', 'confirm'
  )),
  draft_payload_encrypted bytea NOT NULL,
  draft_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX applicant_application_drafts_updated_idx
  ON applicant_application_drafts(updated_at DESC);
