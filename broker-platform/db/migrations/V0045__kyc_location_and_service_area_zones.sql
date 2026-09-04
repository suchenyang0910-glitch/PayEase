CREATE TABLE service_area_zone_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_ref text NOT NULL CHECK (zone_ref ~ '^ZONE-[A-Z0-9-]{3,64}$'),
  version integer NOT NULL CHECK (version >= 1),
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 160),
  scope_type text NOT NULL CHECK (scope_type IN ('PLATFORM', 'EMPLOYER_TENANT')),
  employer_tenant_id uuid REFERENCES employer_tenants(id),
  polygon_geojson jsonb NOT NULL CHECK (polygon_geojson->>'type' = 'Polygon'),
  polygon_bbox jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'RETIRED')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  change_reason text NOT NULL CHECK (char_length(trim(change_reason)) BETWEEN 1 AND 500),
  created_by_user_ref text NOT NULL,
  submitted_by_user_ref text,
  submitted_at timestamptz,
  reviewed_by_user_ref text,
  reviewed_at timestamptz,
  activated_by_user_ref text,
  activated_at timestamptz,
  retired_by_user_ref text,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_ref, version),
  CHECK (
    (scope_type = 'PLATFORM' AND employer_tenant_id IS NULL) OR
    (scope_type = 'EMPLOYER_TENANT' AND employer_tenant_id IS NOT NULL)
  ),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (submitted_at IS NULL OR submitted_at >= created_at),
  CHECK (reviewed_at IS NULL OR reviewed_at >= created_at),
  CHECK (activated_at IS NULL OR activated_at >= created_at),
  CHECK (retired_at IS NULL OR retired_at >= created_at),
  CHECK (reviewed_by_user_ref IS NULL OR reviewed_by_user_ref <> created_by_user_ref),
  CHECK (activated_by_user_ref IS NULL OR activated_by_user_ref <> created_by_user_ref)
);

CREATE INDEX service_area_zone_versions_scope_idx
  ON service_area_zone_versions(scope_type, employer_tenant_id, status, effective_from DESC);

CREATE INDEX service_area_zone_versions_zone_ref_idx
  ON service_area_zone_versions(zone_ref, version DESC);

CREATE OR REPLACE FUNCTION service_area_zone_versions_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service area zone versions are immutable history and cannot be deleted';
  END IF;

  IF OLD.status <> 'DRAFT' AND (
    NEW.zone_ref IS DISTINCT FROM OLD.zone_ref OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.display_name IS DISTINCT FROM OLD.display_name OR
    NEW.scope_type IS DISTINCT FROM OLD.scope_type OR
    NEW.employer_tenant_id IS DISTINCT FROM OLD.employer_tenant_id OR
    NEW.polygon_geojson IS DISTINCT FROM OLD.polygon_geojson OR
    NEW.polygon_bbox IS DISTINCT FROM OLD.polygon_bbox OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.effective_until IS DISTINCT FROM OLD.effective_until
  ) THEN
    RAISE EXCEPTION 'only DRAFT service area zone versions may change scope or polygon fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_area_zone_versions_guard_trigger
  BEFORE UPDATE OR DELETE ON service_area_zone_versions
  FOR EACH ROW EXECUTE FUNCTION service_area_zone_versions_guard();

CREATE OR REPLACE FUNCTION service_area_zone_versions_overlap_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  conflicting_id uuid;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT id
    INTO conflicting_id
    FROM service_area_zone_versions existing
   WHERE existing.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND existing.status = 'ACTIVE'
     AND existing.zone_ref = NEW.zone_ref
     AND existing.scope_type = NEW.scope_type
     AND (
       (NEW.scope_type = 'PLATFORM' AND existing.employer_tenant_id IS NULL) OR
       (NEW.scope_type = 'EMPLOYER_TENANT' AND existing.employer_tenant_id = NEW.employer_tenant_id)
     )
     AND tstzrange(existing.effective_from, COALESCE(existing.effective_until, 'infinity'::timestamptz), '[)')
         && tstzrange(NEW.effective_from, COALESCE(NEW.effective_until, 'infinity'::timestamptz), '[)')
   LIMIT 1;

  IF conflicting_id IS NOT NULL THEN
    RAISE EXCEPTION 'active service area zone effective range overlaps an existing version of the same zone_ref';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_area_zone_versions_overlap_guard_trigger
  BEFORE INSERT OR UPDATE ON service_area_zone_versions
  FOR EACH ROW EXECUTE FUNCTION service_area_zone_versions_overlap_guard();

CREATE TABLE kyc_location_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_ref text NOT NULL UNIQUE CHECK (evidence_ref ~ '^KYCLOC-[A-Z0-9]{8,32}$'),
  user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES applications(id),
  latitude_encrypted bytea NOT NULL,
  longitude_encrypted bytea NOT NULL,
  horizontal_accuracy_encrypted bytea NOT NULL,
  captured_at_encrypted bytea NOT NULL,
  consent_version text NOT NULL CHECK (consent_version ~ '^[A-Z0-9_]{3,64}$'),
  source text NOT NULL CHECK (source = 'TELEGRAM_LOCATION_MANAGER'),
  pii_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kyc_location_evidence_user_idx
  ON kyc_location_evidence(user_id, created_at DESC);

CREATE INDEX kyc_location_evidence_application_idx
  ON kyc_location_evidence(application_id, created_at DESC);

CREATE TABLE kyc_location_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES kyc_location_evidence(id),
  user_id uuid NOT NULL REFERENCES users(id),
  application_id uuid REFERENCES applications(id),
  assessment_result text NOT NULL CHECK (
    assessment_result IN ('MATCH', 'OUT_OF_ZONE', 'OUT_OF_COUNTRY', 'LOW_ACCURACY', 'UNAVAILABLE')
  ),
  assessed_scope_type text NOT NULL CHECK (assessed_scope_type IN ('PLATFORM', 'EMPLOYER_TENANT')),
  employer_tenant_id uuid REFERENCES employer_tenants(id),
  matched_zone_ref text,
  matched_zone_version integer,
  rule_version text NOT NULL CHECK (rule_version ~ '^[A-Z0-9._-]{3,64}$'),
  actor_user_ref text NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (matched_zone_ref IS NULL AND matched_zone_version IS NULL) OR
    (matched_zone_ref IS NOT NULL AND matched_zone_version IS NOT NULL)
  )
);

CREATE INDEX kyc_location_assessments_user_idx
  ON kyc_location_assessments(user_id, assessed_at DESC);

CREATE INDEX kyc_location_assessments_application_idx
  ON kyc_location_assessments(application_id, assessed_at DESC);

CREATE TRIGGER kyc_location_assessments_append_only
  BEFORE UPDATE OR DELETE ON kyc_location_assessments
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();

CREATE TABLE admin_action_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name text NOT NULL CHECK (action_name IN (
    'SERVICE_AREA_ZONE_CREATE',
    'SERVICE_AREA_ZONE_PATCH',
    'SERVICE_AREA_ZONE_SUBMIT_REVIEW',
    'SERVICE_AREA_ZONE_REVIEW',
    'SERVICE_AREA_ZONE_ACTIVATE',
    'SERVICE_AREA_ZONE_RETIRE',
    'KYC_LOCATION_REVIEW_VIEW'
  )),
  actor_user_ref text NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_name, actor_user_ref, idempotency_key)
);

CREATE INDEX admin_action_idempotency_action_idx
  ON admin_action_idempotency(action_name, actor_user_ref, completed_at DESC);

CREATE TRIGGER admin_action_idempotency_append_only
  BEFORE UPDATE OR DELETE ON admin_action_idempotency
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
