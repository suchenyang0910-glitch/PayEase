-- Keep default RBAC labels usable for Khmer-speaking operations staff.
-- Existing installations created before multilingual role labels were added
-- are corrected in place; fresh installations receive the same labels from
-- the bootstrap path.
UPDATE departments
SET display_name_km = 'ប្រតិបត្តិការវេទិកា'
WHERE code = 'OPS_ADMIN';

UPDATE roles
SET display_name_km = CASE code
  WHEN 'OPS_ADMIN' THEN 'អ្នកគ្រប់គ្រងវេទិកា'
  WHEN 'BROKER_OFFICER' THEN 'មន្ត្រីត្រួតពិនិត្យឯកសារ'
  WHEN 'LENDER_CREDIT_OFFICER' THEN 'មន្ត្រីពិនិត្យឥណទានដំបូង'
  WHEN 'LENDER_CREDIT_REVIEWER' THEN 'មន្ត្រីពិនិត្យឥណទានចុងក្រោយ'
  WHEN 'LENDER_CONTRACT_OFFICER' THEN 'មន្ត្រីកិច្ចសន្យា'
  WHEN 'LENDER_DISBURSEMENT_MAKER' THEN 'មន្ត្រីបញ្ចេញប្រាក់'
  WHEN 'LENDER_DISBURSEMENT_CHECKER' THEN 'មន្ត្រីត្រួតពិនិត្យការបញ្ចេញប្រាក់'
  WHEN 'LENDER_REPAYMENT_MAKER' THEN 'មន្ត្រីកត់ត្រាការសងប្រាក់'
  WHEN 'LENDER_REPAYMENT_CHECKER' THEN 'មន្ត្រីត្រួតពិនិត្យការសងប្រាក់'
  WHEN 'LENDER_COMPLAINT_OFFICER' THEN 'មន្ត្រីដោះស្រាយបណ្តឹង'
  WHEN 'EMPLOYER_HR' THEN 'មន្ត្រីផ្ទៀងផ្ទាត់ធនធានមនុស្ស'
  WHEN 'EMPLOYER_FINANCE' THEN 'មន្ត្រីផ្ទៀងផ្ទាត់ហិរញ្ញវត្ថុ'
  ELSE display_name_km
END
WHERE code IN (
  'OPS_ADMIN',
  'BROKER_OFFICER',
  'LENDER_CREDIT_OFFICER',
  'LENDER_CREDIT_REVIEWER',
  'LENDER_CONTRACT_OFFICER',
  'LENDER_DISBURSEMENT_MAKER',
  'LENDER_DISBURSEMENT_CHECKER',
  'LENDER_REPAYMENT_MAKER',
  'LENDER_REPAYMENT_CHECKER',
  'LENDER_COMPLAINT_OFFICER',
  'EMPLOYER_HR',
  'EMPLOYER_FINANCE'
);
