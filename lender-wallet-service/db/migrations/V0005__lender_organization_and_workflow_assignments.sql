-- Administrative configuration stays inside lender_db.  It assigns eligible
-- operators to queues but does not grant a business action by itself: runtime
-- RBAC in the case workflow remains mandatory.

CREATE OR REPLACE FUNCTION set_lender_operator_configuration_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE lender_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_ref text NOT NULL UNIQUE CHECK (organization_ref ~ '^lorg_[A-Za-z0-9_-]{8,96}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lender_organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES lender_organizations(id),
  unit_ref text NOT NULL UNIQUE CHECK (unit_ref ~ '^lunit_[A-Za-z0-9_-]{8,96}$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lender_operator_account_units (
  account_id uuid NOT NULL REFERENCES lender_operator_accounts(id),
  unit_id uuid NOT NULL REFERENCES lender_organization_units(id),
  granted_by_ref text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, unit_id)
);

CREATE TABLE lender_workflow_stage_assignments (
  stage text PRIMARY KEY CHECK (stage IN (
    'KYC_AML_REVIEW', 'CREDIT_REVIEW', 'CREDIT_APPROVAL', 'CONTRACT_MAKER',
    'CONTRACT_CHECKER', 'DISBURSEMENT_MAKER', 'DISBURSEMENT_CHECKER',
    'SERVICING', 'COMPLAINT'
  )),
  primary_account_id uuid REFERENCES lender_operator_accounts(id),
  backup_account_id uuid REFERENCES lender_operator_accounts(id),
  updated_by_ref text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (primary_account_id IS NULL OR backup_account_id IS NULL OR primary_account_id <> backup_account_id)
);

CREATE TRIGGER lender_organizations_updated_at
  BEFORE UPDATE ON lender_organizations
  FOR EACH ROW EXECUTE FUNCTION set_lender_operator_configuration_updated_at();

CREATE TRIGGER lender_organization_units_updated_at
  BEFORE UPDATE ON lender_organization_units
  FOR EACH ROW EXECUTE FUNCTION set_lender_operator_configuration_updated_at();
