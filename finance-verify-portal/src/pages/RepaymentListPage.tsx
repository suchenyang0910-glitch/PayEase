import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatHuman, type Currency } from "@payease/shared-money";

type RepaymentRow = Readonly<{
  id: string;
  applicationId: string;
  borrowerName: string;
  lenderPartnerId: string;
  dueDate: string;
  principalDueAmountMinor: string;
  interestDueAmountMinor: string;
  totalDueAmountMinor: string;
  currency: Currency;
  status: "DUE" | "PAID" | "OVERDUE";
}>;

const MOCK_ROWS: ReadonlyArray<RepaymentRow> = [
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
    principalDueAmountMinor: "250",
    interestDueAmountMinor: "18",
    totalDueAmountMinor: "268",
    currency: "USD",
    status: "PAID",
  },
  {
    id: "rp-00000000-0000-0000-0000-000000000004",
    applicationId: "app-0004",
    borrowerName: "Horng Piseth",
    lenderPartnerId: "LENDER-B",
    dueDate: "2026-07-25",
    principalDueAmountMinor: "300",
    interestDueAmountMinor: "21",
    totalDueAmountMinor: "321",
    currency: "USD",
    status: "OVERDUE",
  },
];

export function RepaymentListPage(): JSX.Element {
  const rows = useMemo(
    () =>
      MOCK_ROWS.map((r) => ({
        ...r,
        _principal: formatHuman({ amountMinor: r.principalDueAmountMinor, currency: r.currency }),
        _interest: formatHuman({ amountMinor: r.interestDueAmountMinor, currency: r.currency }),
        _total: formatHuman({ amountMinor: r.totalDueAmountMinor, currency: r.currency }),
      })),
    [],
  );
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1>Finance Repayment Schedule — list (S0.5 mock only, no real bank API)</h1>
          <p style={{ color: "#555", maxWidth: 920 }}>
            Frontend placeholder. Real bank reconciliation / GL posting is deferred to S1.0 MVP (after S0.2 isolation accounts are signed off).
            All amount fields are string minor units rendered via shared-money formatHuman to comply with CI-10 (never JS number for KHR riel / USD cents).
          </p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/reconciliation" style={{ color: "#9333ea" }}>Open reconciliation (mock)</Link>
          <Link to="/login" style={{ color: "#2563eb" }}>Sign out (mock)</Link>
        </div>
      </header>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={{ padding: 10 }}>Due Date</th>
            <th style={{ padding: 10 }}>App ID</th>
            <th style={{ padding: 10 }}>Borrower</th>
            <th style={{ padding: 10 }}>Lender</th>
            <th style={{ padding: 10, textAlign: "right" }}>Principal</th>
            <th style={{ padding: 10, textAlign: "right" }}>Interest</th>
            <th style={{ padding: 10, textAlign: "right" }}>Total Due</th>
            <th style={{ padding: 10 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: 10 }}>{r.dueDate}</td>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{r.applicationId}</td>
              <td style={{ padding: 10 }}>{r.borrowerName}</td>
              <td style={{ padding: 10, fontFamily: "monospace" }}>{r.lenderPartnerId}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{r._principal}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{r._interest}</td>
              <td style={{ padding: 10, textAlign: "right", fontFamily: "monospace" }}>{r._total}</td>
              <td style={{ padding: 10 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "white",
                    backgroundColor:
                      r.status === "PAID" ? "#16a34a" : r.status === "OVERDUE" ? "#dc2626" : "#b45309",
                  }}
                >
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
