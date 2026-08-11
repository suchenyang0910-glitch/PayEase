import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatHuman, type Currency } from "@payease/shared-money";

type EmploymentRow = Readonly<{
  id: string;
  employeeId: string;
  employeeName: string;
  employerTaxId: string;
  requestedAmountMinor: string;
  requestedCurrency: Currency;
  tenorDays: number;
  requestedAt: string;
  status: "PENDING_HR" | "APPROVED_HR" | "REJECTED_HR";
}>;

const MOCK_ROWS: ReadonlyArray<EmploymentRow> = [
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
    requestedAmountMinor: "500",
    requestedCurrency: "USD",
    tenorDays: 60,
    requestedAt: "2026-07-28T00:00:00+07:00",
    status: "APPROVED_HR",
  },
];

export function EmploymentListPage(): JSX.Element {
  const rows = useMemo(
    () => MOCK_ROWS.map((r) => ({ ...r, _formatted: formatHuman({ amountMinor: r.requestedAmountMinor, currency: r.requestedCurrency }) })),
    [],
  );
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1>HR Employment Verification — list (S0.5 mock only, no real API)</h1>
          <p style={{ color: "#555" }}>
            Frontend placeholder. Real cross-domain contract fetch is deferred to S1.0 MVP (after S0.2 isolation accounts are signed off).
            All amount fields are string minor units rendered via shared-money formatHuman to comply with CI-10.
          </p>
        </div>
        <Link to="/login" style={{ color: "#2563eb" }}>Sign out (mock)</Link>
      </header>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={{ padding: 10 }}>ID</th>
            <th style={{ padding: 10 }}>Employee</th>
            <th style={{ padding: 10 }}>Employer Tax ID</th>
            <th style={{ padding: 10 }}>Requested (shared-money render)</th>
            <th style={{ padding: 10 }}>Tenor</th>
            <th style={{ padding: 10 }}>Requested at</th>
            <th style={{ padding: 10 }}>Status</th>
            <th style={{ padding: 10 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{r.id.slice(-12)}</td>
              <td style={{ padding: 10 }}>{r.employeeName} <span style={{ color: "#777" }}>({r.employeeId})</span></td>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{r.employerTaxId}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{r._formatted}</td>
              <td style={{ padding: 10 }}>{r.tenorDays}d</td>
              <td style={{ padding: 10 }}>{r.requestedAt}</td>
              <td style={{ padding: 10 }}>{r.status}</td>
              <td style={{ padding: 10 }}>
                <Link to={`/employment/${r.id}`} style={{ color: "#2563eb" }}>Review</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
