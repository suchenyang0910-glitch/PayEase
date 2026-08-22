CREATE TABLE domain_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^[-_A-Za-z0-9:.]{8,80}$'),
  event_type text NOT NULL CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED',
      'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED',
      'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED',
      'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED',
      'COLLECTION_ACCEPTED',
      'COLLECTION_EXCEPTION'
    )
  ),
  event_version text NOT NULL DEFAULT 'v1' CHECK (event_version = 'v1'),
  source_domain text NOT NULL CHECK (source_domain = 'BROKER'),
  target_domain text NOT NULL CHECK (target_domain = 'LENDER'),
  external_application_ref text NOT NULL CHECK (length(external_application_ref) BETWEEN 3 AND 128),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[-_A-Za-z0-9:.]{8,128}$'),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  signature_algorithm text NOT NULL DEFAULT 'HMAC-SHA256' CHECK (signature_algorithm = 'HMAC-SHA256'),
  signature_key_id text NOT NULL CHECK (length(signature_key_id) BETWEEN 3 AND 64),
  delivery_status text NOT NULL DEFAULT 'PENDING' CHECK (
    delivery_status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER')
  ),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count >= 0),
  last_error_code text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX domain_event_outbox_delivery_idx
  ON domain_event_outbox(delivery_status, next_attempt_at NULLS FIRST, created_at ASC);

CREATE TABLE domain_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^[-_A-Za-z0-9:.]{8,80}$'),
  event_type text NOT NULL CHECK (
    event_type IN (
      'APPLICATION_PACKAGE_SUBMITTED',
      'LENDER_APPLICATION_RECEIVED',
      'LENDER_MORE_INFO_REQUIRED',
      'LENDER_DECISION_AVAILABLE',
      'CONTRACT_EVIDENCE_SUBMITTED',
      'EMPLOYER_DEDUCTION_REPORTED',
      'DISBURSEMENT_CONFIRMED',
      'COLLECTION_ACCEPTED',
      'COLLECTION_EXCEPTION'
    )
  ),
  event_version text NOT NULL DEFAULT 'v1' CHECK (event_version = 'v1'),
  source_domain text NOT NULL CHECK (source_domain = 'LENDER'),
  target_domain text NOT NULL CHECK (target_domain = 'BROKER'),
  external_application_ref text NOT NULL CHECK (length(external_application_ref) BETWEEN 3 AND 128),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[-_A-Za-z0-9:.]{8,128}$'),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  signature_algorithm text NOT NULL CHECK (signature_algorithm = 'HMAC-SHA256'),
  signature_key_id text NOT NULL CHECK (length(signature_key_id) BETWEEN 3 AND 64),
  transport_timestamp_millis bigint NOT NULL CHECK (transport_timestamp_millis > 0),
  transport_nonce text NOT NULL CHECK (length(transport_nonce) BETWEEN 12 AND 128),
  processing_status text NOT NULL DEFAULT 'RECEIVED' CHECK (
    processing_status IN ('RECEIVED', 'PROCESSED', 'DEAD_LETTER')
  ),
  processing_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  raw_headers jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX domain_event_inbox_processing_idx
  ON domain_event_inbox(processing_status, received_at ASC);

CREATE TABLE domain_event_nonce_guards (
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER')),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 12 AND 128),
  event_id text NOT NULL CHECK (event_id ~ '^[-_A-Za-z0-9:.]{8,80}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (source_domain, nonce)
);

CREATE INDEX domain_event_nonce_guards_expiry_idx
  ON domain_event_nonce_guards(expires_at ASC);

CREATE TABLE domain_event_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL CHECK (event_id ~ '^[-_A-Za-z0-9:.]{8,80}$'),
  event_type text NOT NULL,
  source_domain text NOT NULL CHECK (source_domain IN ('BROKER', 'LENDER')),
  target_domain text NOT NULL CHECK (target_domain IN ('BROKER', 'LENDER')),
  external_application_ref text NOT NULL,
  failure_stage text NOT NULL CHECK (
    failure_stage IN ('VALIDATION', 'AUTHENTICATION', 'ORDERING', 'PROCESSING')
  ),
  failure_code text NOT NULL CHECK (length(failure_code) BETWEEN 3 AND 96),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX domain_event_dead_letters_created_idx
  ON domain_event_dead_letters(created_at DESC);
