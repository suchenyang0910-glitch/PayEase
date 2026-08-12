import type { Currency, Money } from "@payease/shared-money";

export type ReconStatusMock =
  "MATCHED" | "DIFF_PENDING" | "DIFF_RESOLVED" | "UNMATCHED" | "POSTED_TO_GL";

export type RepaymentStatusMock = "DUE" | "PAID" | "OVERDUE";

export type RepaymentRowMock = Readonly<{
  id: string;
  applicationId: string;
  borrowerName: string;
  lenderPartnerId: string;
  dueDate: string;
  principalDueAmountMinor: string;
  interestDueAmountMinor: string;
  totalDueAmountMinor: string;
  currency: Currency;
  status: RepaymentStatusMock;
}>;

export type ReconLineMock = Readonly<{
  id: string;
  date: string;
  description: string;
  expected: Money;
  settled: Money;
  status: ReconStatusMock;
  reconStatusText: string;
}>;

export const MOCK_REPAYMENT_ROWS: ReadonlyArray<RepaymentRowMock> = [
  {
    id: "rp-00000000-0000-0000-0000-000000000001",
    applicationId: "app-0001",
    borrowerName: "Sok Dara",
    lenderPartnerId: "LENDER-A",
    dueDate: "2026-08-15",
    principalDueAmountMinor: "125000000",
    interestDueAmountMinor: "12500000",
    totalDueAmountMinor: "137500000",
    currency: "KHR",
    status: "DUE",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000002",
    applicationId: "app-0002",
    borrowerName: "Chea Srey Mom",
    lenderPartnerId: "LENDER-A",
    dueDate: "2026-08-17",
    principalDueAmountMinor: "75000000",
    interestDueAmountMinor: "5250000",
    totalDueAmountMinor: "80250000",
    currency: "KHR",
    status: "DUE",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000003",
    applicationId: "app-0003",
    borrowerName: "Pisey Lim",
    lenderPartnerId: "LENDER-B",
    dueDate: "2026-08-05",
    principalDueAmountMinor: "25000",
    interestDueAmountMinor: "1800",
    totalDueAmountMinor: "26800",
    currency: "USD",
    status: "PAID",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000004",
    applicationId: "app-0004",
    borrowerName: "Horng Piseth",
    lenderPartnerId: "LENDER-B",
    dueDate: "2026-07-25",
    principalDueAmountMinor: "30000",
    interestDueAmountMinor: "2100",
    totalDueAmountMinor: "32100",
    currency: "USD",
    status: "OVERDUE",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000005",
    applicationId: "app-0005",
    borrowerName: "Srey Mao",
    lenderPartnerId: "LENDER-C",
    dueDate: "2026-09-02",
    principalDueAmountMinor: "9500000",
    interestDueAmountMinor: "950000",
    totalDueAmountMinor: "10450000",
    currency: "KHR",
    status: "DUE",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000006",
    applicationId: "app-0006",
    borrowerName: "Chanthou Meng",
    lenderPartnerId: "LENDER-C",
    dueDate: "2026-06-18",
    principalDueAmountMinor: "42000",
    interestDueAmountMinor: "2940",
    totalDueAmountMinor: "44940",
    currency: "USD",
    status: "PAID",
  },
];

export const MOCK_RECON_LINES: ReadonlyArray<ReconLineMock> = [
  {
    id: "rc-1",
    date: "2026-08-05",
    description: "LENDER-B · app-0003 · principal + interest settled (MATCHED)",
    expected: { amountMinor: "26800", currency: "USD" },
    settled: { amountMinor: "26800", currency: "USD" },
    status: "MATCHED",
    reconStatusText: "MATCHED",
  },
  {
    id: "rc-2",
    date: "2026-08-07",
    description:
      "LENDER-A · app-0001 partial settlement (difference 5 KHR mock)",
    expected: { amountMinor: "137500000", currency: "KHR" },
    settled: { amountMinor: "137499995", currency: "KHR" },
    status: "DIFF_PENDING",
    reconStatusText: "DIFF_PENDING",
  },
  {
    id: "rc-3",
    date: "2026-08-08",
    description:
      "LENDER-B · app-0004 overdue penalty line — settlement pending",
    expected: { amountMinor: "32100", currency: "USD" },
    settled: { amountMinor: "0", currency: "USD" },
    status: "UNMATCHED",
    reconStatusText: "UNMATCHED",
  },
  {
    id: "rc-4",
    date: "2026-08-09",
    description:
      "LENDER-C · app-0006 late fee resolved by mutual agreement (DIFF_RESOLVED)",
    expected: { amountMinor: "44940", currency: "USD" },
    settled: { amountMinor: "44940", currency: "USD" },
    status: "DIFF_RESOLVED",
    reconStatusText: "DIFF_RESOLVED",
  },
  {
    id: "rc-5",
    date: "2026-08-10",
    description:
      "LENDER-A · app-0005 MATCHED netting batch posted to GL (mock only, no real posting)",
    expected: { amountMinor: "10450000", currency: "KHR" },
    settled: { amountMinor: "10450000", currency: "KHR" },
    status: "POSTED_TO_GL",
    reconStatusText: "POSTED_TO_GL",
  },
];

export const FINANCE_MOCK_FIELDS_MANIFEST: Readonly<Record<string, string>> = {
  id: "Synthetic placeholder IDs (rp-N / rc-N) with dash-N. Can never match real app/recon id schemes",
  applicationId:
    "Synthetic app-NNNNN numbers only; no real PayEase loan IDs; cannot match any real Lender-A/B/C settlement IDs.",
  borrowerName:
    "Placeholders; Khmer + English common combo; never correspond to real borrowers of any real lenders.",
  lenderPartnerId:
    "Synthetic LENDER-A / LENDER-B / LENDER-C only. NOT connected to real lender partner IDs.",
  principalDueAmountMinor:
    "String minor unit placeholder principal; rounded to convenient demo values (not real settlement amounts).",
  interestDueAmountMinor:
    "String minor unit placeholder interest; demo rounded placeholders 5%/7% 30-day approx only for display.",
  totalDueAmountMinor:
    "String minor unit placeholder sum of principal + interest placeholder; only demo calculation.",
  "expected.amountMinor":
    "String minor unit only, always; no JS number; placeholder expected-settlement figures.",
  "settled.amountMinor":
    "String minor unit only, always; no JS number; placeholder settled-settlement figures.",
};
