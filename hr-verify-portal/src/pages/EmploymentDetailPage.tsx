import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatHuman } from "@payease/shared-money";

type EmploymentDetail = Readonly<{
  id: string;
  employeeId: string;
  employeeName: string;
  nationalIdLast4: string;
  department: string;
  hiredAt: string;
  monthlyBaseSalaryAmountMinor: string;
  monthlyBaseSalaryCurrency: "KHR" | "USD";
  employerTaxId: string;
  requestedLoanAmountMinor: string;
  requestedLoanCurrency: "KHR" | "USD";
  tenorDays: number;
  verificationStatus: "PENDING_HR" | "APPROVED_HR" | "REJECTED_HR";
  requestedAt: string;
  notes: string;
}>;

const MOCK_DETAILS: ReadonlyArray<EmploymentDetail> = [
  {
    id: "ev-00000000-0000-0000-0000-000000000001",
    employeeId: "EMP-2025-0001",
    employeeName: "Sok Dara",
    nationalIdLast4: "1044",
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
    notes: "Confirm employment tenure and net salary via HR stub.",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000002",
    employeeId: "EMP-2024-0112",
    employeeName: "Chea Srey Mom",
    nationalIdLast4: "3312",
    department: "Finance Admin",
    hiredAt: "2024-03-12",
    monthlyBaseSalaryAmountMinor: "410",
    monthlyBaseSalaryCurrency: "USD",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "150000000",
    requestedLoanCurrency: "KHR",
    tenorDays: 14,
    verificationStatus: "PENDING_HR",
    requestedAt: "2026-08-03T09:12:00+07:00",
    notes: "Payroll deduction confirmation required.",
  },
  {
    id: "ev-00000000-0000-0000-0000-000000000003",
    employeeId: "EMP-2023-1044",
    employeeName: "Pisey Lim",
    nationalIdLast4: "9021",
    department: "Sales",
    hiredAt: "2023-11-20",
    monthlyBaseSalaryAmountMinor: "1200",
    monthlyBaseSalaryCurrency: "USD",
    employerTaxId: "KH-EM-000001",
    requestedLoanAmountMinor: "500",
    requestedLoanCurrency: "USD",
    tenorDays: 60,
    verificationStatus: "APPROVED_HR",
    requestedAt: "2026-07-28T00:00:00+07:00",
    notes: "Pre-approved via HR stub upload (mock).",
  },
];

export function EmploymentDetailPage(): JSX.Element {
  const { id = "" } = useParams();
  const detail = useMemo(() => MOCK_DETAILS.find((d) => d.id === id), [id]);
  const [localStatus, setLocalStatus] = useState<EmploymentDetail["verificationStatus"] | null>(null);

  if (!detail) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Employment verification not found (S0.5 mock)</h1>
        <Link to="/employment/list" style={{ color: "#2563eb" }}>Back to list</Link>
      </main>
    );
  }

  const status = localStatus ?? detail.verificationStatus;

  const approve = () => {
    // S0.5 constraint: THIS IS FRONTEND ONLY. Do NOT emit fetch()/XMLHttpRequest() for real partner-contracts APIs.
    // S1.0 MVP contract (after S0.2 infra signed off): POST /partner-contracts/v1/hr/employment/{id}/approve via Zod envelope
    setLocalStatus("APPROVED_HR");
  };
  const reject = () => {
    setLocalStatus("REJECTED_HR");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1>HR Employment Verification Detail — (S0.5 mock, no real POST API)</h1>
        <Link to="/employment/list" style={{ color: "#2563eb" }}>Back to list</Link>
      </header>
      <dl style={{ display: "grid", gridTemplateColumns: "220px 1fr", rowGap: 6, maxWidth: 880 }}>
        <dt>Verification ID</dt><dd style={{ fontFamily: "monospace" }}>{detail.id}</dd>
        <dt>Employee ID</dt><dd>{detail.employeeId}</dd>
        <dt>Employee name</dt><dd>{detail.employeeName}</dd>
        <dt>National ID (last 4)</dt><dd style={{ fontFamily: "monospace" }}>{detail.nationalIdLast4}</dd>
        <dt>Department</dt><dd>{detail.department}</dd>
        <dt>Hired at</dt><dd>{detail.hiredAt}</dd>
        <dt>Employer tax ID</dt><dd style={{ fontFamily: "monospace" }}>{detail.employerTaxId}</dd>
        <dt>Monthly base salary</dt>
        <dd style={{ textAlign: "right", fontFamily: "monospace" }}>
          {formatHuman({ amountMinor: detail.monthlyBaseSalaryAmountMinor, currency: detail.monthlyBaseSalaryCurrency })}
        </dd>
        <dt>Requested loan amount</dt>
        <dd style={{ textAlign: "right", fontFamily: "monospace" }}>
          {formatHuman({ amountMinor: detail.requestedLoanAmountMinor, currency: detail.requestedLoanCurrency })}
        </dd>
        <dt>Tenor</dt><dd>{detail.tenorDays} calendar days</dd>
        <dt>Requested at</dt><dd>{detail.requestedAt}</dd>
        <dt>HR verification status</dt><dd><strong>{status}</strong></dd>
        <dt>Notes</dt><dd style={{ color: "#555" }}>{detail.notes}</dd>
      </dl>
      <section style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button
          onClick={approve}
          disabled={status !== "PENDING_HR"}
          style={{
            padding: "10px 18px",
            backgroundColor: status !== "PENDING_HR" ? "#ccc" : "#16a34a",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: status !== "PENDING_HR" ? "not-allowed" : "pointer",
          }}
        >
          Mark as HR Verified (frontend mock only)
        </button>
        <button
          onClick={reject}
          disabled={status !== "PENDING_HR"}
          style={{
            padding: "10px 18px",
            backgroundColor: status !== "PENDING_HR" ? "#ccc" : "#dc2626",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: status !== "PENDING_HR" ? "not-allowed" : "pointer",
          }}
        >
          Reject (frontend mock only)
        </button>
      </section>
      <p style={{ marginTop: 20, color: "#777", fontSize: 13 }}>
        S0.5 note: Approve/Reject actions are stored ONLY in React component state. No API calls, no persistence, no events emitted to broker/lender/employer domains.
        Upgrade to real partner-contracts v1 envelope (with idempotency key) only when S0.2 isolation infrastructure is signed off.
      </p>
    </main>
  );
}
