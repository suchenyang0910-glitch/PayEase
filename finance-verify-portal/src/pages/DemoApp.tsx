import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "32px auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {children}
    </main>
  );
}

function Login(): JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell>
      <h1>PayEase Finance demo</h1>
      <p>受控演示 · Controlled demo · ការបង្ហាញដែលបានគ្រប់គ្រង</p>
      <p>
        Synthetic reconciliation data only. No payment, settlement, or
        accounting action is submitted.
      </p>
      <button onClick={() => void navigate("/repayment/list")}>
        Enter demo
      </button>
    </Shell>
  );
}

function RepaymentList(): JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell>
      <h1>Repayment schedule — demo</h1>
      <p>
        Only synthetic ledger references are shown. Customer identity and
        payment-channel details are excluded.
      </p>
      <table>
        <thead>
          <tr>
            <th>Ledger reference</th>
            <th>Due date</th>
            <th>Currency</th>
            <th>Total due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DEMO-LEDGER-001</td>
            <td>2026-08-30</td>
            <td>USD</td>
            <td>125.00</td>
            <td>SCHEDULED</td>
          </tr>
          <tr>
            <td>DEMO-LEDGER-002</td>
            <td>2026-09-06</td>
            <td>KHR</td>
            <td>500,000</td>
            <td>RECONCILIATION REQUIRED</td>
          </tr>
        </tbody>
      </table>
      <p>
        <button onClick={() => void navigate("/reconciliation")}>
          Open reconciliation demo
        </button>
      </p>
    </Shell>
  );
}

function Reconciliation(): JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell>
      <h1>Reconciliation — demo</h1>
      <p>
        Comparison is shown for training only. Assigning an item does not create
        a work order or write any ledger entry.
      </p>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Expected</th>
            <th>Observed</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DEMO-RECON-001</td>
            <td>USD 125.00</td>
            <td>USD 125.00</td>
            <td>MATCHED</td>
          </tr>
          <tr>
            <td>DEMO-RECON-002</td>
            <td>KHR 500,000</td>
            <td>KHR 0</td>
            <td>DIFFERENCE</td>
          </tr>
        </tbody>
      </table>
      <button onClick={() => void navigate("/repayment/list")}>
        Back to schedule
      </button>
    </Shell>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/repayment/list" element={<RepaymentList />} />
      <Route path="/reconciliation" element={<Reconciliation />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
