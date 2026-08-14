-- V1 accepts only full, checker-confirmed installment write-offs.  Preserve
-- that financial invariant at the database boundary as well as in the API:
-- a privileged or faulty client must not record an overpayment, a partial
-- payment, or a paid state without a timestamp.
ALTER TABLE repayment_installments
  ADD CONSTRAINT repayment_installments_paid_amount_integrity
  CHECK (
    (status = 'PENDING' AND amount_paid_minor = 0 AND paid_at IS NULL)
    OR
    (status = 'PAID' AND amount_paid_minor = amount_due_minor AND paid_at IS NOT NULL)
  );
