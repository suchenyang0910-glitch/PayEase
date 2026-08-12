import type { Currency } from "@payease/shared-money";

export type HrVerificationStatus =
  "PENDING_HR" | "APPROVED_HR" | "REJECTED_HR" | "UNDER_REVIEW" | "EXPIRED";

export type EmploymentRowMock = Readonly<{
  id: string;
  employeeId: string;
  employeeName: string;
  employerTaxId: string;
  requestedAmountMinor: string;
  requestedCurrency: Currency;
  tenorDays: number;
  requestedAt: string;
  status: HrVerificationStatus;
}>;

export type EmploymentDetailMock = Readonly<{
  id: string;
  employeeId: string;
  employeeName: string;
  nationalIdLast4: string;
  department: string;
  hiredAt: string;
  monthlyBaseSalaryAmountMinor: string;
  monthlyBaseSalaryCurrency: Currency;
  employerTaxId: string;
  requestedLoanAmountMinor: string;
  requestedLoanCurrency: Currency;
  tenorDays: number;
  verificationStatus: HrVerificationStatus;
  requestedAt: string;
  notes: string;
}>;

export const MOCK_EMPLOYMENT_ROWS: ReadonlyArray<EmploymentRowMock> = [
  {
    id: "ev-00000000-0000-0000-0000-000000000001",
    employeeId: "EMP-2025-0001",
    employeeName: "Sok Dara",
    employerTaxId: "KH-EM-000001",
    requestedAmountMinor: "250000000",
    requestedCurrency: "KHR",
    tenorDays: 30,
    requestedAt: "2026-08-01T02:30:00+07:00",
    status: "PENDING_HR",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000002",
    employeeId: "EMP-2024-0112",
    employeeName: "Chea Srey Mom",
    employerTaxId: "KH-EM-000001",
    requestedAmountMinor: "150000000",
    requestedCurrency: "KHR",
    tenorDays: 14,
    requestedAt: "2026-08-03T09:12:00+07:00",
    status: "PENDING_HR",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000003",
    employeeId: "EMP-2023-1044",
    employeeName: "Pisey Lim",
    employerTaxId: "KH-EM-000001",
    requestedAmountMinor: "50000",
    requestedCurrency: "USD",
    tenorDays: 60,
    requestedAt: "2026-07-28T00:00:00+07:00",
    status: "APPROVED_HR",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000004",
    employeeId: "EMP-2022-0512",
    employeeName: "Horng Piseth",
    employerTaxId: "KH-EM-000002",
    requestedAmountMinor: "75000",
    requestedCurrency: "USD",
    tenorDays: 45,
    requestedAt: "2026-07-12T16:45:00+07:00",
    status: "UNDER_REVIEW",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000005",
    employeeId: "EMP-2021-0019",
    employeeName: "Srey Mao",
    employerTaxId: "KH-EM-000002",
    requestedAmountMinor: "180000000",
    requestedCurrency: "KHR",
    tenorDays: 21,
    requestedAt: "2026-05-20T11:20:00+07:00",
    status: "REJECTED_HR",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000006",
    employeeId: "EMP-2020-0888",
    employeeName: "Chanthou Meng",
    employerTaxId: "KH-EM-000003",
    requestedAmountMinor: "9000000",
    requestedCurrency: "KHR",
    tenorDays: 10,
    requestedAt: "2026-04-02T08:00:00+07:00",
    status: "EXPIRED",
  },
];

