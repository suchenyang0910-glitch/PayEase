-- A returned review is an auditable request for supplementary information.
-- Each retry starts a new review round, allowing the same authorised account
-- to make a fresh decision without rewriting an append-only approval event.
ALTER TABLE applications
  ADD COLUMN review_round integer NOT NULL DEFAULT 1 CHECK (review_round >= 1),
  ADD COLUMN supplement_requested boolean NOT NULL DEFAULT false;

ALTER TABLE approval_events
  ADD COLUMN review_round integer NOT NULL DEFAULT 1 CHECK (review_round >= 1);

-- V0007 replaced the original table constraint with two partial indexes so
-- recurring repayment approvals can remain unique per installment.  Only the
-- non-repayment index changes for supplement review rounds; the repayment
-- index remains untouched and continues to enforce maker/checker integrity.
DROP INDEX IF EXISTS approval_events_non_repayment_actor_once_idx;

CREATE UNIQUE INDEX approval_events_non_repayment_actor_round_once_idx
  ON approval_events(application_id, stage, actor_user_ref, review_round)
  WHERE repayment_installment_no IS NULL;
