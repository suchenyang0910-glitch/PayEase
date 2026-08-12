-- A maker/checker pair is required for every repayment installment.  The
-- original application-stage uniqueness rule only allowed one repayment pair
-- for the life of an application, so it cannot represent a multi-period loan.
ALTER TABLE approval_events
  ADD COLUMN IF NOT EXISTS repayment_installment_no integer
  CHECK (repayment_installment_no IS NULL OR repayment_installment_no > 0);

ALTER TABLE approval_events
  DROP CONSTRAINT IF EXISTS approval_events_application_id_stage_actor_user_ref_key;

CREATE UNIQUE INDEX approval_events_non_repayment_actor_once_idx
  ON approval_events(application_id, stage, actor_user_ref)
  WHERE repayment_installment_no IS NULL;

CREATE UNIQUE INDEX approval_events_repayment_actor_once_idx
  ON approval_events(application_id, stage, actor_user_ref, repayment_installment_no)
  WHERE repayment_installment_no IS NOT NULL;
