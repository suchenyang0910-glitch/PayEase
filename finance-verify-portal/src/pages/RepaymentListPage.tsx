import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatHuman } from "@payease/shared-money";
import { MOCK_REPAYMENT_ROWS } from "../mocks/fin-mocks.static";
import type { RepaymentRowMock } from "../mocks/fin-mocks.static";

export function RepaymentListPage(): JSX.Element {
  const rows = useMemo(
    () =>
      MOCK_REPAYMENT_ROWS.map((r: RepaymentRowMock) => ({
        ...r,
        _principal: formatHuman({
          amountMinor: r.principalDueAmountMinor,
          currency: r.currency,
        }),
      })),
    [],
  );
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1>
            Finance Repayment Schedule — list (S0.5 mock only, no real bank API)
          </h1>
          <p style={{ color: "#555", maxWidth: 920 }}>
            Finance sees only principal collection execution data. Borrower PII,
            lender identifiers, interest and full bill breakdown stay outside
            the employer finance boundary.
          </p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/reconciliation" style={{ color: "#9333ea" }}>
            Open reconciliation (mock)
          </Link>
          <Link to="/login" style={{ color: "#2563eb" }}>
            Sign out (mock)
          </Link>
        </div>
      </header>
      <table
        style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={{ padding: 10 }}>Due Date</th>
            <th style={{ padding: 10 }}>App ID</th>
            <th style={{ padding: 10, textAlign: "right" }}>Principal</th>
            <th style={{ padding: 10 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: 10 }}>{r.dueDate}</td>
              <td style={{ padding: 10, fontFamily: "monospace" }}>
                {r.applicationId}
              </td>
              <td
                data-testid={`principal-${r.id}`}
                style={{
                  padding: 10,
                  textAlign: "right",
                  fontFamily: "monospace",
                }}
              >
                {r._principal}
              </td>
              <td data-testid={`repay-status-${r.id}`} style={{ padding: 10 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "white",
                    backgroundColor:
                      r.status === "PAID"
                        ? "#16a34a"
                        : r.status === "OVERDUE"
                          ? "#dc2626"
                          : "#b45309",
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
