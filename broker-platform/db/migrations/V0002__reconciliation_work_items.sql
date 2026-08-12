-- Controlled-pilot reconciliation work items. Apply after V0001.
CREATE TABLE reconciliation_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id),
  evidence_type text NOT NULL CHECK (evidence_type IN ('DISBURSEMENT_RECEIPT', 'REPAYMENT_RECEIPT')),
  evidence_reference text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'MATCHED', 'DIFFERENCE', 'CLOSED')),
  assigned_to_user_ref text,
  resolution_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (application_id, evidence_type, evidence_reference)
);

CREATE INDEX reconciliation_work_items_status_created_at_idx
  ON reconciliation_work_items(status, created_at DESC);
