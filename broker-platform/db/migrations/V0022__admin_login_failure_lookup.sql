-- The API derives the controlled-pilot login throttle from immutable audit
-- records, scoped to an opaque login-name hash. This index bounds that lookup
-- without storing a mutable counter or exposing a raw account identifier.
CREATE INDEX audit_events_admin_auth_actor_occurred_idx
  ON audit_events (actor_user_ref, occurred_at DESC)
  WHERE entity_type = 'ADMIN_AUTH'
    AND event_type IN ('AUTH_LOGIN_FAILURE', 'AUTH_LOGIN_SUCCESS');
