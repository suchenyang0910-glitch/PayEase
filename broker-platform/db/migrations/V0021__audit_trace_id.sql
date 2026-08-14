-- Legacy rows predate request correlation. Preserve their immutable history
-- with a sentinel; all new application code supplies a request trace ID.
ALTER TABLE audit_events
  ADD COLUMN trace_id text NOT NULL DEFAULT 'legacy-unavailable';

ALTER TABLE audit_events
  ALTER COLUMN trace_id DROP DEFAULT;

CREATE INDEX audit_events_trace_id_idx ON audit_events(trace_id, occurred_at DESC);
