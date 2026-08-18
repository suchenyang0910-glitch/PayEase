-- Temporary pre-launch factory for end-to-end applicant testing.
-- Remove this tenant with a dedicated follow-up migration after production go-live.
INSERT INTO employer_tenants (external_ref, display_name, is_active)
VALUES (
  'TEMP_PRELAUNCH_TEST_FACTORY',
  'Test Factory - Delete After Launch',
  true
)
ON CONFLICT (external_ref) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_active = true,
    updated_at = now();
