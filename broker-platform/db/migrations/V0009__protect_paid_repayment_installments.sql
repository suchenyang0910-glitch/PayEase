-- A pending installment may be marked paid once by its checker-approved flow.
-- Completed records are financial evidence and must never be edited or reverted.
CREATE OR REPLACE FUNCTION deny_paid_repayment_installment_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'PAID' THEN
    RAISE EXCEPTION 'paid repayment installment is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER repayment_installments_paid_immutable
  BEFORE UPDATE ON repayment_installments
  FOR EACH ROW EXECUTE FUNCTION deny_paid_repayment_installment_mutation();
