-- Application status is a financial and compliance state machine, not a
-- free-form progress label.  API route checks remain useful, but the database
-- must also reject a privileged or faulty caller that attempts to skip a
-- review, contract, disbursement, or repayment stage.
CREATE OR REPLACE FUNCTION enforce_application_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'SUBMITTED')
    OR (OLD.status = 'SUBMITTED' AND NEW.status = 'BROKER_REVIEW')
    OR (OLD.status = 'BROKER_REVIEW' AND NEW.status IN ('EMPLOYER_VERIFICATION', 'REJECTED'))
    OR (OLD.status = 'EMPLOYER_VERIFICATION' AND NEW.status IN ('EMPLOYER_FINANCE_VERIFICATION', 'REJECTED'))
    OR (OLD.status = 'EMPLOYER_FINANCE_VERIFICATION' AND NEW.status IN ('LENDER_INITIAL_REVIEW', 'REJECTED'))
    OR (OLD.status = 'LENDER_INITIAL_REVIEW' AND NEW.status IN ('LENDER_FINAL_REVIEW', 'REJECTED'))
    OR (OLD.status = 'LENDER_FINAL_REVIEW' AND NEW.status IN ('CONTRACT_PENDING', 'REJECTED'))
    OR (OLD.status = 'CONTRACT_PENDING' AND NEW.status IN ('USER_CONTRACT_CONFIRMED', 'CLOSED'))
    OR (OLD.status = 'USER_CONTRACT_CONFIRMED' AND NEW.status IN ('CONTRACT_CONFIRMED', 'CLOSED'))
    OR (OLD.status = 'CONTRACT_CONFIRMED' AND NEW.status = 'DISBURSEMENT_PENDING')
    OR (OLD.status = 'DISBURSEMENT_PENDING' AND NEW.status IN ('DISBURSED', 'CLOSED'))
    OR (OLD.status = 'DISBURSED' AND NEW.status = 'REPAYMENT_ACTIVE')
    OR (OLD.status = 'REPAYMENT_ACTIVE' AND NEW.status IN ('SETTLED', 'CLOSED'))
    OR (OLD.status = 'REJECTED' AND NEW.status = 'SUBMITTED')
  ) THEN
    RAISE EXCEPTION 'invalid application status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_status_transition_integrity
  BEFORE UPDATE OF status ON applications
  FOR EACH ROW EXECUTE FUNCTION enforce_application_status_transition();
