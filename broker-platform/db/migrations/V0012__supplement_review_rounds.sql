-- A returned review is an auditable request for supplementary information.
-- Each retry starts a new review round, allowing the same authorised account
-- to make a fresh decision without rewriting an append-only approval event.
ALTER TABLE applications
  ADD COLUMN review_round integer NOT NULL DEFAULT 1 CHECK (review_round >= 1),
  ADD COLUMN supplement_requested boolean NOT NULL DEFAULT false;

ALTER TABLE approval_events
  ADD COLUMN review_round integer NOT NULL DEFAULT 1 CHECK (review_round >= 1);

ALTER TABLE approval_events
  DROP CONSTRAINT approval_events_application_id_stage_actor_user_ref_key;

ALTER TABLE approval_events
  ADD CONSTRAINT approval_events_application_stage_actor_round_key
  UNIQUE (application_id, stage, actor_user_ref, review_round);