export const MOCK_EMPLOYMENT_DETAILS: ReadonlyArray<EmploymentDetailMock> = [
  {
    id: "ev-00000000-0000-0000-0000-000000000001",
    employeeId: "EMP-2025-0001",
    employeeName: "Sok Dara",
    nationalIdLast4: "0001",
    department: "Operations",
    hiredAt: "2025-01-05",
    monthlyBaseSalaryAmountMinor: "650000000",
    monthlyBaseSalaryCurrency: "KHR",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "250000000",
    requestedLoanCurrency: "KHR",
    tenorDays: 30,
    verificationStatus: "PENDING_HR",
    requestedAt: "2026-08-01T02:30:00+07:00",
    notes: "Confirm employment tenure and net salary via HR stub (mock).",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000002",
    employeeId: "EMP-2024-0112",
    employeeName: "Chea Srey Mom",
    nationalIdLast4: "0012",
    department: "Finance Admin",
    hiredAt: "2024-03-12",
    monthlyBaseSalaryAmountMinor: "41000",
    monthlyBaseSalaryCurrency: "USD",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "150000000",
    requestedLoanCurrency: "KHR",
    tenorDays: 14,
    verificationStatus: "PENDING_HR",
    requestedAt: "2026-08-03T09:12:00+07:00",
    notes: "Payroll deduction confirmation required (mock).",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000003",
    employeeId: "EMP-2023-1044",
    employeeName: "Pisey Lim",
    nationalIdLast4: "1044",
    department: "Sales",
    hiredAt: "2023-11-20",
    monthlyBaseSalaryAmountMinor: "120000",
    monthlyBaseSalaryCurrency: "USD",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "50000",
    requestedLoanCurrency: "USD",
    tenorDays: 60,
    verificationStatus: "APPROVED_HR",
    requestedAt: "2026-07-28T00:00:00+07:00",
    notes: "Pre-approved via HR stub upload (mock).",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000004",
    employeeId: "EMP-2022-0512",
    employeeName: "Horng Piseth",
    nationalIdLast4: "0512",
    department: "Customer Support",
    hiredAt: "2022-06-09",
    monthlyBaseSalaryAmountMinor: "38000",
    monthlyBaseSalaryCurrency: "USD",
    employerTaxId: "KH-EM-000002",
    requestedLoanAmountMinor: "75000",
    requestedLoanCurrency: "USD",
    tenorDays: 45,
    verificationStatus: "UNDER_REVIEW",
    requestedAt: "2026-07-12T16:45:00+07:00",
    notes: "Escalated to HR manager for secondary check (mock).",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000005",
    employeeId: "EMP-2021-0019",
    employeeName: "Srey Mao",
    nationalIdLast4: "0019",
    department: "Logistics",
    hiredAt: "2021-02-14",
    monthlyBaseSalaryAmountMinor: "280000000",
    monthlyBaseSalaryCurrency: "KHR",
    employerTaxId: "KH-EM-000002",
    requestedLoanAmountMinor: "180000000",
    requestedLoanCurrency: "KHR",
    tenorDays: 21,
    verificationStatus: "REJECTED_HR",
    requestedAt: "2026-05-20T11:20:00+07:00",
    notes: "Employment ended; tenureshort 3 months; not yet eligible (mock).",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000006",
    employeeId: "EMP-2020-0888",
    employeeName: "Chanthou Meng",
    nationalIdLast4: "0888",
    department: "Admin",
    hiredAt: "2020-09-01",
    monthlyBaseSalaryAmountMinor: "220000000",
    monthlyBaseSalaryCurrency: "KHR",
    employerTaxId: "KH-EM-000003",
    requestedLoanAmountMinor: "9000000",
    requestedLoanCurrency: "KHR",
    tenorDays: 10,
    verificationStatus: "EXPIRED",
    requestedAt: "2026-04-02T08:00:00+07:00",
    notes: "Verification request expired after 45-day SLA (mock).",
  },
];

export const HR_MOCK_FIELDS_MANIFEST: Readonly<Record<string, string>> = {
  id: "Synthetic UUID v4 placeholder, always starts with ev-00000000-0000-0000-0000- so it cannot match any real PayEase verification UUID.",
  employeeId:
    "Synthetic EMP-YYYY-NNNN format. YYYY is hire-year placeholder; NNNN cannot match any real employee ID of PayEase employers.",
  employeeName:
    "Synthetic Khmer + English mixed placeholder names. NEVER use the full names, real PayEase staff or customer names.",
  nationalIdLast4:
    "Placeholder last-4 digit only (0000, 0012 etc). Never match any real Khmer National ID Card or passport number.",
  employerTaxId:
    "Synthetic KH-EM-NNNNNN. Never correspond to real Cambodian MoPF/GDT-registered tax identifiers.",
  monthlyBaseSalaryAmountMinor:
    "String minor unit placeholder salary demo-only numbers rounded to convenient tens of KHR 500k/USD20 increments so they look realistic yet synthetic for presentation only.",
  requestedLoanAmountMinor:
    "String minor unit placeholder loan amounts, picked rounded values; not calculated using the product of tenor product matrix (PENDING -> Appropriate for tenor UI demo only.",
};
