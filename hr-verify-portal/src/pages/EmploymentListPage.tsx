import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MOCK_EMPLOYMENT_ROWS } from "../mocks/hr-mocks.static";
import type { EmploymentRowMock } from "../mocks/hr-mocks.static";

export function EmploymentListPage(): JSX.Element {
  const rows = useMemo(() => MOCK_EMPLOYMENT_ROWS as EmploymentRowMock[], []);
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
            HR Employment Verification — list (S0.5 mock only, no real API)
          </h1>
          <p style={{ color: "#555" }}>
            HR sees only employment-verification references and outcomes. Loan
            amount, tenor, fees and lender-side details stay outside the
            employer boundary.
          </p>
        </div>
        <Link to="/login" style={{ color: "#2563eb" }}>
          Sign out (mock)
        </Link>
      </header>
      <table
        style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #333", textAlign: "left" }}>
            <th style={{ padding: 10 }}>ID</th>
            <th style={{ padding: 10 }}>Employee</th>
            <th style={{ padding: 10 }}>Employer Tax ID</th>
            <th style={{ padding: 10 }}>Requested at</th>
            <th style={{ padding: 10 }}>Status</th>
            <th style={{ padding: 10 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: 10, fontFamily: "monospace" }}>
                {r.id.slice(-12)}
              </td>
              <td style={{ padding: 10 }}>
                {r.employeeName}{" "}
                <span style={{ color: "#777" }}>({r.employeeId})</span>
              </td>
              <td style={{ padding: 10, fontFamily: "monospace" }}>
                {r.employerTaxId}
              </td>
              <td style={{ padding: 10 }}>{r.requestedAt}</td>
              <td data-testid={`status-${r.id}`} style={{ padding: 10 }}>
                {r.status}
              </td>
              <td style={{ padding: 10 }}>
                <Link to={`/employment/${r.id}`} style={{ color: "#2563eb" }}>
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
