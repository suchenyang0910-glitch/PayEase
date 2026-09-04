CREATE TRIGGER kyc_location_evidence_append_only
  BEFORE UPDATE OR DELETE ON kyc_location_evidence
  FOR EACH ROW EXECUTE FUNCTION deny_event_mutation();
