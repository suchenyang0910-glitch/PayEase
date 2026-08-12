-- Contractual terms are set by the licensed lender at final review.  The user
-- dashboard reads these immutable terms and the append-only payment schedule;
-- it never derives fees in the browser.
CREATE TABLE loan_terms (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  approved_amount_minor bigint NOT NULL CHECK (approved_amount_minor BETWEEN 1000 AND 50000),
  service_fee_minor bigint NOT NULL CHECK (service_fee_minor >= 0),
  total_repayable_minor bigint NOT NULL CHECK (total_repayable_minor >= approved_amount_minor + service_fee_minor),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 1 AND 6),
  first_due_date date NOT NULL,
  created_by_user_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE repayment_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  installment_no integer NOT NULL CHECK (installment_no > 0),
  due_date date NOT NULL,
  amount_due_minor bigint NOT NULL CHECK (amount_due_minor > 0),
  amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  paid_at timestamptz,
  UNIQUE (application_id, installment_no)
);

CREATE INDEX repayment_installments_application_due_idx
  ON repayment_installments(application_id, status, due_date);

CREATE TRIGGER repayment_installments_append_only_after_paid
  BEFORE DELETE ON repayment_installments
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
