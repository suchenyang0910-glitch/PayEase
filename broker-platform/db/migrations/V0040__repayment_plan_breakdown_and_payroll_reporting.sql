ALTER TABLE employer_payroll_rules
  ADD COLUMN payroll_nodes jsonb;

CREATE OR REPLACE FUNCTION ensure_employer_payroll_rule_nodes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payroll_nodes IS NULL THEN
    NEW.payroll_nodes := jsonb_build_array(
      jsonb_build_object(
        'nodeRef', 'PAYDAY-1',
        'scheduleType', 'FIXED_DAY',
        'dayOfMonth', NEW.collection_day_of_month
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employer_payroll_rules_default_nodes
  BEFORE INSERT OR UPDATE OF collection_day_of_month, payroll_nodes
  ON employer_payroll_rules
  FOR EACH ROW
  EXECUTE FUNCTION ensure_employer_payroll_rule_nodes();

UPDATE employer_payroll_rules
SET payroll_nodes = jsonb_build_array(
  jsonb_build_object(
    'nodeRef', 'PAYDAY-1',
    'scheduleType', 'FIXED_DAY',
    'dayOfMonth', collection_day_of_month
  )
)
WHERE payroll_nodes IS NULL;

ALTER TABLE employer_payroll_rules
  ALTER COLUMN payroll_nodes SET NOT NULL;

ALTER TABLE employer_payroll_rules
  ADD CONSTRAINT employer_payroll_rules_payroll_nodes_shape_check
    CHECK (
      jsonb_typeof(payroll_nodes) = 'array'
      AND jsonb_array_length(payroll_nodes) BETWEEN 1 AND 2
    );

ALTER TABLE repayment_installments
  ADD COLUMN principal_due_minor bigint,
  ADD COLUMN lender_interest_due_minor bigint,
  ADD COLUMN payroll_node_ref text;

UPDATE repayment_installments
SET
  principal_due_minor = amount_due_minor,
  lender_interest_due_minor = 0
WHERE principal_due_minor IS NULL
   OR lender_interest_due_minor IS NULL;

ALTER TABLE repayment_installments
  ALTER COLUMN principal_due_minor SET NOT NULL,
  ALTER COLUMN lender_interest_due_minor SET NOT NULL;

ALTER TABLE repayment_installments
  ADD CONSTRAINT repayment_installments_amount_breakdown_check
    CHECK (
      principal_due_minor >= 0
      AND lender_interest_due_minor >= 0
      AND amount_due_minor = principal_due_minor + lender_interest_due_minor
    );

ALTER TABLE employer_payroll_collection_instructions
  ADD COLUMN reported_collection_result text CHECK (
    reported_collection_result IN (
      'COLLECTED',
      'PARTIALLY_COLLECTED',
      'NOT_COLLECTED'
    )
  ),
  ADD COLUMN reported_actual_amount_minor bigint CHECK (
    reported_actual_amount_minor >= 0
  ),
  ADD COLUMN reported_evidence_reference text;
