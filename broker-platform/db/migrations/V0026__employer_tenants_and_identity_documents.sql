-- Each factory is an isolated employer tenant. No employer account can see an
-- application until an OPS administrator has explicitly linked that account
-- to the factory and a broker has assigned the application to that tenant.
CREATE TABLE employer_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref text NOT NULL UNIQUE CHECK (external_ref ~ '^[A-Z0-9_-]{3,64}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employer_tenant_members (
  employer_tenant_id uuid NOT NULL REFERENCES employer_tenants(id),
  account_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_tenant_id, account_id)
);

CREATE INDEX employer_tenant_members_account_idx
  ON employer_tenant_members(account_id, employer_tenant_id);

ALTER TABLE applications
  ADD COLUMN employer_tenant_id uuid REFERENCES employer_tenants(id);

CREATE INDEX applications_employer_tenant_status_created_idx
  ON applications(employer_tenant_id, status, created_at DESC)
  WHERE employer_tenant_id IS NOT NULL;

-- The raw identifier is encrypted. The lookup hash is populated only when
-- the dedicated identity-matching key is configured by the application layer.
ALTER TABLE users
  ADD COLUMN identity_document_type text,
  ADD COLUMN identity_document_number_encrypted bytea,
  ADD COLUMN identity_document_lookup_hash text,
  ADD CONSTRAINT users_identity_document_type_check CHECK (
    identity_document_type IS NULL
    OR identity_document_type IN ('NATIONAL_ID', 'PASSPORT')
  ),
  ADD CONSTRAINT users_identity_document_pair_check CHECK (
    (identity_document_type IS NULL AND identity_document_number_encrypted IS NULL AND identity_document_lookup_hash IS NULL)
    OR (identity_document_type IS NOT NULL AND identity_document_number_encrypted IS NOT NULL AND identity_document_lookup_hash ~ '^[0-9a-f]{64}$')
  );

CREATE INDEX users_identity_document_lookup_idx
  ON users(identity_document_type, identity_document_lookup_hash)
  WHERE identity_document_lookup_hash IS NOT NULL;
