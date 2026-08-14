-- Complaint outcomes are legally and operationally distinct from credit,
-- contract, disbursement and repayment actions.  Seed a dedicated lender role
-- for both fresh and already-bootstrapped environments; account assignment is
-- still performed by a platform administrator through the RBAC console.
INSERT INTO roles
  (domain, code, display_name_zh, display_name_en, display_name_km)
VALUES
  ('LENDER', 'LENDER_COMPLAINT_OFFICER', '投诉处理专员', 'Lender complaint officer', 'មន្ត្រីដោះស្រាយបណ្តឹង')
ON CONFLICT (code) DO NOTHING;
